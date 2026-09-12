import SwiftUI

/// The desktop app's "Cobalt" workbench palette (frontend/src/index.css),
/// ported so both platforms read as one product. The iOS app is dark-first
/// like the desktop's default theme.
public enum Theme {
    public static let bg = Color(hexLiteral: 0x090A0D)
    public static let surface = Color(hexLiteral: 0x111318)
    public static let surfaceMuted = Color(hexLiteral: 0x171A22)
    public static let surfaceWarm = Color(hexLiteral: 0x1E222C)
    public static let surfaceHover = Color(hexLiteral: 0x262B38)

    public static let accent = Color(hexLiteral: 0x38BDF8)
    public static let accentGold = Color(hexLiteral: 0xE2B866)
    public static let brandDot = Color(hexLiteral: 0xE2563F)

    public static let border = Color(hexLiteral: 0x20242E)
    public static let borderStrong = Color(hexLiteral: 0x2F3545)

    public static let textH = Color(hexLiteral: 0xF8FAFC)
    public static let text = Color(hexLiteral: 0xCBD5E1)
    public static let textMuted = Color(hexLiteral: 0x64748B)

    public static let success = Color(hexLiteral: 0x10B981)
    public static let error = Color(hexLiteral: 0xF43F5E)
    public static let warning = Color(hexLiteral: 0xF59E0B)
    public static let info = Color(hexLiteral: 0x0EA5E9)
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
