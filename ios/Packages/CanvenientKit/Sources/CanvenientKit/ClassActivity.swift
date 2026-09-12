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
        public var busService: String?
        public var busArrival: Date?
        public var updatedAt: Date

        public init(classStart: Date, classEnd: Date, occurrenceDateKey: String,
                    busService: String?, busArrival: Date?, updatedAt: Date) {
            self.classStart = classStart
            self.classEnd = classEnd
            self.occurrenceDateKey = occurrenceDateKey
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
        if let url = VenueDirectory.directionsURL(for: venue) {
            openURL(url)
        }
        return .result()
    }
}
