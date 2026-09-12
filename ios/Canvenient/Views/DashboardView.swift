import SwiftUI
import CanvenientKit

/// Mobile take on the desktop dashboard: stacked widget cards for the day's
/// agenda, tasks, campus bus and free venues.
struct DashboardView: View {
    @EnvironmentObject private var appState: AppState

    @AppStorage("canvenient.isb.stop") private var selectedStop = "COM3"
    @State private var arrivals: BusArrivalsResponse?
    @State private var clock = Date()

    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let week = appState.academicWeek {
                        SectionLabel(text: week.formatted)
                    }
                    upNextWidget
                    todayWidget
                    tasksWidget
                    busWidget
                    venuesWidget
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Theme.bg)
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .task { await refresh() }
            .onReceive(timer) { clock = $0; Task { await refreshBus() } }
            .refreshable { await refresh() }
            .onChange(of: selectedStop) { _, _ in Task { await refreshBus() } }
        }
    }

    private func refresh() async {
        async let schedule: Void = appState.refreshSchedule()
        async let tasks: Void = appState.refreshTasks()
        async let bus: Void = refreshBus()
        _ = await (schedule, tasks, bus)
    }

    private func refreshBus() async {
        arrivals = try? await appState.api.busArrivals(stop: selectedStop)
    }

    // MARK: Up next

    private var upNextWidget: some View {
        let nowNext = ScheduleEngine.nowAndNext(for: appState.schedule)
        let focus = nowNext.current ?? nowNext.next
        return WidgetCard(title: "Up next", systemImage: "calendar.badge.clock") {
            if let focus {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(focus.title)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.textH)
                        Spacer()
                        Text("\(timeString(focus.start))–\(timeString(focus.end))")
                            .font(.system(size: 13, weight: .medium).monospacedDigit())
                            .foregroundStyle(Theme.text)
                    }
                    let classPart = focus.classNo.map { " · \($0)" } ?? ""
                    Label("\(focus.subtitle)\(classPart) · \(focus.venue)", systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                    if focus.start > clock {
                        Text(relatives(focus.start))
                            .font(.caption)
                            .foregroundStyle(Theme.warning)
                    } else {
                        Text("Happening now")
                            .font(.caption)
                            .foregroundStyle(Theme.success)
                    }
                }
            } else {
                Text("Nothing else today")
                    .foregroundStyle(Theme.textMuted)
                    .font(.callout)
            }
        } footer: {
            EmptyView()
        }
    }

    // MARK: Today

    private var todayItems: [ScheduleEngine.Item] {
        ScheduleEngine.items(for: appState.schedule, on: Date())
    }

    private var todayWidget: some View {
        WidgetCard(title: "Today", systemImage: "sun.max") {
            let items = Array(todayItems.prefix(3))
            if items.isEmpty {
                Text("No classes today")
                    .foregroundStyle(Theme.textMuted)
                    .font(.callout)
            } else {
                VStack(spacing: 8) {
                    ForEach(items) { item in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(ModulePalette.color(moduleColor: item.colorHex, fallback: item.moduleCode))
                                .frame(width: 7, height: 7)
                            Text(item.title)
                                .font(.callout)
                                .foregroundStyle(Theme.text)
                            Spacer()
                            Text(timeString(item.start))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }
            }
        } footer: {
            Button("Open schedule") { appState.selectedTab = .schedule }
                .font(.caption)
        }
    }

    // MARK: Tasks

    private var pendingTasks: [TaskOut] {
        appState.tasks.filter { !$0.isDone }
            .sorted { ($0.effectiveDueAt ?? .distantFuture) < ($1.effectiveDueAt ?? .distantFuture) }
    }

    private var overdueCount: Int {
        pendingTasks.filter { ($0.effectiveDueAt ?? .distantFuture) < Date() }.count
    }

    private var tasksWidget: some View {
        WidgetCard(title: "Tasks", systemImage: "checklist") {
            if pendingTasks.isEmpty {
                Text("All clear")
                    .foregroundStyle(Theme.textMuted)
                    .font(.callout)
            } else {
                VStack(spacing: 8) {
                    if overdueCount > 0 {
                        HStack(spacing: 6) {
                            Circle().fill(Theme.error).frame(width: 7, height: 7)
                            Text("\(overdueCount) overdue")
                                .font(.callout)
                                .foregroundStyle(Theme.error)
                            Spacer()
                        }
                    }
                    ForEach(Array(pendingTasks.prefix(3))) { task in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(task.priority_manual == "urgent" ? Theme.error
                                      : task.priority_manual == "high" ? Theme.warning
                                      : Theme.textMuted)
                                .frame(width: 7, height: 7)
                                .padding(.top, 7)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(task.title)
                                    .font(.callout)
                                    .foregroundStyle(Theme.text)
                                    .lineLimit(1)
                                if let due = task.effectiveDueAt {
                                    Text(due < Date() ? "Overdue"
                                         : due.formatted(date: .omitted, time: .shortened))
                                        .font(.caption.monospacedDigit())
                                        .foregroundStyle(due < Date() ? Theme.error : Theme.textMuted)
                                }
                            }
                            Spacer()
                        }
                    }
                }
            }
        } footer: {
            Button("Open tasks") { appState.selectedTab = .tasks }
                .font(.caption)
        }
    }

    // MARK: Campus bus

    private var busWidget: some View {
        WidgetCard(title: "ISB · \(selectedStop)", systemImage: "bus") {
            let services = arrivals?.arrivals.prefix(3) ?? []
            if services.isEmpty {
                Text("Timings unavailable right now")
                    .foregroundStyle(Theme.textMuted)
                    .font(.callout)
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(services), id: \.service) { service in
                        let etas = service.minutes.compactMap { $0 }
                        HStack(spacing: 8) {
                            Text(service.service)
                                .font(.caption.bold())
                                .frame(width: 30)
                                .foregroundStyle(Theme.text)
                            if let first = etas.first {
                                Text(first == 0 ? "Now" : "\(first) min")
                                    .font(.callout.weight(.medium))
                                    .foregroundStyle(Theme.text)
                            }
                            Spacer()
                            if etas.count > 1 {
                                Text("then \(etas.dropFirst().map(String.init).joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                    }
                }
            }
        } footer: {
            Button("Open bus times") { appState.selectedTab = .campus }
                .font(.caption)
        }
    }

    // MARK: Venues

    private var venuesWidget: some View {
        WidgetCard(title: "Free venues", systemImage: "building.2") {
            Text("Find a free room or lecture theatre near you, right now.")
                .font(.callout)
                .foregroundStyle(Theme.textMuted)
        } footer: {
            Button("Open venue finder") { appState.selectedTab = .campus }
                .font(.caption)
        }
    }

    private func timeString(_ date: Date) -> String {
        let components = SGTime.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }

    private func relatives(_ date: Date) -> String {
        let minutes = Int(date.timeIntervalSince(clock) / 60)
        if minutes >= 60 {
            return "In \(minutes / 60) h \(minutes % 60) min"
        }
        return "In \(max(minutes, 0)) min"
    }
}

/// Desktop-style widget card: quiet surface, hairline border, section label.
struct WidgetCard<Content: View, Footer: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: () -> Content
    @ViewBuilder let footer: () -> Footer

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textMuted)
                Spacer()
            }
            content()
            Divider().overlay(Theme.border)
            footer()
        }
        .padding(14)
        .themeCard()
    }
}
