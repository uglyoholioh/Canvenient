import SwiftUI
import CanvenientKit

/// App-side chrome helpers built on the shared Cobalt tokens.

/// Desktop-style form: same content, but on the workbench palette.
struct ThemedFormModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .listRowBackground(Theme.surface)
            .toggleStyle(ThemeSwitchStyle())
    }
}

extension View {
    func themedForm() -> some View {
        modifier(ThemedFormModifier())
    }
}

/// Filled accent button pairing the palette's accent fill with its inverse
/// ink — the desktop's `.btn--primary` (`--primary` + `--text-inverse`).
/// The system `.borderedProminent` hardcodes a white label, which vanishes
/// on the graphite palette's near-white accent.
struct AccentFilledButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Theme.accentInk)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                Theme.accent.opacity(configuration.isPressed ? 0.72 : 1),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .opacity(isEnabled ? 1 : 0.4)
    }
}

/// Switch pairing the accent track with the inverse knob when on (the
/// desktop's checked treatment: `--accent` + `--text-inverse` glyph) and a
/// muted track with a light knob when off. The system switch keeps a white
/// knob in every state, which disappears on the graphite palette.
struct ThemeSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 0) {
            configuration.label
            Spacer(minLength: 12)
            RoundedRectangle(cornerRadius: 15.5, style: .continuous)
                .fill(configuration.isOn ? Theme.accent : Theme.surfaceHover)
                .frame(width: 51, height: 31)
                .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                    Circle()
                        .fill(configuration.isOn ? Theme.accentInk : Theme.text)
                        .frame(width: 27, height: 27)
                        .padding(2)
                }
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        configuration.isOn.toggle()
                    }
                }
        }
    }
}

struct ThemeCardBackground: ViewModifier {
    var fill: Color = Theme.surface
    var radius: CGFloat = 10

    func body(content: Content) -> some View {
        content
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )
    }
}

extension View {
    func themeCard(fill: Color = Theme.surface, radius: CGFloat = 10) -> some View {
        modifier(ThemeCardBackground(fill: fill, radius: radius))
    }
}

/// Favourite ISB stops live as a CSV string in app storage (shared with
/// BusView and the Today card) so no schema or sync is needed.
enum FavouriteStops {
    static func list(_ raw: String) -> [String] {
        raw.split(separator: ",").map(String.init)
    }

    static func contains(_ stop: String, in raw: String) -> Bool {
        list(raw).contains(stop)
    }

    static func toggled(_ stop: String, in raw: String) -> String {
        var stops = list(raw)
        if let index = stops.firstIndex(of: stop) {
            stops.remove(at: index)
        } else {
            stops.append(stop)
        }
        return stops.joined(separator: ",")
    }
}

/// Horizontal shake used to flag a failed sign-in. Drive `animatableData`
/// with an attempt counter inside `withAnimation` — the sine curve turns the
/// interpolation into the shake.
struct ShakeEffect: GeometryEffect {
    var travel: CGFloat = 7
    var shakesPerUnit: CGFloat = 3
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        let x = travel * sin(animatableData * .pi * shakesPerUnit * 2)
        return ProjectionTransform(CGAffineTransform(translationX: x, y: 0))
    }
}

/// Press feedback for tappable cards and rows: a slight shrink toward the
/// finger, the way the system's contexts do it.
struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// Small-caps section label used across the desktop's modules.
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.textMuted)
    }
}
