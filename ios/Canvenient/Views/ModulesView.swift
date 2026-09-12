import SwiftUI
import CanvenientKit

struct ModulesView: View {
    @EnvironmentObject private var appState: AppState

    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if !appState.modulesLoaded {
                    emptyState
                } else if appState.modules.isEmpty {
                    emptyState
                } else {
                    moduleList
                }
            }
            .navigationTitle("Modules")
            .tint(Theme.accent)
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadModules() }
            .refreshable { await appState.refreshModules(force: true) }
        }
    }

    private var moduleList: some View {
        List {
            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(Theme.error).font(.callout) }
            }
            Section {
                ForEach(appState.modules) { module in
                    NavigationLink {
                        ModuleAssignmentsView(module: module,
                                              assignments: appState.assignments[module.module_code] ?? [],
                                              loading: !appState.modulesLoaded)
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
                            if !appState.modulesLoaded {
                                ProgressView()
                            } else if let count = appState.assignments[module.module_code]?.count {
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
            Label(!appState.modulesLoaded && errorMessage == nil ? "Loading modules…" : "No modules yet", systemImage: "book.closed")
        } description: {
            if !(!appState.modulesLoaded && errorMessage == nil) {
                Text("Add your Canvas token in Settings and your Canvas courses will appear here, with assignments from Canvas LMS.")
            }
        } actions: {
            if errorMessage != nil {
                Button("Retry") { Task { await loadModules() } }
                    .buttonStyle(.borderedProminent)
            } else if !appState.modulesLoaded && errorMessage == nil {
                ProgressView()
            }
        }
    }

    private func loadModules() async {
        errorMessage = nil
        await appState.refreshModules()
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
