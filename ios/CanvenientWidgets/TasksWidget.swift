import WidgetKit
import SwiftUI
import CanvenientKit

/// Tasks widget from the last synced snapshot: what's overdue and what's
/// due next. Small shows the counts, medium lists the next few rows.
struct TasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TasksWidget", provider: TasksProvider()) { entry in
            TasksEntryView(entry: entry)
        }
        .configurationDisplayName("Tasks")
        .description("Overdue count and what's due next, from the last synced task list.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

struct TasksEntry: TimelineEntry {
    let date: Date
    let tasks: [TaskOut]
    let synced: Date?
    static let placeholder = TasksEntry(date: Date(), tasks: [], synced: nil)
}

struct TasksProvider: TimelineProvider {
    func placeholder(in context: Context) -> TasksEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (TasksEntry) -> Void) {
        completion(entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TasksEntry>) -> Void) {
        // Snapshot data: one entry now, refreshed at WidgetKit's budget.
        completion(Timeline(entries: [entry(at: Date())],
                            policy: .after(Date().addingTimeInterval(30 * 60))))
    }

    private func entry(at date: Date) -> TasksEntry {
        TasksEntry(date: date, tasks: WidgetData.tasks, synced: WidgetData.lastSync)
    }
}

struct TasksEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TasksEntry

    private var overdueCount: Int {
        entry.tasks.filter { ($0.effectiveDueAt ?? .distantFuture) < entry.date }.count
    }

    var body: some View {
        switch family {
        case .systemMedium: medium
        case .accessoryCircular: circular
        default: small
        }
    }

    private var small: some View {
        Group {
            if entry.tasks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: "checklist")
                        .font(.title3)
                        .foregroundStyle(Theme.textMuted)
                    Text("No pending tasks")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(entry.tasks.count)")
                            .font(.system(size: 34, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Theme.textH)
                        Text("pending")
                            .font(.caption)
                            .foregroundStyle(Theme.textMuted)
                    }
                    Spacer(minLength: 0)
                    if overdueCount > 0 {
                        Label("\(overdueCount) overdue", systemImage: "exclamationmark.circle")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.error)
                    }
                    if let next = entry.tasks.first {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(next.title)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            if let due = next.effectiveDueAt {
                                Text("Due \(due, style: .relative)")
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(due < entry.date ? Theme.error : Theme.textMuted)
                            }
                        }
                    }
                }
            }
        }
        .containerBackground(for: .widget) { Theme.bg }
        .widgetURL(URL(string: "canvenient://tasks")!)
    }

    private var medium: some View {
        Group {
            if entry.tasks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: "checklist")
                        .font(.title3)
                        .foregroundStyle(Theme.textMuted)
                    Text("No pending tasks — you're all clear.")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("PENDING")
                            .font(.system(size: 9, weight: .semibold))
                            .kerning(0.08)
                            .foregroundStyle(Theme.textMuted)
                        Spacer()
                        if overdueCount > 0 {
                            Text("\(overdueCount) overdue")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Theme.error)
                        }
                    }
                    ForEach(entry.tasks.prefix(4)) { task in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(task.priority_manual == "urgent" ? Theme.error
                                      : task.priority_manual == "high" ? Theme.warning
                                      : Theme.textMuted)
                                .frame(width: 5, height: 5)
                            Text(task.title)
                                .font(.caption)
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if let due = task.effectiveDueAt {
                                Text(due < entry.date
                                     ? "Overdue"
                                     : WidgetFormatting.eta(minutes: Int(due.timeIntervalSince(entry.date) / 60),
                                                            from: entry.date))
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(due < entry.date ? Theme.error : Theme.textMuted)
                            }
                        }
                    }
                    if entry.tasks.count > 4 {
                        Text("+\(entry.tasks.count - 4) more")
                            .font(.caption2)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
        }
        .containerBackground(for: .widget) { Theme.bg }
        .widgetURL(URL(string: "canvenient://tasks")!)
    }

    private var circular: some View {
        Group {
            if overdueCount > 0 {
                Text("\(overdueCount)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Theme.error)
            } else {
                Text("\(entry.tasks.count)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Theme.textH)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}
