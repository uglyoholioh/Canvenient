import Foundation

/// The backend stores naive datetimes that mean Singapore local time, and
/// time-of-day strings like "09:00:00". All parsing funnels through here so
/// schedule math stays consistent with the desktop app.
public enum SGTime {
    public static let singapore = TimeZone(identifier: "Asia/Singapore")!

    private static var sgCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = singapore
        return calendar
    }()

    public static var calendar: Calendar { sgCalendar }

    /// Parse "2026-09-12T09:00:00" (naive → SG) or offset-aware ISO strings.
    public static func parseDateTime(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        if let offsetAware = isoOffset.date(from: raw) { return offsetAware }
        return isoNaive.date(from: raw)  // naive = SG local
    }

    /// Parse "09:00:00" / "09:00" into seconds since midnight.
    public static func parseTimeOfDay(_ raw: String?) -> Int? {
        guard let raw, !raw.isEmpty else { return nil }
        let parts = raw.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return parts[0] * 3600 + parts[1] * 60
    }

    /// "YYYY-MM-DD" for a date in SG time — matches the backend's class_date.
    public static func dateKey(_ date: Date) -> String {
        let components = sgCalendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    /// Midnight (SG) of the given date.
    public static func startOfDay(_ date: Date) -> Date {
        sgCalendar.startOfDay(for: date)
    }

    /// A Date on `day` at the given seconds-since-midnight, SG time.
    public static func date(_ day: Date, secondsIntoDay: Int) -> Date {
        let dayStart = startOfDay(day)
        return dayStart.addingTimeInterval(TimeInterval(secondsIntoDay))
    }

    /// Backend day_of_week is ISO (1=Mon…7=Sun); JS logic compares `iso % 7`
    /// against `getDay()` (0=Sun…6=Sat). This reproduces that value.
    public static func jsWeekday(_ date: Date) -> Int {
        let weekday = sgCalendar.component(.weekday, from: date)  // 1=Sun…7=Sat
        return weekday == 1 ? 0 : weekday - 1
    }

    public static func addDays(_ date: Date, _ days: Int) -> Date {
        sgCalendar.date(byAdding: .day, value: days, to: date) ?? date
    }

    private static let isoNaive: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = singapore
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter
    }()

    private static let isoOffset: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
