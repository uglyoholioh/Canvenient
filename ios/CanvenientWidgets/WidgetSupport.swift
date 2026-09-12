import Foundation
import SwiftUI
import CanvenientKit

/// Widget-side data access. Home-screen widgets run in their own process —
/// no Keychain token here — so everything renders from the snapshots the app
/// syncs into the app-group container (OfflineCache). The bus widget is the
/// exception: the public NUS relay needs no auth, so it fetches live.
enum WidgetData {
    static var schedule: ScheduleResponse? {
        OfflineCache.shared.load(ScheduleResponse.self, key: "schedule")
    }

    static var tasks: [TaskOut] {
        OfflineCache.shared.load([TaskOut].self, key: "tasks")?
            .filter { !$0.isDone }
            .sorted { ($0.effectiveDueAt ?? .distantFuture) < ($1.effectiveDueAt ?? .distantFuture) }
            ?? []
    }

    static func arrivals(stop: String) async -> BusArrivalsResponse? {
        if let live = try? await DirectBus.arrivals(stop: stop) {
            return live
        }
        return OfflineCache.shared.load(BusArrivalsResponse.self, key: "arrivals:\(stop)")
    }

    static var lastSync: Date? { SharedStore.lastSyncDate }
}

enum WidgetFormatting {
    static func clock(_ date: Date, calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// Mirrors the app's Format.eta: short waits as minutes, long ones as
    /// the arrival clock time.
    static func eta(minutes: Int, from date: Date) -> String {
        if minutes >= 60 {
            return clock(date.addingTimeInterval(Double(minutes) * 60), calendar: SGTime.calendar)
        }
        return "\(minutes) min"
    }
}
