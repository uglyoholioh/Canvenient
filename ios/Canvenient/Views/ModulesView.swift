import SwiftUI
import CanvenientKit

struct ModulesView: View {
    var showsDone = false
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var loading = false
    @State private var didLoad = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if appState.modules.isEmpty {
                    if loading && !didLoad {
                        loadingState
                    } else if let errorMessage {
                        errorState
                    } else {
                        emptyState
                    }
                } else {
                    moduleList
                }
            }
            .navigationTitle("Modules")
            .tint(Theme.accent)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if showsDone {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }.tint(Theme.accent)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    /// Local loading/error state drives this screen — the app-wide
    /// `modulesLoaded` flag only flips after a bootstrap refresh, so gating
    /// on it here stranded the tab on "Loading…" when the server was down
    /// at launch.
    private func load() async {
        guard !loading else { return }
        loading = true
        errorMessage = nil
        if let modules = await appState.academicModulesOfflineAware() {
            appState.modules = modules
            appState.modulesLoaded = true
            // Assignment counts come with the Canvas sync; fetch them here
            // too so the first open shows them without a pull-to-refresh.
            if let all = try? await appState.api.canvasAssignments() {
                appState.assignments = Dictionary(grouping: all, by: { $0.course_code ?? "" })
            }
        } else {
            errorMessage = "The server couldn't be reached. Check that Tailscale is connected, then retry."
        }
        didLoad = true
        loading = false
    }

    private var loadingState: some View {
        ContentUnavailableView {
            Label("Loading modules…", systemImage: "book.closed")
        } actions: {
            ProgressView()
        }
    }

    private var errorState: some View {
        ContentUnavailableView {
            Label("Couldn't load modules", systemImage: "wifi.exclamationmark")
        } description: {
            Text(errorMessage ?? "")
        } actions: {
            Button("Retry") { Task { await load() } }
                .buttonStyle(AccentFilledButtonStyle())
        }
    }

    private var moduleList: some View {
        List {
            Section {
                ForEach(appState.modules) { module in
                    NavigationLink {
                        ModuleAssignmentsView(module: module,
                                              assignments: appState.assignments[module.module_code] ?? [],
                                              loading: loading)
                    } label: {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(ModulePalette.color(moduleColor: module.color,
                                                          fallback: module.module_code))
                                .frame(width: 12, height: 12)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(module.module_code).fontWeight(.semibold)
                                if let name = module.name {
                                    Text(name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                            Spacer()
                            if let count = appState.assignments[module.module_code]?.count {
                                Text("\(count)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } header: {
                Text("Courses")
            } footer: {
                Text("Sourced from Canvas via your Canvas token. Tap a course for its upcoming assignments.")
            }
        }
        .listStyle(.insetGrouped)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No modules yet", systemImage: "book.closed")
        } description: {
            Text("Connect Canvas and your courses — with their assignments — will appear here.")
        } actions: {
            Button("Connect Canvas") { appState.overlay = .settings }
                .buttonStyle(AccentFilledButtonStyle())
        }
    }
}

struct ModuleAssignmentsView: View {
    let module: AcademicModule
    let assignments: [CanvasAssignment]
    let loading: Bool

    var body: some View {
        List {
            if loading {
                HStack { ProgressView(); Text("Loading assignments…").foregroundStyle(.secondary) }
            } else if assignments.isEmpty {
                Text("No assignments found for this course.").foregroundStyle(.secondary)
            } else {
                ForEach(assignments) { assignment in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(assignment.title ?? "Assignment")
                            .fontWeight(.medium)
                        if let due = SGTime.parseDateTime(assignment.due_at) {
                            Label(due < Date() ? "Closed" : due.formatted(date: .abbreviated, time: .shortened),
                                  systemImage: "clock")
                                .font(.caption)
                                .foregroundStyle(due < Date() ? Color.secondary : Color.orange)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(module.module_code)
        .navigationBarTitleDisplayMode(.inline)
    }
}
