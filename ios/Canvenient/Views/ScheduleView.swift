import SwiftUI
import UIKit
import CanvenientKit

struct ScheduleView: View {
    @EnvironmentObject private var appState: AppState

    @State private var selectedDay = SGTime.startOfDay(Date())
    @State private var showingImport = false
    @State private var detailItem: ScheduleEngine.Item?
    @State private var clock = Date()

    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var dayItems: [ScheduleEngine.Item] {
        ScheduleEngine.items(for: appState.schedule, on: selectedDay)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                WeekStrip(selectedDay: $selectedDay)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                if dayItems.isEmpty {
                    emptyState
                } else {
                    List {
                        if let week = appState.academicWeek {
                            SectionLabel(text: week.formatted)
                        }
                        ForEach(dayItems) { item in
                            ScheduleCard(item: item, now: clock)
                                .onTapGesture { detailItem = item }
                        }
                    }
                    .listStyle(.plain)
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
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: 44))
                .foregroundStyle(Theme.textMuted)
            Text(appState.scheduleLoaded ? "Nothing scheduled for this day" : "Loading your timetable…")
                .foregroundStyle(Theme.textMuted)
            if appState.scheduleLoaded && appState.schedule.classes.isEmpty {
                Button("Import from NUSMods") { showingImport = true }
                    .buttonStyle(AccentFilledButtonStyle())
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Week day selector

struct WeekStrip: View {
    @Binding var selectedDay: Date

    var body: some View {
        let days = (0..<7).map { SGTime.addDays(Date(), $0) }
        HStack(spacing: 6) {
            ForEach(days, id: \.self) { day in
                let isSelected = SGTime.dateKey(day) == SGTime.dateKey(selectedDay)
                Button {
                    selectedDay = day
                } label: {
                    VStack(spacing: 2) {
                        Text(dayOfWeekLabel(day))
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundStyle(isSelected ? Theme.textH : Theme.textMuted)
                        Text("\(SGTime.calendar.component(.day, from: day))")
                            .font(.headline)
                            .fontWeight(isSelected ? .bold : .regular)
                            .foregroundStyle(isSelected ? Theme.accent : Theme.text)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
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

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
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
            }
            .padding(.leading, 12)
            .padding(.vertical, 12)
            .padding(.trailing, 12)
        }
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
