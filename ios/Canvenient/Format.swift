import Foundation
import CanvenientKit

/// Shared user-facing formatting so every surface renders times the same way.
public enum Format {
    /// Bus-style arrival: "Now", "8 min", or the arrival clock time when the
    /// bus is more than an hour out ("08:36" reads better than "516 min").
    public static func eta(_ minutes: Int, now: Date = Date(), calendar: Calendar = SGTime.calendar) -> String {
        if minutes <= 0 { return "Now" }
        if minutes < 60 { return "\(minutes) min" }
        let arrival = now.addingTimeInterval(TimeInterval(minutes) * 60)
        let components = calendar.dateComponents([.hour, .minute], from: arrival)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }

    /// Subsequent ETAs after the first: "08:56, 09:26".
    public static func etaList(_ minutes: [Int], now: Date = Date()) -> String {
        minutes.dropFirst().map { eta($0, now: now) }.joined(separator: ", ")
    }

    /// Human distance to a date: "In 12 min", "In 2 h 05 min", or the
    /// weekday-and-time once it is more than a day out ("Mon 10:00").
    public static func countdown(until date: Date, now: Date = Date()) -> String {
        let minutes = Int(date.timeIntervalSince(now) / 60)
        if minutes < 0 { return "Happening now" }
        if minutes < 60 { return "In \(minutes) min" }
        if minutes < 24 * 60 {
            return String(format: "In %d h %02d min", minutes / 60, minutes % 60)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_SG")
        formatter.dateFormat = "EEE HH:mm"
        return formatter.string(from: date)
    }

    public static func clockTime(_ date: Date) -> String {
        let components = SGTime.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }
}
