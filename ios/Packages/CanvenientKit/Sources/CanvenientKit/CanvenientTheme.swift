import SwiftUI

/// The desktop app's "Cobalt" workbench palette (frontend/src/index.css),
/// ported so both platforms read as one product. The iOS app is dark-first
/// like the desktop's default theme.
public enum Theme {
    /// Monochrome "graphite" palette — black & white variants only.
    public static let bg = Color(hexLiteral: 0x101113)
    public static let surface = Color(hexLiteral: 0x151618)
    public static let surfaceMuted = Color(hexLiteral: 0x1A1B1E)
    public static let surfaceWarm = Color(hexLiteral: 0x202124)
    public static let surfaceHover = Color(hexLiteral: 0x28292D)

    /// Primary interactive tint: near-white; dark ink inverts on it.
    public static let accent = Color(hexLiteral: 0xE8E8EA)
    public static let accentInk = Color(hexLiteral: 0x111214)
    public static let accentGold = Color.white  // legacy gold spots -> white

    public static let brandDot = Color(hexLiteral: 0xE2563F)

    public static let border = Color.white.opacity(0.07)
    public static let borderStrong = Color.white.opacity(0.12)

    public static let textH = Color(hexLiteral: 0xF1F1F1)
    public static let text = Color(hexLiteral: 0xC8C8CA)
    public static let textMuted = Color(hexLiteral: 0x85868A)

    public static let success = Color(hexLiteral: 0x8FBA9E)
    public static let error = Color(hexLiteral: 0xD89196)
    public static let warning = Color(hexLiteral: 0xC9AD7B)
    public static let info = Color(hexLiteral: 0xA8BEC9)
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
