import SwiftUI
import UIKit
import CanvenientKit

struct ScheduleView: View {
    @EnvironmentObject private var appState: AppState

    @State private var selectedDay = SGTime.startOfDay(Date())
    @State private var weekAnchor = SGTime.startOfDay(Date())
    @State private var showingImport = false
    @State private var detailItem: ScheduleEngine.Item?
    @State private var clock = Date()

    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var dayItems: [ScheduleEngine.Item] {
        ScheduleEngine.items(for: appState.schedule, on: selectedDay)
    }

    private var isOnToday: Bool {
        SGTime.dateKey(selectedDay) == SGTime.dateKey(Date())
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let week = appState.academicWeek {
                    SectionLabel(text: week.formatted)
                        .padding(.top, 6)
                }
                WeekStrip(selectedDay: $selectedDay, weekAnchor: $weekAnchor)
                    .padding(.top, 8)
                    .padding(.bottom, 10)
                if dayItems.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(dayItems) { item in
                            ScheduleCard(item: item, now: clock)
                                .onTapGesture { detailItem = item }
                        }
                    }
                    .listStyle(.plain)
                    .animation(.spring(response: 0.35, dampingFraction: 0.85), value: selectedDay)
                }
            }
            .background(Theme.bg)
            .navigationTitle("Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    SidebarToggle()
                    Button { showingImport = true } label: {
                        Label("Import", systemImage: "square.and.arrow.down")
                    }
                    .tint(Theme.accent)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if !isOnToday {
                        Button("Today") {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                selectedDay = SGTime.startOfDay(Date())
                                weekAnchor = selectedDay
                            }
                        }
                        .tint(Theme.accent)
                    }
                }
            }
            .sheet(isPresented: $showingImport) { ImportSheet() }
            .sheet(item: $detailItem) { item in
                ClassDetailSheet(item: item)
                    .preferredColorScheme(.dark)
            }
            .task { await appState.refreshSchedule() }
            .onReceive(timer) { clock = $0 }
            .refreshable { await appState.refreshSchedule() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            if appState.scheduleLoaded {
                ContentUnavailableView {
                    Label("Nothing scheduled", systemImage: "calendar")
                } description: {
                    Text(appState.schedule.classes.isEmpty
                         ? "Import your NUSMods timetable and your week fills in."
                         : "This day is free. Pick another day from the strip above.")
                } actions: {
                    if appState.schedule.classes.isEmpty {
                        Button("Import from NUSMods") { showingImport = true }
                            .buttonStyle(AccentFilledButtonStyle())
                            .padding(.top, 6)
                    }
                }
            } else {
                ProgressView()
                Text("Loading your timetable…")
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Week day selector

/// Seven-day strip with week paging. Selected day gets a raised capsule;
/// today keeps an accent dot so it stays findable from any week.
struct WeekStrip: View {
    @Binding var selectedDay: Date
    @Binding var weekAnchor: Date

    private var days: [Date] { (0..<7).map { SGTime.addDays(weekAnchor, $0) } }
    private var selectedInsideWindow: Bool {
        days.contains { SGTime.dateKey($0) == SGTime.dateKey(selectedDay) }
    }

    var body: some View {
        HStack(spacing: 6) {
            stripButton("chevron.left") {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    weekAnchor = SGTime.addDays(weekAnchor, -7)
                }
            }
            ForEach(days, id: \.self) { day in
                dayCell(day)
            }
            stripButton("chevron.right") {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    weekAnchor = SGTime.addDays(weekAnchor, 7)
                }
            }
        }
        .padding(.horizontal, 12)
        .onChange(of: selectedDay) { _, newDay in
            // A day picked from outside this window (e.g. the Today button)
            // pulls the window along with it.
            guard !selectedInsideWindow else { return }
            let shifted = SGTime.addDays(newDay, -Int(SGTime.jsWeekday(newDay)))
            weekAnchor = shifted
        }
    }

    private func stripButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 22, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func dayCell(_ day: Date) -> some View {
        let isSelected = SGTime.dateKey(day) == SGTime.dateKey(selectedDay)
        let isToday = SGTime.dateKey(day) == SGTime.dateKey(Date())
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                selectedDay = day
            }
        } label: {
            VStack(spacing: 3) {
                Text(dayOfWeekLabel(day))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(isSelected ? Theme.textH : Theme.textMuted)
                Text("\(SGTime.calendar.component(.day, from: day))")
                    .font(.headline)
                    .fontWeight(isSelected ? .bold : .regular)
                    .foregroundStyle(isSelected ? Theme.textH : Theme.text)
                Circle()
                    .fill(isToday ? Theme.accent : .clear)
                    .frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isSelected ? Theme.surfaceWarm : .clear)
                    .overlay {
                        if isSelected {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(Theme.borderStrong, lineWidth: 1)
                        }
                    }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func dayOfWeekLabel(_ day: Date) -> String {
        let symbols = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return symbols[SGTime.jsWeekday(day)]
    }
}

