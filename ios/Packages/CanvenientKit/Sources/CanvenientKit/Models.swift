import Foundation

// MARK: - Auth

public struct UserPublic: Codable, Equatable {
    public var id: Int
    public var email: String
    public var name: String?
    public var theme: String?
    public var canvas_token_set: Bool?

    public init(id: Int, email: String) {
        self.id = id
        self.email = email
    }
}

public struct TokenResponse: Codable {
    public var access_token: String
    public var user: UserPublic
}

// MARK: - Schedule

public struct ScheduleResponse: Codable, Equatable {
    public var classes: [ClassOut]
    public var exams: [ExamOut]
    public var events: [EventOut]
    public var class_attendance_overrides: [AttendanceOverride]?

    public static let empty = ScheduleResponse(classes: [], exams: [], events: [], class_attendance_overrides: [])
}

public struct AttendanceOverride: Codable, Equatable {
    public var class_id: Int
    public var occurrence_date: String
    public var attend_in_person: Bool
}

public struct ClassOut: Codable, Equatable, Identifiable {
    public var id: Int
    public var module_code: String
    public var module_name: String?
    public var lesson_type: String
    public var class_no: String?
    public var day_of_week: Int
    public var start_time: String
    public var end_time: String
    public var venue: String?
    public var class_date: String?
    public var weeks: WeeksSpec?
    public var module_color: String?
    public var attend_in_person: Bool?
    public var linked_task_count: Int?
    public var linked_note_count: Int?
    public var linked_file_count: Int?
}

/// NUSMods `weeks` arrives as a list of week numbers, or a `{start,end}`
/// date range, or null.
public enum WeeksSpec: Codable, Equatable {
    case weeks([Int])
    case range(start: String, end: String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let list = try? container.decode([Int].self) {
            self = .weeks(list)
            return
        }
        if let dict = try? container.decode([String: String].self),
           let start = dict["start"], let end = dict["end"] {
            self = .range(start: start, end: end)
            return
        }
        self = .weeks([])
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .weeks(let list): try container.encode(list)
        case .range(let start, let end): try container.encode(["start": start, "end": end])
        }
    }
}

public struct ExamOut: Codable, Equatable, Identifiable {
    public var id: Int
    public var module_code: String
    public var module_name: String?
    public var start_at: String
    public var end_at: String
    public var module_color: String?
}

public struct EventOut: Codable, Equatable, Identifiable {
    public var id: Int
    public var title: String
    public var description: String?
    public var venue: String?
    public var start_at: String
    public var end_at: String?
    public var is_all_day: Bool?
    public var module_code: String?
    public var module_color: String?
}

// MARK: - Tasks

public struct TaskOut: Codable, Equatable, Identifiable {
    public var id: Int
    public var title: String
    public var description: String?
    public var status: String?
    public var priority_manual: String?
    public var recommended_priority: String?
    public var source_due_at: String?
    public var due_at_override: String?
    public var external_url: String?
    public var module_id: Int?
    public var module_code: String?
    public var module_name: String?
    public var module_color: String?
    public var class_summary: String?
    public var class_relation: String?
    public var group_id: Int?
    public var group_name: String?
    public var completed_at: String?
    public var created_at: String?

    /// Desktop precedence: user override wins over the Canvas source date.
    public var effectiveDueAt: Date? {
        SGTime.parseDateTime(due_at_override) ?? SGTime.parseDateTime(source_due_at)
    }

    public var isDone: Bool { status == "done" }
}

public struct TaskCreate: Codable {
    public var title: String
    public var description: String?
    public var priority_manual: String?
    public var due_at_override: String?
    public var module_id: Int?

    public init(title: String, description: String?, priority_manual: String?,
                due_at_override: String?, module_id: Int?) {
        self.title = title
        self.description = description
        self.priority_manual = priority_manual
        self.due_at_override = due_at_override
        self.module_id = module_id
    }
}

// MARK: - Academic modules

public struct AcademicModule: Codable, Equatable, Identifiable {
    public var id: Int
    public var module_code: String
    public var name: String?
    public var color: String?
    public var is_selected: Bool?
}

// MARK: - Campus bus

public struct BusStopsResponse: Codable {
    public var stops: [BusStop]
}

public struct BusStop: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String?
    public var short_name: String?
    public var latitude: Double?
    public var longitude: Double?
}

public struct BusArrivalsResponse: Codable {
    public var stop: BusStop?
    public var arrivals: [BusServiceArrivals]
    public var updated_at: String?
}

public struct BusServiceArrivals: Codable, Equatable {
    public var service: String
    public var minutes: [Int?]
}

// MARK: - Canvas (Modules tab)

public struct CanvasAssignment: Codable, Identifiable {
    public var id: Int
    public var name: String?
    public var due_at: String?
    public var html_url: String?
    public var course_id: Int?
}
