import SwiftUI
import CanvenientKit

/// Free-room finder backed by GET /venues/availability — v1 without
/// geolocation, sorted by longest free duration.
struct VenuesView: View {
    @EnvironmentObject private var appState: AppState

    @State private var rooms: [VenueFreeRoom] = []
    @State private var metaDay: String?
    @State private var metaTime: String?
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var minFreeMinutes = 0

    var body: some View {
        Group {
            if loading && rooms.isEmpty {
                ProgressView("Scanning venues…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                errorView(errorMessage)
            } else {
                venueList
            }
        }
        .background(Theme.bg)
        .navigationTitle("Venues")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Theme.accent)
        .searchable(text: $searchText, prompt: "Room, code or building")
        .onSubmit(of: .search) { Task { await load() } }
        .refreshable { await load() }
        .task { await load() }
    }

    private var venueList: some View {
        List {
            Section {
                Picker("Free for at least", selection: $minFreeMinutes) {
                    Text("Any").tag(0)
                    Text("30 min").tag(30)
                    Text("1 h").tag(60)
                    Text("2 h").tag(120)
                }
                .onChange(of: minFreeMinutes) { _, _ in
                    Task { await load() }
                }
            } header: {
                if let day = metaDay, let time = metaTime {
                    Text("Free now · \(day) \(time)")
                } else {
                    Text("Free now")
                }
            } footer: {
                Text("\(rooms.count) free rooms. Tap Directions for walking routes; availability refreshes from your timetable data.")
            }

            if rooms.isEmpty {
                Section {
                    Text("No free rooms match. Try clearing the search.")
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                ForEach(rooms) { room in
                    VenueRow(room: room)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "building.2.exclamationmark")
                .font(.system(size: 40))
                .foregroundStyle(Theme.textMuted)
            Text(message)
                .foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await load() } }
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func load() async {
        loading = true
        errorMessage = nil
        do {
            let response = try await appState.api.freeVenues(
                query: searchText.isEmpty ? nil : searchText,
                minFreeMinutes: minFreeMinutes == 0 ? nil : minFreeMinutes
            )
            rooms = response.results
            metaDay = response.day
            metaTime = response.time
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

struct VenueRow: View {
    let room: VenueFreeRoom

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Theme.success)
                .frame(width: 3, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(room.venue_code)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textH)
                if let building = room.building_name {
                    Text(building)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
                HStack(spacing: 8) {
                    if let minutes = room.free_minutes {
                        Label("free \(minutes) min", systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(Theme.text)
                    }
                    if let faculty = room.faculty, !faculty.isEmpty {
                        Text(faculty)
                            .font(.caption2)
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                if let until = room.free_until {
                    Text("until \(until)")
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(Theme.textMuted)
                }
                if let url = directionsURL {
                    Link(destination: url) {
                        Image(systemName: "location.fill")
                            .font(.caption)
                    }
                    .tint(Theme.accent)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var directionsURL: URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        if let lat = room.latitude, let lon = room.longitude {
            components?.queryItems = [
                URLQueryItem(name: "daddr", value: "\(lat),\(lon)"),
                URLQueryItem(name: "dirflg", value: "w"),
            ]
        } else {
            components?.queryItems = [URLQueryItem(name: "q", value: room.venue_code)]
        }
        return components?.url
    }
}
