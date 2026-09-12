import SwiftUI
import CoreLocation
import CanvenientKit

/// Free-room finder backed by GET /venues/availability. Location-aware
/// nearest-first sorting when the user grants When-In-Use access, plus
/// day/time exploration, a per-room availability timeline and an
/// occupied-rooms toggle.
struct VenuesView: View {
    @EnvironmentObject private var appState: AppState

    @StateObject private var locator = VenueLocationFetcher()

    @State private var rooms: [VenueFreeRoom] = []
    @State private var metaDay: String?
    @State private var metaTime: String?
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var minFreeMinutes = 0
    @State private var sort: VenueSort = .longestFree
    @State private var didPickSort = false
    @State private var day: VenueDay = .today
    @State private var time: String?
    @State private var includeOccupied = false
    @State private var selectedRoom: VenueFreeRoom?
    @State private var searchTask: Task<Void, Never>?

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
        .onChange(of: searchText) { _, newValue in
            // Live search with a short debounce; submit still jumps instantly.
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard !Task.isCancelled else { return }
                await load()
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .task { locator.start() }
        .onChange(of: locator.fixGeneration) { _, generation in
            guard generation > 0 else { return }
            if !didPickSort { sort = .nearest }
            Task { await load() }
        }
        .sheet(item: $selectedRoom) { room in
            VenueDetailSheet(room: room, dayLabel: displayDayName)
        }
    }

