import SwiftUI
import CanvenientKit

struct TasksView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingComposer = false

    var body: some View {
        NavigationStack {
            Group {
                if appState.tasks.isEmpty {
                    emptyState
                } else {
                    taskList
                }
            }
            .navigationTitle("Tasks")
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { SidebarToggle() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingComposer = true } label: {
                        Label("New task", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingComposer) { TaskComposer() }
            .task { await appState.refreshTasks() }
            .refreshable { await appState.refreshTasks() }
        }
    }

    private var pendingTasks: [TaskOut] {
        appState.tasks.filter { !$0.isDone }
            .sorted {
                let a = $0.effectiveDueAt ?? .distantFuture
                let b = $1.effectiveDueAt ?? .distantFuture
                if a != b { return a < b }
                return $0.created_at ?? "" > $1.created_at ?? ""
            }
    }

    private var completedTasks: [TaskOut] {
        appState.tasks.filter(\.isDone)
            .sorted { ($0.effectiveDueAt ?? .distantFuture) < ($1.effectiveDueAt ?? .distantFuture) }
    }

    private var taskList: some View {
        List {
            ForEach(taskSections, id: \.title) { section in
                if !section.tasks.isEmpty {
                    Section(section.title) {
                        ForEach(section.tasks) { task in
                            TaskRow(task: task) {
                                toggleDone(task)
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                Button {
                                    toggleDone(task)
                                } label: {
                                    Label(task.isDone ? "Reopen" : "Done",
                                          systemImage: task.isDone ? "arrow.uturn.backward" : "checkmark")
                                }
                                .tint(task.isDone ? Theme.info : Theme.success)
                            }
                        }
                        .onDelete { offsets in
                            let targets = offsets.map { section.tasks[$0] }
                            Task {
                                for task in targets { await appState.deleteTask(task) }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var taskSections: [(title: String, tasks: [TaskOut])] {
        let now = Date()
        let todayEnd = SGTime.addDays(SGTime.startOfDay(now), 1)
        let weekEnd = SGTime.addDays(todayEnd, 7)
        let pending = pendingTasks
        return [
            ("Overdue", pending.filter { ($0.effectiveDueAt ?? .distantFuture) < now }),
            ("Today", pending.filter { let due = $0.effectiveDueAt; return due != nil && due! >= now && due! < todayEnd }),
            ("This week", pending.filter { let due = $0.effectiveDueAt; return due != nil && due! >= todayEnd && due! < weekEnd }),
            ("Later", pending.filter { let due = $0.effectiveDueAt; return due != nil && due! >= weekEnd }),
            ("No due date", pending.filter { $0.effectiveDueAt == nil }),
            ("Completed", completedTasks),
        ]
    }

    private func toggleDone(_ task: TaskOut) {
        if Preferences.bool(Preferences.hapticsEnabled, default: true) {
            if task.isDone {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
        Task { await appState.setTaskDone(task, done: !task.isDone) }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            if appState.tasksLoaded {
                ContentUnavailableView {
                    Label("All clear", systemImage: "checkmark.circle")
                } description: {
                    Text("Nothing pending. Add an assignment or a chore and it'll show up here.")
                } actions: {
                    Button("New task") { showingComposer = true }
                        .buttonStyle(AccentFilledButtonStyle())
                        .padding(.top, 6)
                }
            } else {
                ProgressView()
                Text("Loading tasks…")
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

struct TaskRow: View {
    let task: TaskOut
    let onComplete: () -> Void

    private var isDone: Bool { task.isDone }
    private var isOverdue: Bool {
        !isDone && (task.effectiveDueAt ?? .distantFuture) < Date()
    }

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onComplete) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isDone ? Theme.success : Theme.accent)
                    .symbolEffect(.bounce, value: isDone)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .lineLimit(2)
                    .strikethrough(isDone)
                    .foregroundStyle(isDone ? Theme.textMuted : Theme.textH)
                HStack(spacing: 6) {
                    if let due = task.effectiveDueAt {
                        Label(relativeDue(due), systemImage: isOverdue ? "exclamationmark.circle" : "clock")
                            .font(.caption)
                            .foregroundStyle(isOverdue ? Theme.error : Theme.textMuted)
                    }
                    if let moduleCode = task.module_code {
                        moduleChip(moduleCode)
                    }
                    if task.group_id != nil {
                        Image(systemName: "person.2")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if task.source_due_at != nil {
                        Image(systemName: "graduationcap")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                if let classSummary = task.class_summary {
                    Text(classSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if !isDone { priorityDot }
        }
        .padding(.vertical, 1)
    }

    /// Palette-tinted module tag so rows from the same course read as a set.
    private func moduleChip(_ code: String) -> some View {
        Text(code)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(moduleColor.opacity(0.16), in: Capsule())
            .foregroundStyle(moduleColor)
    }

    @ViewBuilder
    private var priorityDot: some View {
        let priority = task.priority_manual ?? "medium"
        switch priority {
        case "urgent":
            Image(systemName: "exclamationmark.3").foregroundStyle(Theme.error).font(.caption)
        case "high":
            Image(systemName: "exclamationmark.2").foregroundStyle(Theme.warning).font(.caption)
        case "low":
            Image(systemName: "arrow.down").foregroundStyle(Theme.textMuted).font(.caption)
        default:
            EmptyView()
        }
    }

    private var moduleColor: Color {
        ModulePalette.color(moduleColor: task.module_color, fallback: task.module_code)
    }

    private func relativeDue(_ due: Date) -> String {
        if isOverdue {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .abbreviated
            return "Overdue · \(formatter.localizedString(for: due, relativeTo: Date()))"
        }
        // Same-day deadlines read as clock times ("2:32 PM"); anything past
        // today reads relative ("in 4 days").
        if SGTime.calendar.isDate(due, inSameDayAs: Date()) {
            return due.formatted(date: .omitted, time: .shortened)
        }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: due, relativeTo: Date())
    }
}

// MARK: - Composer

struct TaskComposer: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var duePreset: DuePreset = .none
    @State private var customDate = Date().addingTimeInterval(86400)
    @State private var priority = "medium"
    @State private var moduleId: Int?
    @State private var busy = false
    @State private var errorMessage: String?
    @FocusState private var titleFocused: Bool

    enum DuePreset: String, CaseIterable, Identifiable {
        case none = "None"
        case today = "Today"
        case tomorrow = "Tomorrow"
        case custom = "Pick…"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What needs doing?", text: $title, axis: .vertical)
                        .focused($titleFocused)
                    Picker("Priority", selection: $priority) {
                        Text("Low").tag("low")
                        Text("Medium").tag("medium")
                        Text("High").tag("high")
                        Text("Urgent").tag("urgent")
                    }
                    if !appState.modules.isEmpty {
                        Picker("Module", selection: $moduleId) {
                            Text("None").tag(Int?.none)
                            ForEach(appState.modules) { module in
                                Text(module.module_code).tag(Int?.some(module.id))
                            }
                        }
                    }
                }
                Section {
                    Picker("When", selection: $duePreset) {
                        ForEach(DuePreset.allCases) { preset in
                            Text(preset.rawValue).tag(preset)
                        }
                    }
                    .pickerStyle(.segmented)
                    if duePreset == .custom {
                        DatePicker("Due at", selection: $customDate)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { create() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .task {
                if appState.modules.isEmpty {
                    if let modules = try? await appState.api.academicModules() {
                        appState.modules = modules.filter { $0.is_selected ?? true }
                    }
                }
                titleFocused = true
            }
        }
    }

    private func create() {
        busy = true
        errorMessage = nil
        Task {
            defer { busy = false }
            let due: Date?
            switch duePreset {
            case .none: due = nil
            case .today: due = SGTime.calendar.date(bySettingHour: 23, minute: 59, second: 0, of: Date())
            case .tomorrow: due = SGTime.calendar.date(bySettingHour: 23, minute: 59, second: 0, of: SGTime.addDays(Date(), 1))
            case .custom: due = customDate
            }
            var payload = TaskCreate(title: title.trimmingCharacters(in: .whitespaces),
                                     description: nil, priority_manual: priority,
                                     due_at_override: nil, module_id: moduleId)
            if let due {
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = SGTime.singapore
                formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
                payload.due_at_override = formatter.string(from: due)
            }
            do {
                try await appState.createTask(payload)
                if Preferences.bool(Preferences.hapticsEnabled, default: true) {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
