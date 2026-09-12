import Foundation

public enum APIError: LocalizedError {
    case invalidBaseURL
    case unauthorized
    case server(String)
    case transport(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL: return "The server address is not a valid URL."
        case .unauthorized: return "Please sign in again."
        case .server(let message): return message
        case .transport(let error): return "Could not reach the server: \(error.localizedDescription)"
        }
    }
}

/// Thin async/await client mirroring the desktop FastAPI contract.
public final class APIClient {
    public var baseURL: String
    public var tokenProvider: () -> String?

    private let session: URLSession
    private let decoder: JSONDecoder

    public init(baseURL: String, tokenProvider: @escaping () -> String? = { nil }) {
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")).hasPrefix("http")
            ? baseURL : "https://" + baseURL
        self.tokenProvider = tokenProvider
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        self.session = URLSession(configuration: configuration)
        self.decoder = JSONDecoder()
        // Models declare snake_case property names matching the wire format.
    }

    private func url(_ path: String, query: [String: String] = [:]) throws -> URL {
        guard var components = URLComponents(string: baseURL + path) else {
            throw APIError.invalidBaseURL
        }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let final = components.url else { throw APIError.invalidBaseURL }
        return final
    }

    @discardableResult
    private func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil,
                                       query: [String: String] = [:], authenticated: Bool = true,
                                       as type: T.Type = T.self) async throws -> T {
        let data = try await raw(path, method: method, body: body, query: query, authenticated: authenticated)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.server("Unexpected server response for \(path).")
        }
    }

    private func raw(_ path: String, method: String = "GET", body: [String: Any]? = nil,
                     query: [String: String] = [:], authenticated: Bool = true) async throws -> Data {
        var request = URLRequest(url: try url(path, query: query))
        request.httpMethod = method
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("Invalid server response.")
        }
        guard !(200...299).contains(http.statusCode) else { return data }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let detail = payload["detail"] {
            throw APIError.server(Self.describe(detail, fallback: "Request failed (\(http.statusCode))."))
        }
        throw APIError.server("Request failed (\(http.statusCode)).")
    }

    private static func describe(_ detail: Any, fallback: String) -> String {
        if let text = detail as? String { return text }
        if let list = detail as? [[String: Any]] {
            let messages = list.compactMap { issue -> String? in
                guard let message = issue["msg"] as? String else { return nil }
                return message.replacingOccurrences(of: "Value error, ", with: "")
            }
            if !messages.isEmpty { return messages.joined(separator: " · ") }
        }
        return fallback
    }

    // MARK: Auth

    public func register(email: String, password: String, name: String?) async throws -> TokenResponse {
        var body: [String: Any] = ["email": email, "password": password]
        if let name, !name.isEmpty { body["name"] = name }
        return try await request("/auth/register", method: "POST", body: body, authenticated: false)
    }

    public func login(email: String, password: String) async throws -> TokenResponse {
        try await request("/auth/login", method: "POST",
                          body: ["email": email, "password": password], authenticated: false)
    }

    public func me() async throws -> UserPublic {
        try await request("/auth/me")
    }

    /// Request whose response body is ignored (PATCH/DELETE acknowledgements).
    public func discardResponse(_ path: String, method: String, body: [String: Any]? = nil) async throws {
        _ = try await raw(path, method: method, body: body)
    }

    // MARK: Schedule

    public func schedule() async throws -> ScheduleResponse {
        try await request("/schedule")
    }

    public func importNUSMods(shareURL: String) async throws -> ScheduleResponse {
        try await request("/schedule/import/nusmods", method: "POST", body: ["url": shareURL])
    }

    public func updateClass(_ classId: Int, payload: [String: Any]) async throws {
        try await discardResponse("/schedule/classes/\(classId)", method: "PATCH", body: payload)
    }

    // MARK: Tasks

    public func tasks() async throws -> [TaskOut] {
        try await request("/tasks")
    }

    public func createTask(_ payload: TaskCreate) async throws -> TaskOut {
        let encoder = JSONEncoder()
        let data = try encoder.encode(payload)
        let object = try JSONSerialization.jsonObject(with: data)
        return try await request("/tasks", method: "POST", body: object as? [String: Any])
    }

    public func updateTask(_ id: Int, payload: [String: Any]) async throws -> TaskOut {
        try await request("/tasks/\(id)", method: "PATCH", body: payload)
    }

    public func deleteTask(_ id: Int) async throws {
        try await discardResponse("/tasks/\(id)", method: "DELETE")
    }

    // MARK: Campus bus

    public func busStops() async throws -> [BusStop] {
        let response: BusStopsResponse = try await request("/campus-bus/stops")
        return response.stops
    }

    public func busArrivals(stop: String) async throws -> BusArrivalsResponse {
        try await request("/campus-bus/arrivals", query: ["stop": stop])
    }

    // MARK: Venue finder

    public func freeVenues(query: String? = nil, minFreeMinutes: Int? = nil) async throws -> VenueAvailabilityResponse {
        var queryItems: [String: String] = [
            "only_free": "true",
            "sort": "duration",
        ]
        if let query, !query.isEmpty { queryItems["query"] = query }
        if let minFreeMinutes { queryItems["min_free_minutes"] = String(minFreeMinutes) }
        return try await request("/venues/availability", query: queryItems)
    }

    // MARK: Modules

    public func academicModules() async throws -> [AcademicModule] {
        try await request("/academic-modules")
    }

    public func canvasAssignments(courseId: Int?) async throws -> [CanvasAssignment] {
        var query: [String: String] = [:]
        if let courseId { query["course_id"] = String(courseId) }
        return try await request("/canvas/assignments", query: query)
    }
}
