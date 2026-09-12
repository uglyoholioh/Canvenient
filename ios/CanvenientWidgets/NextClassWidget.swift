import WidgetKit
import SwiftUI
import CanvenientKit

/// "Up next" home-screen widget: the current or next class from the last
/// synced timetable, with venue and a live countdown. Timeline entries land
/// on every class boundary for the rest of the day so the widget rolls over
/// on its own between WidgetKit refreshes.
struct NextClassWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NextClassWidget", provider: NextClassProvider()) { entry in
            NextClassEntryView(entry: entry)
        }
        .configurationDisplayName("Next class")
        .description("Your current or upcoming lesson with venue and countdown, from the last synced timetable.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryCircular])
    }
}

struct NextClassEntry: TimelineEntry {
    let date: Date
    let current: ScheduleEngine.Item?
    let next: ScheduleEngine.Item?
    let upcoming: [ScheduleEngine.Item]
    let synced: Date?
    static let placeholder = NextClassEntry(date: Date(), current: nil, next: nil, upcoming: [], synced: nil)
}

struct NextClassProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextClassEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (NextClassEntry) -> Void) {
        completion(entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextClassEntry>) -> Void) {
        let now = Date()
        var entries = [entry(at: now)]
        // Recompute at each remaining class start/end today so "up next"
        // advances without waiting for WidgetKit's refresh budget.
        let calendar = SGTime.calendar
        let day = ScheduleEngine.items(for: WidgetData.schedule ?? .empty, on: now)
        var marks = Set<Date>([now])
        for item in day where item.end > now {
            marks.insert(max(item.start, now))
            marks.insert(item.end)
        }
        for mark in marks.sorted().dropFirst() {
            entries.append(entry(at: mark))
        }
        let nextCheck = (marks.max() ?? now).addingTimeInterval(15 * 60)
        completion(Timeline(entries: entries, policy: .after(nextCheck)))
    }

    private func entry(at date: Date) -> NextClassEntry {
        let schedule = WidgetData.schedule
        let nowNext = ScheduleEngine.nowAndNext(for: schedule ?? .empty, at: date)
        let upcoming = ScheduleEngine.items(for: schedule ?? .empty, on: date)
            .filter { $0.end > date }
        return NextClassEntry(date: date,
                              current: nowNext.current,
                              next: nowNext.next,
                              upcoming: upcoming,
                              synced: WidgetData.lastSync)
    }
}

struct NextClassEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NextClassEntry

    private var focus: ScheduleEngine.Item? { entry.current ?? entry.next }

    var body: some View {
        switch family {
        case .systemMedium: medium
        case .accessoryInline: inline
        case .accessoryCircular: circular
        default: small
        }
    }

    private var small: some View {
        Group {
            if let item = focus {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.moduleCode ?? item.title)
                        .font(.headline)
                        .foregroundStyle(Theme.textH)
                        .lineLimit(1)
                    Text(item.subtitle)
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Label {
                        Text(WidgetFormatting.clock(item.start, calendar: SGTime.calendar)
                             + "–" + WidgetFormatting.clock(item.end, calendar: SGTime.calendar))
                    } icon: {
                        Image(systemName: "clock")
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Theme.text)
                    Label(item.venue, systemImage: "mappin")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            } else {
                emptyState(icon: "calendar.badge.clock")
            }
        }
        .containerBackground(for: .widget) { Theme.bg }
        .widgetURL(URL(string: "canvenient://schedule")!)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(focus.map { _ in (entry.current != nil ? "Now" : "Up next") } ?? "No classes")
                    .font(.caption2.weight(.semibold))
                    .kerning(0.08)
                    .foregroundStyle(Theme.accent)
                if let item = focus {
                    Text(item.moduleCode ?? item.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Theme.textH)
                        .lineLimit(1)
                    Text(item.subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                    if item.start > entry.date {
                        Text(item.start, style: .relative)
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Theme.warning)
                    } else {
                        Text(WidgetFormatting.clock(item.start, calendar: SGTime.calendar)
                             + "–" + WidgetFormatting.clock(item.end, calendar: SGTime.calendar))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(Theme.text)
                    }
                    Label(item.venue, systemImage: "mappin")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                } else {
                    Text("Nothing left on the timetable.")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if !entry.upcoming.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("THEN")
                        .font(.system(size: 9, weight: .semibold))
                        .kerning(0.08)
                        .foregroundStyle(Theme.textMuted)
                    ForEach(entry.upcoming.prefix(3)) { item in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(ModulePalette.color(moduleColor: item.colorHex, fallback: item.moduleCode))
                                .frame(width: 5, height: 5)
                            Text(item.moduleCode ?? item.title)
                                .font(.caption2)
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Text(WidgetFormatting.clock(item.start, calendar: SGTime.calendar))
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }
                .frame(width: 108)
            }
        }
        .containerBackground(for: .widget) { Theme.bg }
        .widgetURL(URL(string: "canvenient://schedule")!)
    }

    private var inline: some View {
        Group {
            if let item = focus {
                Text("\(item.moduleCode ?? item.title) · \(WidgetFormatting.clock(item.start, calendar: SGTime.calendar)) \(item.venue)")
            } else {
                Text("No classes scheduled")
            }
        }
        .font(.caption)
    }

    private var circular: some View {
        Group {
            if let item = focus {
                VStack(spacing: 0) {
                    Text(item.moduleCode ?? "—")
                        .font(.caption2.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(WidgetFormatting.clock(item.start, calendar: SGTime.calendar))
                        .font(.system(size: 10).monospacedDigit())
                }
            } else {
                Image(systemName: "checkmark.circle")
                    .font(.caption)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }

    private func emptyState(icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Theme.textMuted)
            Text("Open Canvenient to sync your timetable")
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
            if let synced = entry.synced {
                Text("Last synced \(synced.formatted(date: .omitted, time: .shortened))")
                    .font(.caption2)
                    .foregroundStyle(Theme.textMuted.opacity(0.7))
            }
        }
    }
}
