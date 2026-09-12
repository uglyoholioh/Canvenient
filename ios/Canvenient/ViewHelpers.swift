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
    }
}

extension View {
    func themedForm() -> some View {
        modifier(ThemedFormModifier())
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
