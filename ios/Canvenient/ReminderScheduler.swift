import Foundation
import UserNotifications
import CanvenientKit

/// Local notifications so the phone nudges on its own, with no server and
/// no APNs: one per class in the next 7 days (15 minutes before start) and
/// one per task due within 48 hours (an hour before). The set is rebuilt
/// from scratch after every successful schedule/tasks refresh, so imports
/// and edits reshuffle reminders automatically. Total pending requests stay
/// under the system's 64 cap.
@MainActor
enum ReminderScheduler {
    static func installForegroundPresenter() {
        UNUserNotificationCenter.current().delegate = ForegroundNotifier.shared
    }

    /// Called once per sign-in so the system prompt appears at a moment the
    /// user understands, not out of nowhere at first launch. Automated runs
    /// pass the -skipNotificationPrompt launch argument to keep going.
    static func requestAuthorization() async {
        if ProcessInfo.processInfo.arguments.contains("-skipNotificationPrompt") { return }
        _ = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }

    static func removeAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    static func regenerate(schedule: ScheduleResponse, tasks: [TaskOut]) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized
                    || settings.authorizationStatus == .provisional else { return }
            let requests = buildRequests(schedule: schedule, tasks: tasks)
            Task { @MainActor in
                center.removeAllPendingNotificationRequests()
                for request in requests {
                    center.add(request)
                }
                #if DEBUG
                NSLog("CanvenientReminders: scheduled %d notifications", requests.count)
                #endif
            }
        }
    }

    private static func buildRequests(schedule: ScheduleResponse, tasks: [TaskOut]) -> [UNNotificationRequest] {
        var requests: [UNNotificationRequest] = []
        let calendar = SGTime.calendar

        if Preferences.bool(Preferences.classRemindersEnabled, default: true) {
            for dayOffset in 0..<7 {
                guard let day = calendar.date(byAdding: .day, value: dayOffset,
                                              to: SGTime.startOfDay(Date())) else { continue }
                for item in ScheduleEngine.items(for: schedule, on: day) {
                    let fireAt = item.start.addingTimeInterval(-15 * 60)
                    guard fireAt > Date() else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = "\(item.title) in 15 minutes"
                    content.body = item.venue.isEmpty ? item.subtitle : item.venue
                    content.sound = .default
                    let id = "class-\(item.classId ?? 0)-\(item.occurrenceDateKey)"
                    requests.append(UNNotificationRequest(
                        identifier: id, content: content,
                        trigger: UNTimeIntervalNotificationTrigger(
                            timeInterval: max(1, fireAt.timeIntervalSinceNow), repeats: false)))
                }
            }
        }

        if Preferences.bool(Preferences.taskRemindersEnabled, default: true) {
            let now = Date()
            for task in tasks where !task.isDone {
                guard let due = task.effectiveDueAt,
                      due.timeIntervalSince(now) < 48 * 3600 else { continue }
                let fireAt = due.addingTimeInterval(-60 * 60)
                guard fireAt > now else { continue }
                let content = UNMutableNotificationContent()
                content.title = "Task due in an hour"
                content.body = task.title
                content.sound = .default
                requests.append(UNNotificationRequest(
                    identifier: "task-\(task.id)", content: content,
                    trigger: UNTimeIntervalNotificationTrigger(
                        timeInterval: max(1, fireAt.timeIntervalSinceNow), repeats: false)))
            }
        }

        // UNUserNotificationCenter caps pending requests at 64; classes
        // win because they recur on a fixed timetable.
        return Array(requests.prefix(60))
    }
}

/// Shows banners even while the app is in the foreground, so a class
/// reminder fires visibly during an active session instead of silently
/// landing in Notification Center.
final class ForegroundNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = ForegroundNotifier()

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
