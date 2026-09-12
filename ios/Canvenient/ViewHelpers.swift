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

/// Small-caps section label used across the desktop's modules.
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.textMuted)
    }
}
