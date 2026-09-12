import SwiftUI
import CanvenientKit

struct ModulesView: View {
    @EnvironmentObject private var appState: AppState

    @State private var assignments: [Int: [CanvasAssignment]] = [:]
    @State private var loadingModule: Int?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if appState.modules.isEmpty {
                    emptyState
                } else {
                    moduleList
                }
            }
            .navigationTitle("Modules")
            .tint(Theme.accent)
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadModules() }
            .refreshable { await loadModules() }
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
                                              assignments: assignments[module.id] ?? [],
                                              loading: loadingModule == module.id)
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
                            if loadingModule == module.id {
                                ProgressView()
                            } else if let count = assignments[module.id]?.count {
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
                Text("Sourced from Canvas through your Canvenient backend. Tap a course for its upcoming assignments.")
            }
        }
        .themedForm()
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "book.closed")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(appState.modules.isEmpty && errorMessage == nil ? "Loading modules…" : "No modules yet — Canvas courses sync from the desktop app (Settings › Canvas token).")
                .foregroundStyle(Theme.textMuted)
            if errorMessage != nil {
                Button("Retry") { Task { await loadModules() } }
                    .buttonStyle(.borderedProminent)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func loadModules() async {
        errorMessage = nil
        do {
            appState.modules = try await appState.api.academicModules()
        } catch {
            errorMessage = error.localizedDescription
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
                        Text(assignment.name ?? "Assignment")
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
