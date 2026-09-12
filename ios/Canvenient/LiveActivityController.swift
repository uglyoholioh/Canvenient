import Foundation
import ActivityKit
import CanvenientKit

/// Owns the ActivityKit lifecycle for the "next/current class" Live Activity.
/// Updates happen locally: app foreground, periodic foreground timer,
/// BGAppRefresh (best-effort on free provisioning), and day change. The
/// countdown itself ticks on-device with no network.
@MainActor
final class LiveActivityController: ObservableObject {
    static let shared = LiveActivityController()

    @Published private(set) var active: Bool = false

    private var lastSyncDate: Date?

    func sync(schedule: ScheduleResponse, client: APIClient) async {
        lastSyncDate = Date()
        // The debug preview owns the activity lifecycle while enabled.
        if ProcessInfo.processInfo.arguments.contains("-previewLiveActivity") {
            return
        }
        guard Preferences.bool(Preferences.liveActivityEnabled, default: true) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let nowNext = ScheduleEngine.nowAndNext(for: schedule)
        let focus = nowNext.current ?? nowNext.next

        guard let focus, focus.kind == .classroom,
              focus.end > Date(),
              focus.start.timeIntervalSinceNow < 2 * 3600 else {
            await endAll()
            return
        }

        let upcoming = nowNext.next

        // Live bus estimate for the venue's suggested stop; failures never
        // block the activity.
        var busService: String?
        var busArrival: Date?
        if let stop = VenueDirectory.stop(for: focus.venue),
           let arrivals = try? await client.busArrivals(stop: stop),
           let first = arrivals.arrivals.first,
           let etaMinutes = first.minutes.compactMap({ $0 }).first {
            busService = first.service
            busArrival = Date().addingTimeInterval(TimeInterval(etaMinutes) * 60)
        }

        let state = ClassActivityAttributes.ContentState(
            classStart: focus.start,
            classEnd: focus.end,
            occurrenceDateKey: focus.occurrenceDateKey,
            nextModuleCode: upcoming?.moduleCode,
            nextStartTime: upcoming?.start,
            busService: busService,
            busArrival: busArrival,
            updatedAt: Date()
        )

        let matching = Activity<ClassActivityAttributes>.activities.first { activity in
            activity.attributes.moduleCode == (focus.moduleCode ?? "")
                && activity.attributes.lessonType == focus.subtitle
        }

        // Keep the activity stale-marked once the class window passes.
        let staleDate = focus.end.addingTimeInterval(10 * 60)

        if let matching {
            if matching.content.state.occurrenceDateKey != state.occurrenceDateKey
                || abs(matching.content.state.classStart.timeIntervalSince(state.classStart)) > 1
                || matching.content.state.busArrival != state.busArrival {
                await matching.update(ActivityContent(state: state, staleDate: staleDate))
            }
            active = true
        } else {
            await endAll()
            let attributes = ClassActivityAttributes(
                moduleCode: focus.moduleCode ?? "",
                moduleName: focus.moduleName ?? "",
                lessonType: focus.subtitle,
                venue: focus.venue,
                colorHex: focus.colorHex
            )
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: staleDate),
                    pushType: nil
                )
                active = true
            } catch {
                active = false
            }
        }
    }

    /// Refresh with a client built from device defaults (background path).
    func refreshNow() async {
        guard let client = BackgroundRefresh.client else { return }
        guard let schedule = try? await client.schedule() else { return }
        await sync(schedule: schedule, client: client)
    }

    /// Debug/demo hook (`-previewLiveActivity` launch argument): fabricates a
    /// class starting in a few minutes so the activity can be inspected at
    /// any time of day. Never called in normal use.
    func startPreview() async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        await endAll()
        let start = Date().addingTimeInterval(8 * 60)
        let end = start.addingTimeInterval(60 * 60)
        let state = ClassActivityAttributes.ContentState(
            classStart: start,
            classEnd: end,
            occurrenceDateKey: SGTime.dateKey(Date()),
            nextModuleCode: "CS2103T",
            nextStartTime: end.addingTimeInterval(2 * 3600),
            busService: nil,
            busArrival: nil,
            updatedAt: Date()
        )
        let attributes = ClassActivityAttributes(
            moduleCode: "CS2103T",
            moduleName: "Software Engineering",
            lessonType: "Lecture",
            venue: "COM1-0210",
            colorHex: nil
        )
        _ = try? Activity.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: end),
            pushType: nil
        )
        active = true
    }

    func endAll() async {
        for activity in Activity<ClassActivityAttributes>.activities {
            await activity.end(dismissalPolicy: .immediate)
        }
        active = false
    }
}
