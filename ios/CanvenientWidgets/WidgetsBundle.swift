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
            // Lock Screen presentation.
            LockScreenClassCard(context: context)
                .activityBackgroundTint(Color(.systemBackground).opacity(0.001))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.moduleCode)
                            .font(.headline)
                            .bold()
                        Text(context.attributes.lessonType)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PhaseCountdown(context: context)
                        .font(.title3)
                        .bold()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Label(context.attributes.venue, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .lineLimit(1)
                        Spacer()
                        BusLine(context: context)
                        DirectionsButton(venue: context.attributes.venue)
                    }
                }
            } compactLeading: {
                Image(systemName: "calendar")
                    .foregroundStyle(classColor(context.attributes.colorHex))
            } compactTrailing: {
                PhaseCountdown(context: context)
                    .font(.caption2)
                    .monospacedDigit()
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "calendar")
                    .foregroundStyle(classColor(context.attributes.colorHex))
            }
            .keylineTint(classColor(context.attributes.colorHex))
        }
    }
}

// MARK: - Shared pieces

private func classColor(_ hex: String?) -> Color {
    Color(moduleColorHex: hex) ?? .accentColor
}

/// Countdown that ticks on-device: "Starts in mm:ss" before class,
/// "Ends in" once it has begun. No network needed for the timer itself.
struct PhaseCountdown: View {
    let context: ActivityViewContext<ClassActivityAttributes>

    var body: some View {
        if Date() < context.state.classStart {
            Text(timerInterval: Date()...max(context.state.classStart, Date().addingTimeInterval(1)), countsDown: true)
        } else {
            Text(timerInterval: Date()...max(context.state.classEnd, Date().addingTimeInterval(1)), countsDown: true)
        }
    }
}

struct BusLine: View {
    let context: ActivityViewContext<ClassActivityAttributes>

    var body: some View {
        if let service = context.state.busService, let arrival = context.state.busArrival,
           arrival > Date() {
            HStack(spacing: 3) {
                Image(systemName: "bus.fill")
                Text(service)
                Text(timerInterval: Date()...arrival, countsDown: true)
                    .monospacedDigit()
            }
            .font(.caption2)
            .foregroundStyle(.orange)
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
    }
}

struct LockScreenClassCard: View {
    let context: ActivityViewContext<ClassActivityAttributes>

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top) {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(classColor(context.attributes.colorHex))
                        .frame(width: 4, height: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.moduleCode)
                            .font(.headline)
                            .bold()
                        Text(context.attributes.lessonType)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    PhaseCountdown(context: context)
                        .font(.title3)
                        .bold()
                        .monospacedDigit()
                    Text(context.state.classStart.formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Label(context.attributes.venue, systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .lineLimit(1)
                Spacer()
                BusLine(context: context)
                DirectionsButton(venue: context.attributes.venue)
            }
        }
        .padding(14)
    }
}
