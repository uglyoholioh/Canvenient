import SwiftUI
import CanvenientKit

/// Local-only data, matching the desktop wheel's localStorage JSON schema.
struct WheelData: Codable, Equatable {
    var activeWheelId: String
    var wheels: [Wheel]

    struct Wheel: Codable, Equatable, Identifiable {
        var id: String
        var name: String
        var description: String?
        var isPreset: Bool?
        var items: [Item]
    }

    struct Item: Codable, Equatable, Identifiable {
        var id: String
        var label: String
        var tag: String?
        var enabled: Bool
        var color: String?
    }
}

@MainActor
final class WheelStore: ObservableObject {
    @Published var data: WheelData
    @Published var winner: WheelData.Item?
    @Published var spinning = false
    @Published var rotation: Double = 0

    static let palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
                          "#06b6d4", "#f97316", "#14b8a6", "#6366f1", "#84cc16",
                          "#e11d48", "#0ea5e9"]

    private static let seed = WheelData(
        activeWheelId: "eat_nus",
        wheels: [
            WheelData.Wheel(
                id: "eat_nus", name: "Places to Eat in NUS",
                description: "Where to have your next meal on campus", isPreset: true,
                items: [
                    ("The Deck (Arts / FASS)", "Arts"), ("Techno Edge (Engineering)", "Engineering"),
                    ("Frontier Canteen (Science)", "Science"), ("Fine Food (UTown)", "UTown"),
                    ("Flavours @ UTown", "UTown"), ("The Terrace (Computing COM3)", "Computing"),
                    ("PGPR Aircon Food Court", "PGPR"), ("Central Square (YIH)", "YIH"),
                    ("Reedz Cafe (Business)", "Business"), ("Subway (YIH / UTown)", "Campus"),
                ].enumerated().map { index, pair in
                    WheelData.Item(id: "food-\(index + 1)", label: pair.0, tag: pair.1,
                                   enabled: true, color: palette[index % palette.count])
                }),
            WheelData.Wheel(
                id: "study_modules", name: "Modules to Study",
                description: "Which module to focus on next", isPreset: true, items: []),
        ])

    private static var fileURL: URL? {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        return support?.appendingPathComponent("wheels-data.json")
    }

    init() {
        if let url = Self.fileURL, let raw = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(WheelData.self, from: raw) {
            data = decoded
        } else {
            data = Self.seed
        }
    }

    func save() {
        guard let url = Self.fileURL else { return }
        if let encoded = try? JSONEncoder().encode(data) {
            try? encoded.write(to: url, options: .atomic)
        }
    }

    var activeWheel: WheelData.Wheel {
        data.wheels.first { $0.id == data.activeWheelId } ?? data.wheels[0]
    }

    var enabledItems: [WheelData.Item] {
        activeWheel.items.filter(\.enabled)
    }

    func select(_ id: String) {
        data.activeWheelId = id
        winner = nil
        save()
    }

    func toggle(_ item: WheelData.Item) {
        guard let wheelIndex = data.wheels.firstIndex(where: { $0.id == data.activeWheelId }),
              let itemIndex = data.wheels[wheelIndex].items.firstIndex(where: { $0.id == item.id }) else { return }
        data.wheels[wheelIndex].items[itemIndex].enabled.toggle()
        save()
    }

    func addOption(_ label: String) {
        guard let wheelIndex = data.wheels.firstIndex(where: { $0.id == data.activeWheelId }) else { return }
        let item = WheelData.Item(id: "opt-\(UUID().uuidString.prefix(8))",
                                  label: label, tag: nil, enabled: true,
                                  color: Self.palette[Int.random(in: 0..<Self.palette.count)])
        data.wheels[wheelIndex].items.append(item)
        save()
    }

    func deleteOption(_ item: WheelData.Item) {
        guard let wheelIndex = data.wheels.firstIndex(where: { $0.id == data.activeWheelId }) else { return }
        data.wheels[wheelIndex].items.removeAll { $0.id == item.id }
        save()
    }

    func spin() {
        let candidates = enabledItems
        guard !spinning, !candidates.isEmpty else { return }
        spinning = true
        winner = nil
        let targetIndex = Int.random(in: 0..<candidates.count)
        withAnimation(.timingCurve(0.15, 0.85, 0.25, 1, duration: 2.2)) {
            rotation += Double(Int.random(in: 4...7)) * 360 + Double(targetIndex) * (360 / Double(candidates.count))
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_250_000_000)
            winner = candidates[targetIndex]
            spinning = false
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }
}

struct WheelView: View {
    @StateObject private var store = WheelStore()
    @State private var newOption = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                picker
                spinDisplay
                optionList
            }
            .navigationTitle("Wheel")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var picker: some View {
        Picker("Wheel", selection: Binding(
            get: { store.data.activeWheelId },
            set: { store.select($0) })) {
            ForEach(store.data.wheels) { wheel in
                Text(wheel.name).tag(wheel.id)
            }
        }
        .pickerStyle(.menu)
        .padding(.top, 4)
    }

    private var spinDisplay: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .stroke(lineWidth: 6)
                    .foregroundStyle(Color(.systemFill))
                    .frame(width: 180, height: 180)
                // Simple conic reveal: rotating dot wheel with winner card.
                ForEach(Array(store.enabledItems.enumerated()), id: \.element.id) { index, item in
                    let count = max(store.enabledItems.count, 1)
                    Circle()
                        .fill(Color(moduleColorHex: item.color) ?? Color(stableHueFor: item.label))
                        .frame(width: 18, height: 18)
                        .offset(y: -78)
                        .rotationEffect(.degrees(rotationAngle(index: index, count: count) + store.rotation))
                }
                Image(systemName: "arrowtriangle.down.fill")
                    .font(.title3)
                    .offset(y: -100)
                if let winner = store.winner {
                    VStack(spacing: 2) {
                        Text("Winner").font(.caption2).foregroundStyle(.secondary)
                        Text(winner.label)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 8)
                    }
                    .frame(width: 130)
                }
            }
            Button {
                store.spin()
            } label: {
                Text(store.spinning ? "Spinning…" : "Spin")
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.spinning || store.enabledItems.isEmpty)
            .padding(.horizontal, 24)
            if let winner = store.winner {
                Button("Exclude & spin again") {
                    store.toggle(winner)
                    store.spin()
                }
                .font(.callout)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    private func rotationAngle(index: Int, count: Int) -> Double {
        360.0 * Double(index) / Double(max(count, 1))
    }

    private var optionList: some View {
        List {
            Section {
                ForEach(store.activeWheel.items) { item in
                    HStack {
                        Circle()
                            .fill(Color(moduleColorHex: item.color) ?? Color(stableHueFor: item.label))
                            .frame(width: 10, height: 10)
                        Text(item.label)
                            .strikethrough(!item.enabled)
                            .opacity(item.enabled ? 1 : 0.5)
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { item.enabled },
                            set: { _ in store.toggle(item) }))
                            .labelsHidden()
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteOption(store.activeWheel.items[index])
                    }
                }
                HStack {
                    TextField("Add an option…", text: $newOption)
                        .onSubmit(addOption)
                    Button("Add", action: addOption)
                        .disabled(newOption.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } header: {
                Text(store.activeWheel.name)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func addOption() {
        let label = newOption.trimmingCharacters(in: .whitespaces)
        guard !label.isEmpty else { return }
        store.addOption(label)
        newOption = ""
    }
}
