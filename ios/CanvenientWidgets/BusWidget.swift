import WidgetKit
import SwiftUI
import CanvenientKit

/// ISB arrivals for the default stop. The public nusbus.app relay needs no
/// auth, so this widget fetches live data straight from the device — no
/// Tailscale, no hosted backend. Falls back to the app's cached snapshot.
struct BusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BusWidget", provider: BusProvider()) { entry in
            BusEntryView(entry: entry)
        }
        .configurationDisplayName("ISB bus")
        .description("Next shuttle arrivals at your default stop, live from the NUS bus relay.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct BusEntry: TimelineEntry {
    struct Service: Identifiable {
        let name: String
        /// Arrival dates resolved against the entry date so the system can
        /// tick the countdown text between refreshes.
        let arrivals: [Date]

        var id: String { name }
    }

    let date: Date
    let stop: String
    let services: [Service]
    let stale: Bool
    static let placeholder = BusEntry(date: Date(), stop: "COM3", services: [], stale: false)
}

struct BusProvider: TimelineProvider {
    func placeholder(in context: Context) -> BusEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (BusEntry) -> Void) {
        Task { completion(await entry(at: Date())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BusEntry>) -> Void) {
        Task {
            let now = Date()
            let first = await entry(at: now)
            // The relay's numbers go stale fast; emit re-resolved entries
            // every 10 minutes for the next half hour, then ask for more.
            var entries = [first]
            for offset in stride(from: 10, through: 30, by: 10) {
                entries.append(await entry(at: now.addingTimeInterval(Double(offset) * 60)))
            }
            completion(Timeline(entries: entries,
                                policy: .after(now.addingTimeInterval(31 * 60))))
        }
    }

    private func entry(at date: Date) async -> BusEntry {
        let stop = SharedStore.isbStop
        var services: [BusEntry.Service] = []
        if let data = await WidgetData.arrivals(stop: stop) {
            let reference = data.updated_at.map { SGTime.parseDateTime($0) ?? date } ?? date
            services = data.arrivals.compactMap { service in
                let name = service.service
                let dates = service.minutes.compactMap { $0 }
                    .sorted()
                    .compactMap { minutes -> Date? in
                        let arrival = reference.addingTimeInterval(Double(minutes) * 60)
                        return arrival > date ? arrival : nil
                    }
                guard !dates.isEmpty else { return nil }
                return BusEntry.Service(name: name, arrivals: dates)
            }
        }
        return BusEntry(date: date, stop: stop, services: services, stale: false)
    }
}

struct BusEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BusEntry

    private var rows: Int { family == .systemMedium ? 5 : 3 }

    var body: some View {
        Group {
            if entry.services.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    header
                    Spacer(minLength: 0)
                    Image(systemName: "bus")
                        .font(.title3)
                        .foregroundStyle(Theme.textMuted)
                    Text("Timings unavailable right now")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    header
                    Spacer(minLength: 0)
                    ForEach(entry.services.prefix(rows)) { service in
                        HStack(spacing: 8) {
                            Text(service.name)
                                .font(.caption.bold())
                                .foregroundStyle(Theme.text)
                                .frame(width: 28, alignment: .leading)
                            firstEta(service)
                                .font(.callout.weight(.medium).monospacedDigit())
                                .foregroundStyle(Theme.textH)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            Spacer(minLength: 0)
                            if service.arrivals.count > 1 {
                                (Text("then ") + secondEta(service))
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(Theme.textMuted)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
            }
        }
        .containerBackground(for: .widget) { Theme.bg }
        .widgetURL(URL(string: "canvenient://campus")!)
    }

    private var header: some View {
        HStack(spacing: 4) {
            Image(systemName: "bus.fill")
                .font(.caption2)
                .foregroundStyle(Theme.accent)
            Text("ISB · \(entry.stop)")
                .font(.caption2.weight(.semibold))
                .kerning(0.06)
                .foregroundStyle(Theme.textMuted)
        }
    }

    private func firstEta(_ service: BusEntry.Service) -> Text {
        if let first = service.arrivals.first {
            return Text(first, style: .relative)
        }
        return Text("—")
    }

    private func secondEta(_ service: BusEntry.Service) -> Text {
        if let second = service.arrivals.dropFirst().first {
            return Text(second, style: .relative)
        }
        return Text("—")
    }
}
