import Foundation
import SwiftUI

/// Venue → campus-area coordinates (bundled fallback ported from the
/// backend's BUILDING_CENTROIDS so the Get Directions button and Live
/// Activities work with zero network), plus the venue → ISB stop hints ported
/// from the desktop bus module.
public enum VenueDirectory {
    public struct Coordinate: Equatable {
        public var latitude: Double
        public var longitude: Double
        public var building: String
    }

    static let centroids: [(prefix: String, coordinate: Coordinate)] = [
        ("COM1", Coordinate(latitude: 1.29495, longitude: 103.77372, building: "School of Computing 1")),
        ("COM2", Coordinate(latitude: 1.29424, longitude: 103.77402, building: "School of Computing 2")),
        ("COM3", Coordinate(latitude: 1.29443, longitude: 103.77284, building: "School of Computing 3")),
        ("COM4", Coordinate(latitude: 1.29460, longitude: 103.77300, building: "School of Computing 4")),
        ("AS1", Coordinate(latitude: 1.29528, longitude: 103.77123, building: "FASS 1")),
        ("AS2", Coordinate(latitude: 1.29505, longitude: 103.77085, building: "FASS 2")),
        ("AS3", Coordinate(latitude: 1.29555, longitude: 103.77165, building: "FASS 3")),
        ("AS4", Coordinate(latitude: 1.29580, longitude: 103.77210, building: "FASS 4")),
        ("AS5", Coordinate(latitude: 1.29475, longitude: 103.77040, building: "FASS 5")),
        ("AS6", Coordinate(latitude: 1.29532, longitude: 103.77265, building: "FASS 6")),
        ("AS7", Coordinate(latitude: 1.29420, longitude: 103.77005, building: "FASS 7")),
        ("AS8", Coordinate(latitude: 1.29380, longitude: 103.76970, building: "FASS 8")),
        ("BIZ1", Coordinate(latitude: 1.29315, longitude: 103.77485, building: "Mochtar Riady Building (BIZ1)")),
        ("BIZ2", Coordinate(latitude: 1.29375, longitude: 103.77445, building: "Biz 2 Building")),
        ("E1", Coordinate(latitude: 1.30005, longitude: 103.77120, building: "Engineering E1")),
        ("E2", Coordinate(latitude: 1.29975, longitude: 103.77160, building: "Engineering E2")),
        ("E3", Coordinate(latitude: 1.29950, longitude: 103.77210, building: "Engineering E3")),
        ("E4", Coordinate(latitude: 1.29910, longitude: 103.77240, building: "Engineering E4")),
        ("E5", Coordinate(latitude: 1.29875, longitude: 103.77280, building: "Engineering E5")),
        ("EA", Coordinate(latitude: 1.30040, longitude: 103.77050, building: "Engineering EA")),
        ("EW1", Coordinate(latitude: 1.29840, longitude: 103.77180, building: "Engineering Workshop 1")),
        ("EW2", Coordinate(latitude: 1.29810, longitude: 103.77220, building: "Engineering Workshop 2")),
        ("S1", Coordinate(latitude: 1.29690, longitude: 103.78010, building: "Science S1")),
        ("S2", Coordinate(latitude: 1.29650, longitude: 103.78040, building: "Science S2")),
        ("S3", Coordinate(latitude: 1.29620, longitude: 103.78060, building: "Science S3")),
        ("S4", Coordinate(latitude: 1.29590, longitude: 103.78090, building: "Science S4")),
        ("S16", Coordinate(latitude: 1.29740, longitude: 103.77970, building: "Science S16")),
        ("S17", Coordinate(latitude: 1.29785, longitude: 103.78035, building: "Science S17")),
        ("MD1", Coordinate(latitude: 1.29540, longitude: 103.78180, building: "Tahir Foundation Building (MD1)")),
        ("MD3", Coordinate(latitude: 1.29510, longitude: 103.78250, building: "Medicine MD3")),
        ("MD6", Coordinate(latitude: 1.29470, longitude: 103.78310, building: "Centre for Translational Medicine (MD6)")),
        ("MD11", Coordinate(latitude: 1.29410, longitude: 103.78220, building: "Medicine MD11")),
        ("SDE1", Coordinate(latitude: 1.29780, longitude: 103.77020, building: "SDE 1")),
        ("SDE2", Coordinate(latitude: 1.29740, longitude: 103.77060, building: "SDE 2")),
        ("SDE3", Coordinate(latitude: 1.29710, longitude: 103.77090, building: "SDE 3")),
        ("SDE4", Coordinate(latitude: 1.29680, longitude: 103.77120, building: "SDE 4")),
        ("UT", Coordinate(latitude: 1.30390, longitude: 103.77400, building: "University Town (UTown)")),
        ("ERC", Coordinate(latitude: 1.30380, longitude: 103.77350, building: "Education Resource Centre (UTown)")),
        ("CLB", Coordinate(latitude: 1.29660, longitude: 103.77320, building: "Central Library")),
        ("YIH", Coordinate(latitude: 1.29850, longitude: 103.77450, building: "Yusof Ishak House")),
        ("LT", Coordinate(latitude: 1.29600, longitude: 103.77300, building: "Lecture Theatre")),
    ]

