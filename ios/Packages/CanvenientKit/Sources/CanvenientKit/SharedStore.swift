import Foundation

/// State shared between the app and the widget extension through the app
/// group: mirrored preferences, the widget-visible disk cache location and
/// the last-synced timestamp. The auth token deliberately stays Keychain-only
/// in the app process — widgets render from cached snapshots, never from
/// authenticated requests.
public enum SharedStore {
    public static let appGroupID = "group.com.oli.canvenient.shared"

    public static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    public static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    // Mirrored preference keys use the same names as the app's own keys so
    // either side can read what the other wrote.
    public static let serverURLKey = "serverURL"
    public static let isbStopKey = "canvenient.isb.stop"
    public static let lastSyncKey = "shared.lastSync"

    public static var serverURL: String? { defaults.string(forKey: serverURLKey) }
    public static var isbStop: String { defaults.string(forKey: isbStopKey) ?? "COM3" }

    public static var lastSyncDate: Date? {
        get { defaults.object(forKey: lastSyncKey) as? Date }
        set { defaults.set(newValue, forKey: lastSyncKey) }
    }
}
