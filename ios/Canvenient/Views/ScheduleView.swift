import SwiftUI
import UIKit
import CanvenientKit

struct ScheduleView: View {
    @EnvironmentObject private var appState: AppState

    @State private var selectedDay = SGTime.startOfDay(Date())
    @State private var showingImport = false
    @State private var showingSettings = false
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
                if dayItems.isEmpty {
                    emptyState
                } else {
                    List {
                        Section(appState.academicWeek?.formatted ?? "") {
                            ForEach(dayItems) { item in
                                ScheduleRow(item: item, now: clock)
                                    .contentShape(Rectangle())
                                    .onTapGesture { detailItem = item }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingImport = true } label: {
                        Label("Import", systemImage: "square.and.arrow.down")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showingImport) { ImportSheet() }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(item: $detailItem) { item in
                ClassDetailSheet(item: item)
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
                .foregroundStyle(.secondary)
            Text(appState.scheduleLoaded ? "Nothing scheduled for this day" : "Loading your timetable…")
                .foregroundStyle(.secondary)
            if appState.scheduleLoaded && appState.schedule.classes.isEmpty {
                Button("Import from NUSMods") { showingImport = true }
                    .buttonStyle(.borderedProminent)
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
        HStack(spacing: 8) {
            ForEach(days, id: \.self) { day in
                let isSelected = SGTime.dateKey(day) == SGTime.dateKey(selectedDay)
                Button {
                    selectedDay = day
                } label: {
                    VStack(spacing: 2) {
                        Text(dayOfWeekLabel(day))
                            .font(.caption2)
                            .foregroundStyle(isSelected ? Color.white.opacity(0.8) : .secondary)
                        Text("\(SGTime.calendar.component(.day, from: day))")
                            .font(.headline)
                            .foregroundStyle(isSelected ? .white : .primary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(isSelected ? Color.accentColor : Color(.secondarySystemFill),
                                in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
    }

    private func dayOfWeekLabel(_ day: Date) -> String {
        let jsDow = SGTime.jsWeekday(day)
        let symbols = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return symbols[jsDow]
    }
}

// MARK: - Agenda row

struct ScheduleRow: View {
    let item: ScheduleEngine.Item
    let now: Date

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(itemColor)
                .frame(width: 4, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(item.title)
                        .fontWeight(.semibold)
                    if let classNo = item.classNo {
                        Text(classNo)
                            .font(.caption2)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color(.tertiarySystemFill), in: Capsule())
                    }
                    statusBadge
                }
                Text(item.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Label(item.venue, systemImage: "mappin")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(timeString(item.start))
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(timeString(item.end))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !item.attendInPerson {
                    Text("Online")
                        .font(.caption2)
                        .foregroundStyle(.blue)
                }
            }
        }
        .padding(.vertical, 2)
        .opacity(item.end < now ? 0.5 : 1)
    }

    private var itemColor: Color {
        Color(moduleColorHex: item.colorHex) ?? Color(stableHueFor: item.moduleCode ?? item.title)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if item.start <= now && item.end > now {
            Text("Now")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Color.green, in: Capsule())
        } else if let minutes = minutesUntil, minutes > 0, minutes <= 90 {
            Text("In \(minutes) min")
                .font(.caption2)
                .foregroundStyle(.orange)
        }
    }

    private var minutesUntil: Int? {
        let minutes = Int(item.start.timeIntervalSince(now) / 60)
        return minutes >= 0 ? minutes : nil
    }

    private func timeString(_ date: Date) -> String {
        let components = SGTime.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
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
            List {
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
                            HStack { ProgressView(); Text("Saving…").foregroundStyle(.secondary) }
                        }
                        if let errorMessage {
                            Text(errorMessage).foregroundStyle(.red).font(.caption)
                        }
                    }
                    Section {
                        if let url = VenueDirectory.directionsURL(for: item.venue) {
                            Link(destination: url) {
                                Label("Get Directions to \(item.venue)", systemImage: "location.fill")
                            }
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
            .navigationTitle(item.kind == .exam ? "Exam" : "Class")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
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
        let components = SGTime.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
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
                } header: {
                    Text("NUSMods share link")
                } footer: {
                    Text("Open nusmods.com, build your timetable and copy the share link. Importing replaces your classes and exams.")
                }
                if let resultMessage {
                    Section {
                        Text(resultMessage)
                            .foregroundStyle(succeeded ? Color.green : Color.red)
                    }
                }
            }
            .navigationTitle("Import timetable")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
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
