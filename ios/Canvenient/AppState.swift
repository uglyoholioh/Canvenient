import Foundation
import SwiftUI
import BackgroundTasks
import CanvenientKit

@MainActor
final class AppState: ObservableObject {
    enum Session: Equatable {
        case unknown
        case loggedOut
        case loggedIn
    }

    enum Tab: Hashable {
        case dashboard, schedule, tasks, campus
    }

    /// Drawer-only destinations (Modules/Wheel/Settings) present as full
    /// screens — the bottom TabView only hosts the four anchors.
    enum OverlayDestination: String, Identifiable {
        case modules, wheel, settings
        var id: String { rawValue }
    }

    @Published var session: Session = .unknown
    @Published var selectedTab: Tab = .dashboard
    @Published var sidebarOpen = false
    @Published var overlay: OverlayDestination?
    /// True when the hosted backend is unreachable and views are showing
    /// last-synced data from the offline cache.
    @Published var offline = false
    @Published var user: UserPublic?
    @Published var schedule = ScheduleResponse.empty
    @Published var scheduleLoaded = false
    @Published var tasks: [TaskOut] = []
    @Published var tasksLoaded = false
    @Published var modules: [AcademicModule] = []
    @Published var modulesLoaded = false
    @Published var modulesFromCanvas = false
    @Published var assignments: [String: [CanvasAssignment]] = [:]
    @Published var academicWeek: AcademicCalendar.WeekInfo?

    @AppStorage("serverURL") var serverURL: String = "https://olisdesktop.tail7ecaad.ts.net"

    private let tokenStore = TokenStore()
    private(set) var token: String?
    private(set) var api: APIClient

    init() {
        token = tokenStore.read()
        let baseURL = UserDefaults.standard.string(forKey: "serverURL") ?? "https://olisdesktop.tail7ecaad.ts.net"
        api = APIClient(baseURL: baseURL, tokenProvider: { nil })
        api.tokenProvider = { [weak self] in self?.token }
    }

    func updateServerURL(_ url: String) {
        serverURL = url
        api = APIClient(baseURL: url, tokenProvider: { [weak self] in self?.token })
    }

    private func storeToken(_ newToken: String?) {
        token = newToken
        if let newToken {
            tokenStore.save(newToken)
        } else {
            tokenStore.delete()
        }
    }

    // MARK: Session

    func bootstrap() async {
        // Simulator tooling: `simctl launch` can inject credentials for
        // automated UI verification. No effect without the env vars set.
        if let devEmail = ProcessInfo.processInfo.environment["CANVENIENT_DEV_EMAIL"],
           let devPassword = ProcessInfo.processInfo.environment["CANVENIENT_DEV_PASSWORD"] {
            try? await signIn(email: devEmail, password: devPassword)
            if session == .loggedIn { return }
        }
        guard let token else {
            session = .loggedOut
            return
        }
        do {
            user = try await api.me()
            session = .loggedIn
            await refreshAll()
        } catch APIError.unauthorized {
            session = .loggedOut
        } catch {
            // Server unreachable: keep the session but leave data stale.
            user = UserPublic(id: 0, email: "saved account")
            session = .loggedIn
        }
    }

    func signIn(email: String, password: String) async throws {
        let response = try await api.login(email: email, password: password)
        storeToken(response.access_token)
        user = response.user
        session = .loggedIn
        await refreshAll()
    }

    func signUp(email: String, password: String, name: String?) async throws {
        let response = try await api.register(email: email, password: password, name: name)
        storeToken(response.access_token)
        user = response.user
        session = .loggedIn
        await refreshAll()
    }

    func signOut() {
        storeToken(nil)
        user = nil
        schedule = .empty
        scheduleLoaded = false
        tasks = []
        tasksLoaded = false
        modules = []
        modulesLoaded = false
        assignments = [:]
        session = .loggedOut
        Task { await LiveActivityController.shared.endAll() }
    }

    // MARK: Data

    func refreshAll() async {
        academicWeek = AcademicCalendar.week(for: Date())
        // Modules fall back to timetable courses, so load those first.
        await refreshSchedule()
        async let tasksRefresh: Void = refreshTasks()
        async let modulesRefresh: Void = refreshModules(force: true)
        _ = await (tasksRefresh, modulesRefresh)
    }

    func refreshModules(force: Bool = false) async {
        if modulesLoaded && !force { return }
        do {
            // Canvas is the source of truth, exactly like the desktop:
            // GET /academic-modules syncs the caller's Canvas courses into
            // academic_modules using the Canvas token stored server-side.
            modules = try await api.academicModules()
            modulesFromCanvas = true
            if let allAssignments = try? await api.canvasAssignments() {
                assignments = Dictionary(grouping: allAssignments, by: { $0.course_code ?? "" })
            }
            modulesLoaded = true
        } catch {
            modulesLoaded = modulesLoaded // Keep state trigger
        }
    }