// MARK: - Schedule card (desktop module-card language)

struct ScheduleCard: View {
    let item: ScheduleEngine.Item
    let now: Date

    private var isCurrent: Bool { item.start <= now && item.end > now }
    private var isPast: Bool { item.end <= now }
    private var moduleColor: Color {
        ModulePalette.color(moduleColor: item.colorHex, fallback: item.moduleCode ?? item.title)
    }

    /// 0…1 through the lesson, for the live progress bar on the current one.
    private var progress: Double {
        let total = item.end.timeIntervalSince(item.start)
        guard total > 0 else { return 1 }
        return min(max(now.timeIntervalSince(item.start) / total, 0), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(isCurrent ? Theme.accentGold : moduleColor)
                    .frame(width: 8, height: 8)
                Text(item.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textH)
                if let classNo = item.classNo {
                    Text(classNo)
                        .font(.caption2)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.surfaceHover, in: RoundedRectangle(cornerRadius: 4))
                        .foregroundStyle(Theme.text)
                }
                statusBadge
                Spacer(minLength: 0)
                Text(timeString(item.start))
                    .font(.system(size: 13, weight: .medium).monospacedDigit())
                    .foregroundStyle(Theme.text)
                Text("–")
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                Text(timeString(item.end))
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Theme.textMuted)
            }
            HStack(spacing: 8) {
                Text(item.subtitle)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                Label(item.venue, systemImage: "mappin")
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                if !item.attendInPerson {
                    Text("Online")
                        .font(.caption)
                        .foregroundStyle(Theme.info)
                }
                Spacer(minLength: 0)
            }
            if isCurrent {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.surfaceHover)
                        Capsule()
                            .fill(Theme.accentGold)
                            .frame(width: geo.size.width * progress)
                    }
                }
                .frame(height: 3)
                .animation(.linear(duration: 0.4), value: progress)
            }
        }
        .padding(.leading, 12)
        .padding(.vertical, 12)
        .padding(.trailing, 12)
        .listRowBackground(isCurrent ? Theme.surfaceWarm : nil)
        .opacity(isPast ? 0.55 : 1)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if isCurrent {
            HStack(spacing: 4) {
                Image(systemName: "clock.fill").font(.caption2)
                Text("Now")
                    .font(.caption)
            }
            .foregroundStyle(Theme.accentGold)
        } else if !isPast, item.start.timeIntervalSince(now) <= 90 * 60 {
            Text("Soon")
                .font(.caption)
                .foregroundStyle(Theme.warning)
        }
    }

    private func timeString(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}

// MARK: - Class detail sheet

