import SwiftUI
import CanvenientKit

struct BusView: View {
    @EnvironmentObject private var appState: AppState

    @AppStorage("canvenient.isb.stop") private var selectedStop = "COM3"
    @AppStorage("canvenient.isb.favourites") private var favouritesRaw = ""
    @State private var stops: [BusStop] = []
    @State private var arrivals: BusArrivalsResponse?
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var searchText = ""

    private let refreshInterval: TimeInterval = 20
    @State private var refreshTimer: Timer?

    private var favourites: [String] {
        favouritesRaw.split(separator: ",").map(String.init)
    }

    private var filteredStops: [BusStop] {
        guard !searchText.isEmpty else { return stops }
        let query = searchText.lowercased()
        return stops.filter {
            ($0.name ?? "").lowercased().contains(query)
                || ($0.short_name ?? "").lowercased().contains(query)
                || $0.id.lowercased().contains(query)
        }
    }

    var body: some View {
        List {
            if !favourites.isEmpty {
                Section("Favourites") {
                    ForEach(favourites, id: \.self) { stopId in
                        favouriteRow(stopId)
                    }
                }
            }
            Section("Arrivals — \(selectedStop)") {
                arrivalsSection
            }
            if !favourites.isEmpty {
                Section {
                    Button(role: .destructive) {
                        favouritesRaw = ""
                    } label: {
                        Text("Clear favourites")
                    }
                }
            }
            Section("All stops") {
                ForEach(filteredStops) { stop in
                    Button {
                        selectedStop = stop.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(stop.short_name ?? stop.id)
                                    .fontWeight(stop.id == selectedStop ? .semibold : .regular)
                                if let name = stop.name,
                                   name != stop.short_name, name != stop.id {
                                    Text(name).font(.caption).foregroundStyle(Theme.textMuted)
                                }
                            }
                            Spacer()
                            if stop.id == selectedStop {
                                Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .searchable(text: $searchText, prompt: "Search stops")
        .navigationTitle("Bus")
        .tint(Theme.accent)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadArrivals() }
        .task {
            await loadStops()
            startAutoRefresh()
        }
        .onChange(of: selectedStop) { _, _ in
            Task { await loadArrivals() }
        }
        .onDisappear { refreshTimer?.invalidate() }
    }

    private func favouriteRow(_ stopId: String) -> some View {
        Button {
            selectedStop = stopId
        } label: {
            HStack {
                Image(systemName: "star.fill").foregroundStyle(Theme.accentGold)
                Text(stopId)
                Spacer()
                if stopId == selectedStop {
                    Image(systemName: "checkmark").foregroundStyle(Theme.accent)
                }
            }
        }
        .swipeActions {
            Button(role: .destructive) {
                favouritesRaw = favourites.filter { $0 != stopId }.joined(separator: ",")
            } label: {
                Label("Remove", systemImage: "star.slash")
            }
        }
    }

    @ViewBuilder
    private var arrivalsSection: some View {
        if loading && arrivals == nil {
            HStack { ProgressView(); Text("Loading arrivals…").foregroundStyle(Theme.textMuted) }
        } else if let errorMessage {
            VStack(alignment: .leading, spacing: 6) {
                Text(errorMessage).foregroundStyle(Theme.error)
                Button("Try again") { Task { await loadArrivals() } }
            }
        } else if let arrivals {
            if arrivals.arrivals.isEmpty {
                Text("No upcoming departures published for this stop.").foregroundStyle(Theme.textMuted)
            } else {
                ForEach(arrivals.arrivals, id: \.service) { service in
                    serviceRow(service)
                }
                HStack {
                    Spacer()
                    Text("Auto-refreshes every 20 s")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }
            }
        } else {
            Text("Select a stop to see arrivals.").foregroundStyle(Theme.textMuted)
        }
    }

    private func serviceRow(_ service: BusServiceArrivals) -> some View {
        let etas = service.minutes.compactMap { $0 }
        return HStack(spacing: 12) {
            Text(service.service)
                .font(.callout)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .frame(width: 40, height: 28)
                .background(serviceTone(service.service), in: RoundedRectangle(cornerRadius: 8))
            if let first = etas.first {
                Text(Format.eta(first))
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundStyle(first <= 3 ? Color.orange : Color.primary)
            } else {
                Text("—").foregroundStyle(.secondary)
            }
            if etas.count > 1 {
                Text("then \(Format.etaList(etas))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private func serviceTone(_ service: String) -> Color {
        switch service.first {
        case "A": return Color(red: 0.15, green: 0.55, blue: 0.9)
        case "B": return Color(red: 0.9, green: 0.45, blue: 0.15)
        case "C": return Color(red: 0.2, green: 0.65, blue: 0.4)
        case "D": return Color(red: 0.6, green: 0.3, blue: 0.8)
        default: return Color(.systemGray)
        }
    }

    private func loadStops() async {
        if stops.isEmpty {
            stops = (try? await appState.api.busStops()) ?? []
        }
    }

    private func loadArrivals() async {
        loading = true
        errorMessage = nil
        if let data = await appState.busArrivals(stop: selectedStop) {
            arrivals = data
        } else {
            errorMessage = "Could not load arrivals. Check your connection and try again."
        }
        loading = false
    }

    private func startAutoRefresh() {
        refreshTimer?.invalidate()
        Task { await loadArrivals() }
        guard UserDefaults.standard.object(forKey: Preferences.isbAutoRefresh) as? Bool ?? true else { return }
        refreshTimer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { _ in
            Task { @MainActor in await loadArrivals() }
        }
    }
}
