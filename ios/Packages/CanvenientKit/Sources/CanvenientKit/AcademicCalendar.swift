import Foundation

/// Port of the desktop app's `scheduleUtils.js` academic calendar. Semester
/// start dates are the NUS instructional calendar; week math matches the
/// desktop (weeks 1-6, recess, 7-13, reading, two exam weeks).
public enum AcademicCalendar {
    public enum WeekType: String {
        case orientation, instructional, recess, reading, exam, vacation
    }

    public struct WeekInfo: Equatable {
        public var academicYear: String
        public var shortAcademicYear: String
        public var semester: Int
        public var semesterLabel: String
        public var shortSemester: String
        public var weekNumber: Int?
        public var label: String
        public var type: WeekType
        public var formatted: String
    }

    static let semesterStarts: [String: [Int: String]] = [
        "2023/2024": [1: "2023-08-07", 2: "2024-01-15", 3: "2024-05-13", 4: "2024-06-24"],
        "2024/2025": [1: "2024-08-12", 2: "2025-01-13", 3: "2025-05-12", 4: "2024-06-23"],
        "2025/2026": [1: "2025-08-11", 2: "2026-01-12", 3: "2026-05-11", 4: "2026-06-22"],
        "2026/2027": [1: "2026-08-10", 2: "2027-01-11", 3: "2027-05-10", 4: "2027-06-21"],
        "2027/2028": [1: "2027-08-09", 2: "2028-01-10", 3: "2028-05-08", 4: "2028-06-19"],
    ]

    /// Monday of the week containing `date` (SG time).
    static func monday(of date: Date) -> Date {
        let day = SGTime.startOfDay(date)
        let jsDow = SGTime.jsWeekday(day)  // 0=Sun…6=Sat
        let offset = (jsDow + 6) % 7       // days since Monday
        return SGTime.addDays(day, -offset)
    }

    static func semesterStart(_ academicYear: String, _ semester: Int) -> Date {
        if let known = semesterStarts[academicYear]?[semester],
           let parsed = SGTime.calendar.date(from: DateComponents(
                year: Int(known.prefix(4)) ?? 2026,
                month: Int(known.dropFirst(5).prefix(2)) ?? 1,
                day: Int(known.suffix(2)) ?? 1)) {
            return parsed
        }
        // Same fallback rules as the desktop for unknown years.
        guard let startYear = Int(academicYear.split(separator: "/").first ?? "") else {
            return SGTime.startOfDay(Date())
        }
        let month: Int
        let baseDay: Int
        switch semester {
        case 1: month = 8; baseDay = 8
        case 2: month = 1; baseDay = 8
        case 3: month = 5; baseDay = 8
        default: month = 6; baseDay = 19
        }
        let year = semester == 1 ? startYear : startYear + 1
        var base = SGTime.calendar.date(from: DateComponents(year: year, month: month, day: baseDay))!
        let baseDow = SGTime.jsWeekday(base)
        let offset = (baseDow + 6) % 7
        base = SGTime.addDays(base, -offset)
        return base
    }

    public static func week(for date: Date) -> WeekInfo {
        let currentMonday = monday(of: date)
        let year = SGTime.calendar.component(.year, from: currentMonday)

        let candidateYear = "\(year)/\(year + 1)"
        let candidateSem1 = semesterStart(candidateYear, 1)
        let candidateOrientation = candidateSem1.addingTimeInterval(-7 * 86400 * 1.5)

        let ayStartYear = currentMonday >= candidateOrientation ? year : year - 1
        let ay = "\(ayStartYear)/\(ayStartYear + 1)"
        let sem1 = semesterStart(ay, 1)
        let sem2 = semesterStart(ay, 2)
        let st1 = semesterStart(ay, 3)
        let st2 = semesterStart(ay, 4)
        let shortAy = "AY\(String(ayStartYear).suffix(2))/\(String(ayStartYear + 1).suffix(2))"

        func weeksSince(_ start: Date) -> Int {
            Int((currentMonday.timeIntervalSince(start) / (7 * 86400)).rounded())
        }

        func semesterWeek(_ start: Date, prefix: String, shortPrefix: String,
                          semester: Int, semesterLabel: String, shortSemester: String) -> WeekInfo {
            let diff = weeksSince(start)
            var weekNumber: Int?
            var label: String
            var type: WeekType
            switch diff {
            case 0...5:
                weekNumber = diff + 1
                label = "\(prefix)\(weekNumber!)"
                type = .instructional
            case 6:
                label = "Recess Week"
                type = .recess
            case 7...13:
                weekNumber = diff
                label = "\(prefix)\(weekNumber!)"
                type = .instructional
            case 14:
                label = "Reading Week"
                type = .reading
            case 15:
                label = "Exam Week 1"
                type = .exam
            case 16:
                label = "Exam Week 2"
                type = .exam
            default:
                label = "Vacation"
                type = .vacation
            }
            return WeekInfo(academicYear: ay, shortAcademicYear: shortAy, semester: semester,
                            semesterLabel: semesterLabel, shortSemester: shortSemester,
                            weekNumber: weekNumber, label: label, type: type,
                            formatted: "\(shortAy) \(shortSemester) · \(label)")
        }

        if currentMonday < sem1 {
            let diff = weeksSince(sem1)
            let info = WeekInfo(academicYear: ay, shortAcademicYear: shortAy, semester: 1,
                                semesterLabel: "Semester 1", shortSemester: "Sem 1", weekNumber: nil,
                                label: diff == -1 ? "Orientation Week" : "Vacation",
                                type: diff == -1 ? .orientation : .vacation,
                                formatted: "\(shortAy) Sem 1 · \(diff == -1 ? "Orientation Week" : "Vacation")")
            return info
        }
        if currentMonday < sem2 {
            return semesterWeek(sem1, prefix: "Week ", shortPrefix: "Sem 1", semester: 1,
                                semesterLabel: "Semester 1", shortSemester: "Sem 1")
        }
        if currentMonday < st1 {
            return semesterWeek(sem2, prefix: "Week ", shortPrefix: "Sem 2", semester: 2,
                                semesterLabel: "Semester 2", shortSemester: "Sem 2")
        }
        if currentMonday < st2 {
            return semesterWeek(st1, prefix: "ST I Week ", shortPrefix: "ST I", semester: 3,
                                semesterLabel: "Special Term I", shortSemester: "ST I")
        }
        return semesterWeek(st2, prefix: "ST II Week ", shortPrefix: "ST II", semester: 4,
                            semesterLabel: "Special Term II", shortSemester: "ST II")
    }
}