    private var venueList: some View {
        List {
            filterSection
            locationHintSection

            if rooms.isEmpty {
                Section {
                    Text(includeOccupied
                         ? "No rooms match. Try clearing the search."
                         : "No free rooms match. Try clearing the search or include occupied rooms.")
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                ForEach(rooms) { room in
                    Button { selectedRoom = room } label: { VenueRow(room: room) }
                        .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var filterSection: some View {
        Section {
            Picker("Sort", selection: $sort) {
                ForEach(VenueSort.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .onChange(of: sort) { _, _ in didPickSort = true; Task { await load() } }

            Picker("Day", selection: $day) {
                ForEach(VenueDay.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .onChange(of: day) { _, _ in Task { await load() } }

            Picker("Time", selection: $time) {
                Text("Now").tag(String?.none)
                ForEach(VenueSlotLabels.all, id: \.self) { slot in
                    Text(prettyTime(slot)).tag(String?.some(slot))
                }
            }
            .onChange(of: time) { _, _ in Task { await load() } }

            Picker("Free for at least", selection: $minFreeMinutes) {
                Text("Any").tag(0)
                Text("30 min").tag(30)
                Text("1 h").tag(60)
                Text("2 h").tag(120)
            }
            .onChange(of: minFreeMinutes) { _, _ in Task { await load() } }

            Toggle("Include occupied rooms", isOn: $includeOccupied)
                .onChange(of: includeOccupied) { _, _ in Task { await load() } }
        } header: {
            Text(availabilityHeader)
        } footer: {
            Text("\(rooms.count) room\(rooms.count == 1 ? "" : "s"). Tap a room for its day timeline; availability comes from NUSMods timetable data.")
        }
    }

    @ViewBuilder
    private var locationHintSection: some View {
        if locator.isDenied {
            Section {
                HStack {
                    Label("Location is off — nearest-first sorting unavailable.", systemImage: "location.slash")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                    Spacer()
                    Button("Settings") { locator.openSettings() }
                        .font(.caption)
                }
            }
        }
    }

    private var availabilityHeader: String {
        if let day = metaDay, let time = metaTime {
            let isLive = self.day == .today && self.time == nil
            return isLive ? "Free now · \(day) \(prettyTime(time))" : "\(day) \(prettyTime(time))"
        }
        return "Availability"
    }

    /// Day name as selected, falling back to whatever the server echoed.
    private var displayDayName: String {
        day.apiName ?? metaDay ?? "Today"
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
                minFreeMinutes: minFreeMinutes == 0 ? nil : minFreeMinutes,
                day: day.apiName,
                time: time,
                latitude: locator.coordinate?.latitude,
                longitude: locator.coordinate?.longitude,
                sort: sort.apiValue,
                includeOccupied: includeOccupied
            )
            rooms = response.results
            metaDay = response.day
            metaTime = response.time
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - Row

struct VenueRow: View {
    let room: VenueFreeRoom

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(isFree ? Theme.success : Theme.warning)
                .frame(width: 3, height: 48)
            VStack(alignment: .leading, spacing: 3) {
                Text(room.venue_code)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textH)
                if let subtitle = subtitleLine {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
                HStack(spacing: 8) {
                    if let distance = distanceLine {
                        Label(distance, systemImage: "figure.walk")
                            .font(.caption)
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                    } else if let faculty = room.faculty, !faculty.isEmpty {
                        Text(faculty)
                            .font(.caption2)
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                statusLine
                    .font(.caption)
                    .monospacedDigit()
                if isFree, let next = room.next_lesson, let at = next.startTime {
                    Text("next \(next.moduleCode ?? "class") \(prettyTime(at))")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.textMuted.opacity(0.6))
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    private var isFree: Bool { room.is_free ?? true }

    private var subtitleLine: String? {
        var parts: [String] = []
        if let name = room.room_name, name != room.venue_code { parts.append(name) }
        if let floor = room.floor { parts.append("Floor \(floor)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var distanceLine: String? {
        guard let metres = room.distance_metres else { return nil }
        var parts = [distanceText(metres)]
        if let minutes = room.walking_minutes { parts.append("\(minutes) min walk") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var statusLine: some View {
        if isFree {
            VStack(alignment: .trailing, spacing: 2) {
                if let until = room.free_until {
                    Text("free until \(prettyTime(until))")
                        .foregroundStyle(Theme.success)
                }
                if let minutes = room.free_minutes, minutes > 0 {
                    Text(durationText(minutes))
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }
            }
        } else if let current = room.current_lesson {
            VStack(alignment: .trailing, spacing: 2) {
                Text(current.moduleCode ?? "In class")
                    .foregroundStyle(Theme.warning)
                if let until = current.endTime {
                    Text("until \(prettyTime(until))")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }
            }
        } else {
            Text("occupied")
                .foregroundStyle(Theme.warning)
        }
    }
}

// MARK: - Detail sheet

struct VenueDetailSheet: View {
    let room: VenueFreeRoom
    let dayLabel: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    timelineCard
                    infoCard
                    actions
                }
                .padding(16)
            }
            .background(Theme.bg)
            .tint(Theme.accent)
            .navigationTitle(room.venue_code)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var isFree: Bool { room.is_free ?? true }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(room.room_name ?? room.venue_code)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.textH)
                Spacer()
                Text(isFree ? "Free" : "Busy")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background((isFree ? Theme.success : Theme.warning).opacity(0.16), in: Capsule())
                    .foregroundStyle(isFree ? Theme.success : Theme.warning)
            }
            HStack(spacing: 6) {
                if let building = room.building_name { Text(building) }
                if let faculty = room.faculty, !faculty.isEmpty {
                    Text("· \(faculty)")
                }
            }
            .font(.caption)
            .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var timelineCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Availability · \(dayLabel)")
            VenueTimeline(slots: room.slots ?? [:])
                .frame(height: 20)
            HStack {
                Text("08").font(.caption2).foregroundStyle(Theme.textMuted)
                Spacer()
                Text("11").font(.caption2).foregroundStyle(Theme.textMuted)
                Spacer()
                Text("14").font(.caption2).foregroundStyle(Theme.textMuted)
                Spacer()
                Text("17").font(.caption2).foregroundStyle(Theme.textMuted)
                Spacer()
                Text("20").font(.caption2).foregroundStyle(Theme.textMuted)
            }
            HStack(spacing: 14) {
                Label("Free", systemImage: "circle.fill")
                    .foregroundStyle(Theme.success)
                Label("Class", systemImage: "circle.fill")
                    .foregroundStyle(Theme.error)
            }
            .font(.caption2)
            .foregroundStyle(Theme.textMuted)
            statusSummary
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .themeCard()
    }

    @ViewBuilder
    private var statusSummary: some View {
        if isFree {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle").foregroundStyle(Theme.success)
                Text(freeSummary)
                if let next = room.next_lesson, let at = next.startTime {
                    Text("· next \(nextLessonSummary(next)) at \(prettyTime(at))")
                }
            }
            .font(.caption)
            .foregroundStyle(Theme.text)
        } else if let current = room.current_lesson {
            HStack(spacing: 6) {
                Image(systemName: "person.fill").foregroundStyle(Theme.warning)
                Text("In class: \(lessonSummary(current)) until \(current.endTime.map(prettyTime) ?? "?")")
            }
            .font(.caption)
            .foregroundStyle(Theme.text)
        }
    }

    private var freeSummary: String {
        guard let minutes = room.free_minutes, minutes > 0 else { return "Free" }
        return "Free for \(durationText(minutes))"
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            if let building = room.building_name {
                infoRow(icon: "mappin.and.ellipse", label: "Building", value: building)
            }
            if let floor = room.floor {
                infoRow(icon: "square.stack.3d.up", label: "Floor", value: String(floor))
            }
            if let faculty = room.faculty, !faculty.isEmpty {
                infoRow(icon: "person.2", label: "Faculty", value: faculty)
            }
            if let metres = room.distance_metres {
                let value = distanceText(metres) + (room.walking_minutes.map { " · \($0) min walk" } ?? "")
                infoRow(icon: "figure.walk", label: "From you", value: value)
            }
            if let stop = VenueDirectory.stop(for: room.venue_code) {
                infoRow(icon: "bus", label: "Nearest ISB stop", value: stop)
            }
            if let next = room.next_lesson {
                let window: String = {
                    if let start = next.startTime, let end = next.endTime {
                        return " · \(prettyTime(start))–\(prettyTime(end))"
                    }
                    return next.startTime.map { " · \(prettyTime($0))" } ?? ""
                }()
                infoRow(icon: "clock.badge.exclamationmark", label: "Next class", value: nextLessonSummary(next) + window)
            }
        }
        .padding(12)
        .themeCard()
    }

    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption)
                .frame(width: 20)
                .foregroundStyle(Theme.textMuted)
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
            Spacer(minLength: 8)
            Text(value)
                .font(.caption)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 5)
    }

    private var actions: some View {
        HStack(spacing: 12) {
            if let url = directionsURL {
                Link(destination: url) {
                    Label("Directions", systemImage: "location.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            Button {
                UIPasteboard.general.string = room.venue_code
            } label: {
                Label("Copy code", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
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

    private func nextLessonSummary(_ lesson: VenueLesson) -> String {
        [lesson.moduleCode, lesson.lessonType].compactMap { $0 }.joined(separator: " ")
    }

    private func lessonSummary(_ lesson: VenueLesson) -> String {
        [lesson.moduleCode, lesson.lessonType].compactMap { $0 }.joined(separator: " ")
    }
}

// MARK: - Day timeline

/// Half-hour occupancy blocks from 08:00 to 22:00, with a marker on the
/// currently-queried slot when the query is live.
struct VenueTimeline: View {
    let slots: [String: String]

    private static let slotKeys: [String] = (8..<22).flatMap { hour in
        [String(format: "%02d00", hour), String(format: "%02d30", hour)]
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Self.slotKeys, id: \.self) { key in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(slots[key] == "occupied" ? Theme.error : Theme.success)
                    .opacity(slots[key] == "occupied" ? 0.9 : 0.55)
                    .frame(maxWidth: .infinity)
                    .overlay {
                        if key == Self.currentSlotKey {
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .strokeBorder(Theme.textH, lineWidth: 1.5)
                        }
                    }
            }
        }
    }

    /// Half-hour slot covering SG time right now, when within the day grid.
    static var currentSlotKey: String? {
        let components = SGTime.calendar.dateComponents([.hour, .minute], from: Date())
        guard let hour = components.hour, let minute = components.minute else { return nil }
        guard (8..<22).contains(hour) else { return nil }
        let rounded = minute >= 30 ? 30 : 0
        return String(format: "%02d%02d", hour, rounded)
    }
}

// MARK: - Location

/// One-shot when-in-use location fetch for nearest-first venue sorting.
final class VenueLocationFetcher: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate: CLLocationCoordinate2D?
    @Published var isDenied = false
    @Published var fixGeneration = 0

    private let manager = CLLocationManager()
    private var started = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func start() {
        guard !started else { return }
        started = true
        refresh(from: manager.authorizationStatus)
    }

    private func refresh(from status: CLAuthorizationStatus) {
        switch status {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            isDenied = false
            if coordinate == nil { manager.requestLocation() }
        case .denied, .restricted:
            isDenied = true
        @unknown default:
            break
        }
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async { self.refresh(from: manager.authorizationStatus) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        DispatchQueue.main.async {
            self.coordinate = location.coordinate
            self.fixGeneration += 1
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Simulator and permission edge cases land here; leave coordinate nil
        // and let the view fall back to duration sorting.
    }
}

// MARK: - Options & formatting

enum VenueSort: String, CaseIterable, Identifiable {
    case nearest
    case longestFree
    case name

    var id: String { rawValue }

    var label: String {
        switch self {
        case .nearest: return "Nearest first"
        case .longestFree: return "Longest free"
        case .name: return "A–Z"
        }
    }

    var apiValue: String {
        switch self {
        case .nearest: return "distance"
        case .longestFree: return "duration"
        case .name: return "name"
        }
    }
}

enum VenueDay: CaseIterable, Identifiable {
    case today
    case monday, tuesday, wednesday, thursday, friday, saturday, sunday

    var id: Int {
        switch self {
        case .today: return 0
        case .monday: return 1
        case .tuesday: return 2
        case .wednesday: return 3
        case .thursday: return 4
        case .friday: return 5
        case .saturday: return 6
        case .sunday: return 7
        }
    }

    var label: String {
        switch self {
        case .today: return "Today"
        case .monday: return "Mon"
        case .tuesday: return "Tue"
        case .wednesday: return "Wed"
        case .thursday: return "Thu"
        case .friday: return "Fri"
        case .saturday: return "Sat"
        case .sunday: return "Sun"
        }
    }

    /// Weekday name the API expects, or nil for "server's today".
    var apiName: String? {
        switch self {
        case .today: return nil
        case .monday: return "Monday"
        case .tuesday: return "Tuesday"
        case .wednesday: return "Wednesday"
        case .thursday: return "Thursday"
        case .friday: return "Friday"
        case .saturday: return "Saturday"
        case .sunday: return "Sunday"
        }
    }
}

enum VenueSlotLabels {
    /// All half-hour slots 08:00–21:30 the backend's availability grid uses.
    static let all: [String] = (8..<22).flatMap { hour in
        [String(format: "%02d00", hour), String(format: "%02d30", hour)]
    }
}

/// "1000" → "10:00"
func prettyTime(_ raw: String) -> String {
    guard raw.count == 4, let hours = Int(raw.prefix(2)), let minutes = Int(raw.suffix(2)) else { return raw }
    return String(format: "%02d:%02d", hours, minutes)
}

func durationText(_ minutes: Int) -> String {
    if minutes < 60 { return "\(minutes) min" }
    let hours = minutes / 60
    let rest = minutes % 60
    if rest == 0 { return hours == 1 ? "1 h" : "\(hours) h" }
    return String(format: "%d h %02d min", hours, rest)
}

func distanceText(_ metres: Int) -> String {
    if metres < 950 { return "\(metres) m" }
    return String(format: "%.1f km", Double(metres) / 1000.0)
}