    /// Longest building-prefix match against the venue string.
    public static func coordinates(for venue: String?) -> Coordinate? {
        guard let venue, !venue.isEmpty else { return nil }
        let trimmed = venue.trimmingCharacters(in: .whitespaces).uppercased()
        let matches = centroids.filter { trimmed.hasPrefix($0.prefix) }
        return matches.max(by: { $0.prefix.count < $1.prefix.count })?.coordinate
    }

    /// Apple Maps directions to the venue's campus area, walking by default.
    public static func directionsURL(for venue: String?) -> URL? {
        guard let coordinate = coordinates(for: venue) else { return nil }
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [
            URLQueryItem(name: "daddr", value: "\(coordinate.latitude),\(coordinate.longitude)"),
            URLQueryItem(name: "dirflg", value: "w"),
        ]
        return components?.url
    }

    // MARK: Venue → ISB stop hints (port of VENUE_STOP_HINTS)

    static let stopHints: [(pattern: String, stop: String)] = [
        ("^(COM[0-9]|AS6|I3)", "COM3"),
        ("^AS[1-5]", "LT13"),
        ("^(E[1-9]A?|EA[0-9]?|LT[7-9](?![0-9])|LT10)", "LT13A"),
        ("^(UTown|ERC|CAPT|RC[0-9]?|Cinnamon)", "UTown"),
        ("^BIZ", "BIZ 2"),
        ("^(S[0-9]|LT2[0-9]|YIH)", "Opp YIH"),
        ("^(MD|NUH|CRC)", "MD 1"),
        ("^PGP", "PGP"),
        ("^YST", "YST"),
        ("^(MPSH|SRC|LT19|LT20)", "Opp TCOMS"),
    ]

    public static func stop(for venue: String?) -> String? {
        guard let venue else { return nil }
        let trimmed = venue.trimmingCharacters(in: .whitespaces)
        for hint in stopHints {
            if let regex = try? NSRegularExpression(pattern: hint.pattern, options: [.caseInsensitive]),
               regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) != nil {
                return hint.stop
            }
        }
        return nil
    }
}

/// Module colors arrive as hex strings from the backend; fall back to a
/// stable hash hue per module code, matching the desktop behaviour loosely.
public extension Color {
    init?(moduleColorHex: String?) {
        guard let moduleColorHex else { return nil }
        var text = moduleColorHex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt64(text, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255.0,
            green: Double((value >> 8) & 0xFF) / 255.0,
            blue: Double(value & 0xFF) / 255.0
        )
    }

    init(stableHueFor text: String?) {
        let source = text ?? "canvenient"
        var hash: UInt64 = 5381
        for byte in source.utf8 {
            hash = (hash &* 33) &+ UInt64(byte)
        }
        self.init(hue: Double(hash % 360) / 360.0, saturation: 0.55, brightness: 0.85)
    }
}
