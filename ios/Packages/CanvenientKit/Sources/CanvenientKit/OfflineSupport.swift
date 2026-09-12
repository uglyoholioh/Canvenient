import Foundation

/// Disk cache of the last successful API responses, so the app remains
/// useful without a connection to the hosted backend (e.g. Tailscale off).
public final class OfflineCache {
    public static let shared = OfflineCache()

    private let directory: URL?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        directory = support?.appendingPathComponent("offline-cache", isDirectory: true)
        if let directory {
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }

    private func url(forKey key: String) -> URL? {
        directory?.appendingPathComponent(key + ".json")
    }

    public func save<T: Encodable>(_ value: T, key: String) {
        guard let url = url(forKey: key), let data = try? encoder.encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }

    public func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let url = url(forKey: key), let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(type, from: data)
    }
}

/// Talks to the public NUS bus relay straight from the device, bypassing the
/// hosted backend entirely. Used as a fallback so live arrivals keep working
/// whenever there is plain internet, even without Tailscale.
public enum DirectBus {
    static let base = "https://nusbus.app"

    public static func arrivals(stop: String) async throws -> BusArrivalsResponse {
        struct ShuttleServiceResult: Decodable {
            struct Shuttle: Decodable {
                struct Eta: Decodable {
                    // The relay mixes strings and numbers for eta.
                    var value: Double?

                    init(from decoder: Decoder) throws {
                        let container = try decoder.singleValueContainer()
                        if let number = try? container.decode(Double.self) {
                            value = number
                        } else if let text = try? container.decode(String.self),
                                  let number = Double(text) {
                            value = number
                        } else {
                            value = nil
                        }
                    }
                }
                var name: String?
                var _etas: [Eta]?
            }
            var ShuttleServiceResult: ShuttleList?
            struct ShuttleList: Decodable {
                var shuttles: [Shuttle]?
            }
        }
        var components = URLComponents(string: base + "/api/shuttle-service")
        components?.queryItems = [URLQueryItem(name: "busstopname", value: stop)]
        guard let url = components?.url else {
            throw APIError.invalidBaseURL
        }
        var payload: Data?
        var statusCode = 0
        // The relay intermittently 502s; two quick attempts ride it out.
        for attempt in 0..<2 {
            if attempt > 0 {
                try? await Task.sleep(nanoseconds: 600_000_000)
            }
            if let (data, response) = try? await URLSession.shared.data(from: url),
               let http = response as? HTTPURLResponse {
                payload = data
                statusCode = http.statusCode
                if statusCode == 200 { break }
            }
        }
        guard statusCode == 200, let data = payload else {
            throw APIError.server("Bus relay unavailable.")
        }
        let relay = try JSONDecoder().decode(ShuttleServiceResult.self, from: data)
        let arrivals = (relay.ShuttleServiceResult?.shuttles ?? []).compactMap { shuttle -> BusServiceArrivals? in
            guard let name = shuttle.name else { return nil }
            let minutes = (shuttle._etas ?? []).map { eta -> Int? in
                guard let value = eta.value else { return nil }
                return max(0, Int(value))
            }
            return BusServiceArrivals(service: name, minutes: minutes)
        }
        return BusArrivalsResponse(
            stop: BusStop(id: stop, name: nil, short_name: nil, latitude: nil, longitude: nil),
            arrivals: arrivals,
            updated_at: nil
        )
    }
}
