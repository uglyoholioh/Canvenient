import SwiftUI
import Foundation

/// Theme palettes ported from the desktop's index.css so the iOS app matches
/// whatever look the Mac app is set to. All are dark; graphite is monochrome.
public enum ThemeMode: String, CaseIterable, Identifiable {
    case graphite
    case cobalt
    case dusk

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .graphite: return "Graphite"
        case .cobalt: return "Cobalt"
        case .dusk: return "Dusk"
        }
    }
}

public struct ThemePalette {
    public let bg: Color
    public let surface: Color
    public let surfaceMuted: Color
    public let surfaceWarm: Color
    public let surfaceHover: Color
    public let accent: Color
    public let accentInk: Color
    public let accentGold: Color
    public let brandDot: Color
    public let border: Color
    public let borderStrong: Color
    public let textH: Color
    public let text: Color
    public let textMuted: Color
    public let success: Color
    public let error: Color
    public let warning: Color
    public let info: Color
}

public enum Theme {
    public static let modeKey = "theme"

    /// App writes its own defaults first, shared suite second (so widgets and
    /// a re-installed app can pick the theme up); getter prefers the local
    /// value and falls back to the mirrored one.
    public static var mode: ThemeMode {
        get {
            if let raw = UserDefaults.standard.string(forKey: modeKey),
               let mode = ThemeMode(rawValue: raw) { return mode }
            if let raw = SharedStore.defaults.string(forKey: modeKey),
               let mode = ThemeMode(rawValue: raw) { return mode }
            return .graphite
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: modeKey)
            SharedStore.defaults.set(newValue.rawValue, forKey: modeKey)
        }
    }

    static var current: ThemePalette { palettes[mode] ?? palettes[.graphite]! }

    // Computed so a palette switch restyles every view after rebuild.
    public static var bg: Color { current.bg }
    public static var surface: Color { current.surface }
    public static var surfaceMuted: Color { current.surfaceMuted }
    public static var surfaceWarm: Color { current.surfaceWarm }
    public static var surfaceHover: Color { current.surfaceHover }
    public static var accent: Color { current.accent }
    public static var accentInk: Color { current.accentInk }
    public static var accentGold: Color { current.accentGold }
    public static var brandDot: Color { current.brandDot }
    public static var border: Color { current.border }
    public static var borderStrong: Color { current.borderStrong }
    public static var textH: Color { current.textH }
    public static var text: Color { current.text }
    public static var textMuted: Color { current.textMuted }
    public static var success: Color { current.success }
    public static var error: Color { current.error }
    public static var warning: Color { current.warning }
    public static var info: Color { current.info }

    public static let palettes: [ThemeMode: ThemePalette] = [
        .graphite: ThemePalette(
            bg: Color(hexLiteral: 0x101113), surface: Color(hexLiteral: 0x151618),
            surfaceMuted: Color(hexLiteral: 0x1A1B1E), surfaceWarm: Color(hexLiteral: 0x202124),
            surfaceHover: Color(hexLiteral: 0x28292D), accent: Color(hexLiteral: 0xE8E8EA),
            accentInk: Color(hexLiteral: 0x111214), accentGold: .white,
            brandDot: Color(hexLiteral: 0xE2563F), border: .white.opacity(0.07),
            borderStrong: .white.opacity(0.12), textH: Color(hexLiteral: 0xF1F1F1),
            text: Color(hexLiteral: 0xC8C8CA), textMuted: Color(hexLiteral: 0x85868A),
            success: Color(hexLiteral: 0x8FBA9E), error: Color(hexLiteral: 0xD89196),
            warning: Color(hexLiteral: 0xC9AD7B), info: Color(hexLiteral: 0xA8BEC9)
        ),
        .cobalt: ThemePalette(
            bg: Color(hexLiteral: 0x090A0D), surface: Color(hexLiteral: 0x111318),
            surfaceMuted: Color(hexLiteral: 0x171A22), surfaceWarm: Color(hexLiteral: 0x1E222C),
            surfaceHover: Color(hexLiteral: 0x262B38), accent: Color(hexLiteral: 0x38BDF8),
            accentInk: Color(hexLiteral: 0x090A0D), accentGold: Color(hexLiteral: 0xE2B866),
            brandDot: Color(hexLiteral: 0xE2563F), border: Color(hexLiteral: 0x20242E),
            borderStrong: Color(hexLiteral: 0x2F3545), textH: Color(hexLiteral: 0xF8FAFC),
            text: Color(hexLiteral: 0xCBD5E1), textMuted: Color(hexLiteral: 0x64748B),
            success: Color(hexLiteral: 0x10B981), error: Color(hexLiteral: 0xF43F5E),
            warning: Color(hexLiteral: 0xF59E0B), info: Color(hexLiteral: 0x0EA5E9)
        ),
        .dusk: ThemePalette(
            bg: Color(hexLiteral: 0x14131A), surface: Color(hexLiteral: 0x191720),
            surfaceMuted: Color(hexLiteral: 0x201D29), surfaceWarm: Color(hexLiteral: 0x292535),
            surfaceHover: Color(hexLiteral: 0x322D40), accent: Color(hexLiteral: 0xB7A6D8),
            accentInk: Color(hexLiteral: 0x14131A), accentGold: Color(hexLiteral: 0xD1BFA0),
            brandDot: Color(hexLiteral: 0xE2563F), border: .white.opacity(0.07),
            borderStrong: .white.opacity(0.12), textH: Color(hexLiteral: 0xF0EDF4),
            text: Color(hexLiteral: 0xC8C4D0), textMuted: Color(hexLiteral: 0x8A8698),
            success: Color(hexLiteral: 0x9BC4A8), error: Color(hexLiteral: 0xD89BA2),
            warning: Color(hexLiteral: 0xCBB48C), info: Color(hexLiteral: 0xA8BEC9)
        ),
    ]
}

public extension Color {
    init(hexLiteral: UInt) {
        self.init(
            red: Double((hexLiteral >> 16) & 0xFF) / 255.0,
            green: Double((hexLiteral >> 8) & 0xFF) / 255.0,
            blue: Double(hexLiteral & 0xFF) / 255.0
        )
    }
}

/// Preference keys shared by settings and their consumers.
public enum Preferences {
    public static let isbAutoRefresh = "isbAutoRefresh"
    public static let hapticsEnabled = "hapticsEnabled"
    public static let liveActivityEnabled = "liveActivityEnabled"
    public static let classRemindersEnabled = "classRemindersEnabled"
    public static let taskRemindersEnabled = "taskRemindersEnabled"

    /// Reads a boolean preference; unset keys return the supplied default.
    public static func bool(_ key: String, default defaultValue: Bool) -> Bool {
        (UserDefaults.standard.object(forKey: key) as? Bool) ?? defaultValue
    }
}
