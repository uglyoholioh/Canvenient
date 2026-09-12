import SwiftUI

/// Port of the desktop's module colour logic: `moduleHue` (32-bit hash →
/// hue 185-290), hsl(64%,58%) fallbacks and luminance-based card ink.
public enum ModulePalette {
    public static func hue(_ value: String?) -> Double {
        var hash: Int32 = 0
        for byte in (value ?? "Schedule").utf8 {
            hash = (hash &<< 5) &- hash &+ Int32(bitPattern: UInt32(byte & 0xFF))
        }
        let magnitude = hash == Int32.min ? Int32.max : Int32(abs(hash))
        return Double(185 + magnitude % 105)
    }

    /// Desktop precedence: explicit module_color (hex), else hsl(hue 64% 58%).
    public static func color(moduleColor: String?, fallback: String?) -> Color {
        if let moduleColor, let color = Color(moduleColorHex: moduleColor) {
            return color
        }
        return hslColor(hue: hue(fallback), saturation: 0.64, lightness: 0.58)
    }

    /// Card ink follows `moduleCardInk`: only explicit hex colours get a
    /// luminance check; hashed hsl fallbacks render with light ink.
    public static func ink(for colorString: String?) -> Color {
        guard let colorString else { return inkLight }
        var text = colorString.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt64(text, radix: 16) else { return inkLight }

        func linear(_ channel: Double) -> Double {
            if channel <= 0.04045 {
                return channel / 12.92
            }
            let base: Double = (channel + 0.055) / 1.055
            return pow(base, 2.4)
        }
        let red = linear(Double((value >> 16) & 0xFF) / 255.0)
        let green = linear(Double((value >> 8) & 0xFF) / 255.0)
        let blue = linear(Double(value & 0xFF) / 255.0)
        let luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        return luminance > 0.18 ? inkDark : inkLight
    }

    public static let inkLight = Color(red: 0.968, green: 0.973, blue: 0.976)
    public static let inkDark = Color(red: 0.133, green: 0.149, blue: 0.180)

    public static func hslColor(hue: Double, saturation: Double, lightness: Double) -> Color {
        func channel(_ offset: Double) -> Double {
            let rawK: Double = (offset + hue / 30.0).truncatingRemainder(dividingBy: 12.0)
            let k: Double = rawK < 0 ? rawK + 12.0 : rawK
            let a: Double = saturation * min(lightness, 1.0 - lightness)
            let down: Double = min(k - 3.0, 9.0 - k)
            return lightness - a * max(-1.0, min(down, 1.0))
        }
        let red = channel(0.0)
        let green = channel(8.0)
        let blue = channel(4.0)
        return Color(red: red, green: green, blue: blue)
    }
}
