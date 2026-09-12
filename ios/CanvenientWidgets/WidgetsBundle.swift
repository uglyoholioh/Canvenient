import WidgetKit
import SwiftUI
import ActivityKit
import CanvenientKit

@main
struct CanvenientWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ClassLiveActivity()
    }
}

struct ClassLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ClassActivityAttributes.self) { context in
            // Lock Screen presentation. Tapping anywhere outside the buttons
            // opens the app on the schedule tab.
            LockScreenClassCard(context: context)
                .widgetURL(URL(string: "canvenient://schedule")!)
                .activityBackgroundTint(Theme.surfaceWarm)
                .activitySystemActionForegroundColor(Theme.text)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.moduleCode)
                            .font(.headline)
                            .bold()
                            .foregroundStyle(Theme.textH)
                        Text(context.attributes.lessonType)
                            .font(.caption2)
                            .foregroundStyle(Theme.text)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.classStart.formatted(date: .omitted, time: .shortened))
                        .font(.title3)
                        .bold()
                        .monospacedDigit()
                        .foregroundStyle(Theme.textH)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Label(context.attributes.venue, systemImage: "mappin.and.ellipse")
                                .font(.caption)
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            Spacer()
                            BusLine(context: context)
                            OpenScheduleButton()
                            DirectionsButton(venue: context.attributes.venue)
                        }
                        if let next = context.state.nextModuleCode,
                           let nextStart = context.state.nextStartTime {
                            Label("Then \(next) · \(nextStart.formatted(date: .omitted, time: .shortened))",
                                  systemImage: "arrow.turn.down.right")
                                .font(.caption2)
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "calendar")
                    .foregroundStyle(classColor(context.attributes.colorHex))
            } compactTrailing: {
                Text(context.state.classStart.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "calendar")
                    .foregroundStyle(classColor(context.attributes.colorHex))
            }
            .keylineTint(classColor(context.attributes.colorHex))
            .widgetURL(URL(string: "canvenient://schedule")!)
        }
    }
}

// MARK: - Shared pieces

private func classColor(_ hex: String?) -> Color {
    Color(moduleColorHex: hex) ?? Color.white.opacity(0.85)
}

struct BusLine: View {
    let context: ActivityViewContext<ClassActivityAttributes>

    var body: some View {
        if let service = context.state.busService, let arrival = context.state.busArrival,
           arrival > Date() {
            HStack(spacing: 3) {
                Image(systemName: "bus.fill")
                Text(service)
                Text(arrival.formatted(date: .omitted, time: .shortened))
            }
            .font(.caption2)
            .foregroundStyle(Theme.warning)
        }
    }
}

struct DirectionsButton: View {
    let venue: String

    var body: some View {
        Button(intent: DirectionsIntent(venue: venue)) {
            Label("Directions", systemImage: "location.fill")
                .font(.caption2)
                .fontWeight(.semibold)
                .labelStyle(.titleAndIcon)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.mini)
        .tint(Theme.accent)
        .foregroundStyle(Theme.accentInk)
    }
}

struct OpenScheduleButton: View {
    var body: some View {
        Button(intent: OpenScheduleIntent()) {
            Label("Schedule", systemImage: "calendar")
                .font(.caption2)
                .fontWeight(.semibold)
                .labelStyle(.titleAndIcon)
        }
        .buttonStyle(.bordered)
        .controlSize(.mini)
        .tint(Theme.text)
    }
}

struct LockScreenClassCard: View {
    let context: ActivityViewContext<ClassActivityAttributes>

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top) {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(classColor(context.attributes.colorHex))
                        .frame(width: 3, height: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.moduleCode)
                            .font(.headline)
                            .bold()
                            .foregroundStyle(Theme.textH)
                        Text(context.attributes.lessonType.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .kerning(0.08)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(context.state.classStart.formatted(date: .omitted, time: .shortened)) – \(context.state.classEnd.formatted(date: .omitted, time: .shortened))")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .foregroundStyle(Theme.textH)
                    Text(context.attributes.venue)
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }
            HStack {
                if let next = context.state.nextModuleCode,
                   let nextStart = context.state.nextStartTime {
                    Label("Then \(next) · \(nextStart.formatted(date: .omitted, time: .shortened))",
                          systemImage: "arrow.turn.down.right")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
                Spacer()
                BusLine(context: context)
                OpenScheduleButton()
                DirectionsButton(venue: context.attributes.venue)
            }
        }
        .padding(14)
    }
}
