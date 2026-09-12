import Foundation

/// Expands timetable rows into concrete occurrences and computes the
/// current/next class. Port of `scheduleUtils.js` occurrence logic.
public enum ScheduleEngine {
    public enum Kind: String {
        case classroom = "class"
        case event
        case exam
    }

    public struct Item: Identifiable, Equatable {
        public var id: String
        public var kind: Kind
        public var classId: Int?
        public var occurrenceDateKey: String
        public var moduleCode: String?
        public var moduleName: String?
        public var title: String
        public var subtitle: String
        public var classNo: String?
        public var venue: String
        public var start: Date
        public var end: Date
        public var colorHex: String?
        public var attendInPerson: Bool
        public var linkedTaskCount: Int
    }

    // MARK: Occurrence matching (port of isClassHappeningInWeek)

    public static func classOccursOnDate(_ klass: ClassOut, on date: Date) -> Bool {
        if let classDate = klass.class_date {
            return classDate == SGTime.dateKey(date)
        }
        guard let startTime = Int(klass.day_of_week.description) else { return false }
        if startTime % 7 != SGTime.jsWeekday(date) { return false }
        let week = AcademicCalendar.week(for: date)
        guard let weeks = klass.weeks else {
            return week.type == .instructional && (week.weekNumber ?? 0) >= 1 && (week.weekNumber ?? 0) <= 13
        }
        guard week.type == .instructional, let weekNumber = week.weekNumber else { return false }
        switch weeks {
        case .weeks(let list):
            return list.contains(weekNumber)
        case .range(let start, let end):
            let key = SGTime.dateKey(date)
            return key >= start && key <= end
        }
    }

    /// Effective attend-in-person for a class on a specific occurrence date,
    /// including per-date overrides returned by GET /schedule.
    public static func effectiveAttendance(_ klass: ClassOut, on date: Date,
                                           overrides: [AttendanceOverride]?) -> Bool {
        if let overrides,
           let override = overrides.first(where: {
               $0.class_id == klass.id && $0.occurrence_date == SGTime.dateKey(date)
           }) {
            return override.attend_in_person
        }
        return klass.attend_in_person ?? true
    }

    // MARK: Item assembly (port of scheduleItemsForDate)

    public static func items(for schedule: ScheduleResponse, on date: Date) -> [Item] {
        var result: [Item] = []
        let dayKey = SGTime.dateKey(date)

        for klass in schedule.classes where classOccursOnDate(klass, on: date) {
            guard let startSeconds = SGTime.parseTimeOfDay(klass.start_time),
                  let endSeconds = SGTime.parseTimeOfDay(klass.end_time) else { continue }
            let start = SGTime.date(date, secondsIntoDay: startSeconds)
            let end = SGTime.date(date, secondsIntoDay: endSeconds)
            result.append(Item(
                id: "class-\(klass.id)",
                kind: .classroom,
                classId: klass.id,
                occurrenceDateKey: dayKey,
                moduleCode: klass.module_code,
                moduleName: klass.module_name,
                title: klass.module_code,
                subtitle: klass.lesson_type,
                classNo: klass.class_no,
                venue: klass.venue ?? "Venue not listed",
                start: start,
                end: end,
                colorHex: klass.module_color,
                attendInPerson: effectiveAttendance(klass, on: date, overrides: schedule.class_attendance_overrides),
                linkedTaskCount: klass.linked_task_count ?? 0
            ))
        }

        for event in schedule.events {
            guard let start = SGTime.parseDateTime(event.start_at) else { continue }
            let end = SGTime.parseDateTime(event.end_at) ?? start.addingTimeInterval(3600)
            let dayStart = SGTime.startOfDay(date)
            let dayEnd = SGTime.addDays(dayStart, 1)
            guard start < dayEnd && end > dayStart else { continue }
            result.append(Item(
                id: "event-\(event.id)",
                kind: .event,
                classId: nil,
                occurrenceDateKey: dayKey,
                moduleCode: event.module_code,
                moduleName: nil,
                title: event.title,
                subtitle: "Event",
                classNo: nil,
                venue: event.venue ?? "Venue not listed",
                start: max(start, dayStart),
                end: min(end, dayEnd),
                colorHex: event.module_color,
                attendInPerson: true,
                linkedTaskCount: 0
            ))
        }

        for exam in schedule.exams {
            guard let start = SGTime.parseDateTime(exam.start_at),
                  let end = SGTime.parseDateTime(exam.end_at) else { continue }
            let dayStart = SGTime.startOfDay(date)
            let dayEnd = SGTime.addDays(dayStart, 1)
            guard start < dayEnd && end > dayStart else { continue }
            result.append(Item(
                id: "exam-\(exam.id)",
                kind: .exam,
                classId: nil,
                occurrenceDateKey: dayKey,
                moduleCode: exam.module_code,
                moduleName: exam.module_name,
                title: "\(exam.module_code) Exam",
                subtitle: "Exam",
                classNo: nil,
                venue: "See exam timetable",
                start: max(start, dayStart),
                end: min(end, dayEnd),
                colorHex: exam.module_color,
                attendInPerson: true,
                linkedTaskCount: 0
            ))
        }

        return result.sorted { $0.start < $1.start }
    }

    public struct NowNext: Equatable {
        public var current: Item?
        public var next: Item?
    }

    /// The class happening now and the next one within the following week.
    public static func nowAndNext(for schedule: ScheduleResponse, at now: Date = Date()) -> NowNext {
        for dayOffset in 0...7 {
            let day = SGTime.addDays(now, dayOffset)
            let dayItems = items(for: schedule, on: day)
            var current: Item?
            var next: Item?
            for item in dayItems where item.end > now {
                if item.start <= now {
                    current = item
                } else if next == nil {
                    next = item
                    break
                }
            }
            if current != nil || next != nil {
                return NowNext(current: current, next: next)
            }
        }
        return NowNext(current: nil, next: nil)
    }
}