    func updateCanvasToken(_ token: String) async throws {
        _ = try await api.updateProfile(canvasToken: token.isEmpty ? nil : token)
        modulesLoaded = false
        assignments = [:]
        await refreshModules(force: true)
    }

    func refreshSchedule() async {
        do {
            schedule = try await api.schedule()
            scheduleLoaded = true
            offline = false
            OfflineCache.shared.save(schedule, key: "schedule")
            await LiveActivityController.shared.sync(schedule: schedule, client: api)
        } catch {
            if schedule.classes.isEmpty,
               let cached: ScheduleResponse = OfflineCache.shared.load(ScheduleResponse.self, key: "schedule") {
                schedule = cached
                offline = true
            }
            scheduleLoaded = scheduleLoaded
        }
    }

    func refreshTasks() async {
        do {
            tasks = try await api.tasks()
            tasksLoaded = true
            offline = false
            OfflineCache.shared.save(tasks, key: "tasks")
        } catch {
            if tasks.isEmpty,
               let cached: [TaskOut] = OfflineCache.shared.load([TaskOut].self, key: "tasks") {
                tasks = cached
                offline = true
            }
            tasksLoaded = tasksLoaded
        }
    }

    /// Arrivals: hosted backend first, then the public relay straight from
    /// the device, then the last cached snapshot. Only the first path needs
    /// Tailscale.
    func busArrivals(stop: String) async -> BusArrivalsResponse? {
        func hasEtas(_ response: BusArrivalsResponse) -> Bool {
            response.arrivals.contains { $0.minutes.contains { $0 != nil } }
        }
        if let fresh = try? await api.busArrivals(stop: stop) {
            offline = false
            OfflineCache.shared.save(fresh, key: "arrivals:\(stop)")
            return fresh
        }
        offline = true
        // The public relay needs no Tailscale — just internet.
        if let direct = try? await DirectBus.arrivals(stop: stop), hasEtas(direct) {
            return direct
        }
        // Relay down or returned empty boards: keep the last known snapshot.
        return OfflineCache.shared.load(BusArrivalsResponse.self, key: "arrivals:\(stop)")
    }

    func academicModulesOfflineAware() async -> [AcademicModule]? {
        do {
            let modules = try await api.academicModules()
            offline = false
            OfflineCache.shared.save(modules, key: "modules")
            return modules
        } catch {
            if let cached: [AcademicModule] = OfflineCache.shared.load([AcademicModule].self, key: "modules") {
                offline = true
                return cached
            }
            return nil
        }
    }

    func importTimetable(from shareURL: String) async throws {
        schedule = try await api.importNUSMods(shareURL: shareURL.trimmingCharacters(in: .whitespaces))
        scheduleLoaded = true
        await LiveActivityController.shared.sync(schedule: schedule, client: api)
    }

    func setAttendance(_ classId: Int, inPerson: Bool, occurrenceDate: String?, allInstances: Bool) async throws {
        var payload: [String: Any] = ["attend_in_person": inPerson]
        if !allInstances, let occurrenceDate {
            payload["occurrence_date"] = occurrenceDate
        }
        try await api.updateClass(classId, payload: payload)
        await refreshSchedule()
    }

    // MARK: Tasks

    func createTask(_ payload: TaskCreate) async throws {
        _ = try await api.createTask(payload)
        await refreshTasks()
    }

    func setTaskDone(_ task: TaskOut, done: Bool) async {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index].status = done ? "done" : "todo"
        do {
            _ = try await api.updateTask(task.id, payload: ["status": done ? "done" : "todo"])
        } catch {
            tasks[index].status = task.status
        }
        if done {
            try? await Task.sleep(nanoseconds: 900_000_000)
            tasks.removeAll { $0.id == task.id }
        }
    }

    func deleteTask(_ task: TaskOut) async {
        tasks.removeAll { $0.id == task.id }
        try? await api.deleteTask(task.id)
    }

    // MARK: Live activity entry points

    func refreshLiveActivity() {
        Task { await LiveActivityController.shared.sync(schedule: schedule, client: api) }
    }

    func scheduleBackgroundRefresh() {
        BackgroundRefresh.schedule()
    }
}

/// Builds a client from device defaults so background refresh and the widget
/// extension can work without a live AppState.
enum BackgroundRefresh {
    static var taskIdentifier: String { "com.oli.canvenient.ios.refresh" }

    static var client: APIClient? {
        let baseURL = UserDefaults.standard.string(forKey: "serverURL") ?? ""
        guard !baseURL.isEmpty else { return nil }
        let store = TokenStore()
        return APIClient(baseURL: baseURL, tokenProvider: { store.read() })
    }

    static func registerHandler() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            schedule()
            Task { @MainActor in
                await LiveActivityController.shared.refreshNow()
                task.setTaskCompleted(success: true)
            }
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        // Best-effort wake ahead of the next likely class transition.
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}