struct ClassDetailSheet: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let item: ScheduleEngine.Item
    @State private var attendInPerson: Bool
    @State private var applying = false
    @State private var errorMessage: String?
    @State private var scopeAll = false

    init(item: ScheduleEngine.Item) {
        self.item = item
        _attendInPerson = State(initialValue: item.attendInPerson)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Module", value: item.title)
                    LabeledContent("Lesson", value: item.subtitle + (item.classNo.map { " · \($0)" } ?? ""))
                    LabeledContent("Time", value: "\(timeString(item.start)) – \(timeString(item.end))")
                    LabeledContent("Venue", value: item.venue)
                    if let moduleName = item.moduleName {
                        LabeledContent("Course", value: moduleName)
                    }
                }
                if item.kind == .classroom {
                    Section("Attendance") {
                        Toggle("Attend in person", isOn: $attendInPerson)
                            .disabled(applying)
                        Picker("Apply to", selection: $scopeAll) {
                            Text("This occurrence").tag(false)
                            Text("All instances").tag(true)
                        }
                        .pickerStyle(.segmented)
                        if applying {
                            HStack { ProgressView(); Text("Saving…").foregroundStyle(Theme.textMuted) }
                        }
                        if let errorMessage {
                            Text(errorMessage).foregroundStyle(Theme.error).font(.caption)
                        }
                    }
                    Section {
                        if let url = VenueDirectory.directionsURL(for: item.venue) {
                            Link(destination: url) {
                                Label("Get Directions to \(item.venue)", systemImage: "location.fill")
                            }
                            .tint(Theme.accent)
                        }
                        if let stop = VenueDirectory.stop(for: item.venue) {
                            LabeledContent("Suggested ISB stop", value: stop)
                        }
                    }
                }
                if item.linkedTaskCount > 0 {
                    Section {
                        LabeledContent("Linked tasks", value: "\(item.linkedTaskCount)")
                    } footer: {
                        Text("Manage linked tasks from the desktop app.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .toggleStyle(ThemeSwitchStyle())
            .navigationTitle(item.kind == .exam ? "Exam" : "Class")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.tint(Theme.accent)
                }
            }
            .onChange(of: attendInPerson) { _, newValue in
                saveAttendance(newValue)
            }
        }
    }

    private func saveAttendance(_ newValue: Bool) {
        applying = true
        errorMessage = nil
        Task {
            defer { applying = false }
            do {
                if let classId = item.classId {
                    try await appState.setAttendance(classId, inPerson: newValue,
                                                     occurrenceDate: item.occurrenceDateKey,
                                                     allInstances: scopeAll)
                }
            } catch {
                errorMessage = error.localizedDescription
                attendInPerson = item.attendInPerson
            }
        }
    }

    private func timeString(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}

// MARK: - NUSMods import sheet

struct ImportSheet: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var shareURL = ""
    @State private var busy = false
    @State private var resultMessage: String?
    @State private var succeeded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://nusmods.com/timetable/sem-1/share?…", text: $shareURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Paste from clipboard") {
                        if let text = UIPasteboard.general.string {
                            shareURL = text
                        }
                    }
                    .tint(Theme.accent)
                    Button {
                        importTimetable()
                    } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Text("Import timetable") }
                            Spacer()
                        }
                    }
                    .disabled(busy || !shareURL.lowercased().contains("nusmods"))
                    .tint(Theme.accent)
                } header: {
                    Text("NUSMods share link")
                } footer: {
                    Text("Open nusmods.com, build your timetable and copy the share link. Importing replaces your classes and exams.")
                }
                if let resultMessage {
                    Section {
                        Text(resultMessage)
                            .foregroundStyle(succeeded ? Theme.success : Theme.error)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Import timetable")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.tint(Theme.accent)
                }
            }
        }
    }

    private func importTimetable() {
        busy = true
        resultMessage = nil
        Task {
            defer { busy = false }
            do {
                try await appState.importTimetable(from: shareURL)
                succeeded = true
                resultMessage = "Timetable imported: \(appState.schedule.classes.count) classes, \(appState.schedule.exams.count) exams."
            } catch {
                succeeded = false
                resultMessage = error.localizedDescription
            }
        }
    }
}
