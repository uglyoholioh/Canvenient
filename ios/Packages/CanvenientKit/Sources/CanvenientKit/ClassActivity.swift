import Foundation
import ActivityKit
import AppIntents
import SwiftUI

/// Shared Live Activity contract between the app and the widget extension.
public struct ClassActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var classStart: Date
        public var classEnd: Date
        public var occurrenceDateKey: String
        /// The class that follows, for an at-a-glance timetable peek.
        public var nextModuleCode: String?
        public var nextStartTime: Date?
        public var busService: String?
        public var busArrival: Date?
        public var updatedAt: Date

        public init(classStart: Date, classEnd: Date, occurrenceDateKey: String,
                    nextModuleCode: String?, nextStartTime: Date?,
                    busService: String?, busArrival: Date?, updatedAt: Date) {
            self.classStart = classStart
            self.classEnd = classEnd
            self.occurrenceDateKey = occurrenceDateKey
            self.nextModuleCode = nextModuleCode
            self.nextStartTime = nextStartTime
            self.busService = busService
            self.busArrival = busArrival
            self.updatedAt = updatedAt
        }
    }

    public var moduleCode: String
    public var moduleName: String
    public var lessonType: String
    public var venue: String
    public var colorHex: String?

    public init(moduleCode: String, moduleName: String, lessonType: String, venue: String, colorHex: String?) {
        self.moduleCode = moduleCode
        self.moduleName = moduleName
        self.lessonType = lessonType
        self.venue = venue
        self.colorHex = colorHex
    }
}

/// Interactive "Get Directions" button inside the Live Activity. Runs in the
/// widget extension process and resolves the venue from the bundled centroid
/// table, so it needs no network and no app launch.
public struct DirectionsIntent: AppIntent {
    public static var title: LocalizedStringResource = "Get Directions"
    public static var description: IntentDescription? =
        IntentDescription("Open Apple Maps directions to the class venue area.")

    @Parameter(title: "Venue")
    public var venue: String

    @Environment(\.openURL) private var openURL

    public init() {
        venue = ""
    }

    public init(venue: String) {
        self.venue = venue
    }

    public func perform() async throws -> some IntentResult {
        if let coordinate = VenueDirectory.coordinates(for: venue) {
            var components = URLComponents(string: "https://maps.apple.com/")
            components?.queryItems = [
                URLQueryItem(name: "daddr", value: "\(coordinate.latitude),\(coordinate.longitude)"),
                URLQueryItem(name: "dirflg", value: "w"),
            ]
            if let url = components?.url { openURL(url) }
        } else if !venue.isEmpty {
            // Unknown building code: fall back to a Maps search on the name.
            var components = URLComponents(string: "https://maps.apple.com/")
            components?.queryItems = [URLQueryItem(name: "q", value: venue)]
            if let url = components?.url { openURL(url) }
        }
        return .result()
    }
}

/// Opens the app on the Schedule tab (used by Live Activity buttons).
public struct OpenScheduleIntent: AppIntent {
    public static var title: LocalizedStringResource = "Open Schedule"
    public static var description: IntentDescription? =
        IntentDescription("Open your timetable in Canvenient.")

    @Environment(\.openURL) private var openURL

    public init() {}

    public func perform() async throws -> some IntentResult {
        openURL(URL(string: "canvenient://schedule")!)
        return .result()
    }
}
