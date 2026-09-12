import SwiftUI
import ActivityKit
import CanvenientKit

struct SettingsView: View {
    var showsDone = true
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @AppStorage(Theme.modeKey) private var themeMode = ThemeMode.graphite.rawValue
    @AppStorage(Preferences.isbAutoRefresh) private var isbAutoRefresh = true
    @AppStorage(Preferences.hapticsEnabled) private var hapticsEnabled = true
    @AppStorage(Preferences.liveActivityEnabled) private var liveActivityEnabled = true
    @AppStorage("canvenient.isb.stop") private var defaultStop = "COM3"

    @State private var serverURL = ""
    @State private var canvasToken = ""
    @State private var savingCanvasToken = false
    @State private var canvasTokenSaved = false
    @State private var confirmingSignOut = false
    @State private var activitiesAllowed = ActivityAuthorizationInfo().areActivitiesEnabled
    @State private var activityCount = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Theme", selection: $themeMode) {
                        ForEach(ThemeMode.allCases) { mode in
                            themeLabel(mode).tag(mode.rawValue)
                        }
                    }
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("Matches the desktop app's dark themes. Graphite is monochrome.")
                }

                Section("Preferences") {
                    Toggle("ISB auto-refresh (20 s)", isOn: $isbAutoRefresh)
                    Toggle("Haptics on wheel spin", isOn: $hapticsEnabled)
                    TextField("Default ISB stop", text: $defaultStop)
                        .textInputAutocapitalization(.never)
                }

                Section {
                    LabeledContent("Allowed by system", value: activitiesAllowed ? "Yes" : "No")
                    LabeledContent("Currently active", value: activityCount > 0 ? "Yes" : "No")
                    Toggle("Show next-class activity", isOn: $liveActivityEnabled)
                    Button("Refresh now") {
                        Task { await LiveActivityController.shared.refreshNow() }
                    }
                    Button("Start demo activity") {
                        Task { await LiveActivityController.shared.startPreview() }
                    }
                } header: {
                    Text("Live Activity")
                } footer: {
                    Text("Shows your current or next class with the venue, the next ISB bus, a timetable peek and Get Directions / Open Schedule shortcuts. It updates when you open the app.")
                }

                Section {
                    SecureField("Paste Canvas API token", text: $canvasToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button {
                        saveCanvasToken()
                    } label: {
                        HStack {
                            Spacer()
                            if savingCanvasToken {
                                ProgressView()
                            } else {
                                Text(canvasTokenSaved ? "Saved ✓" : "Connect Canvas")
                            }
                            Spacer()
                        }
                    }
                    .disabled(savingCanvasToken || canvasToken.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("Canvas")
                } footer: {
                    Text("Links the Modules tab to Canvas LMS for assignments and announcements. Create a token in Canvas → Account → Settings → Approved Integrations → New Access Token.")
                }

                Section("Account") {
                    LabeledContent("Signed in", value: appState.user?.email ?? "—")
                    Button("Refresh data") {
                        Task { await appState.refreshAll() }
                    }
                    Button("Sign out", role: .destructive) {
                        confirmingSignOut = true
                    }
                    .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                        Button("Sign out", role: .destructive) {
                            appState.signOut()
                            dismiss()
                        }
                    } message: {
                        Text("Cached data on this device is cleared. You can sign back in anytime.")
                    }
                }

                Section("Server") {
                    TextField("Server URL", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Apply & reload") {
                        appState.updateServerURL(serverURL.trimmingCharacters(in: .whitespaces))
                        Task { await appState.bootstrap() }
                        dismiss()
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: appVersion)
                    LabeledContent("Academic week", value: appState.academicWeek?.label ?? "—")
                }
            }
            .themedForm()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if showsDone {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
            .onAppear {
                serverURL = appState.serverURL
                activityCount = Activity<ClassActivityAttributes>.activities.count
                canvasTokenSaved = appState.user?.canvas_token_set ?? false
            }
        }
    }

    @ViewBuilder
    private func themeLabel(_ mode: ThemeMode) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 0) {
                ForEach(Array(swatches(mode).enumerated()), id: \.offset) { _, color in
                    Rectangle().fill(color).frame(width: 10, height: 18)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Theme.borderStrong, lineWidth: 1))
            Text(mode.displayName)
        }
    }

    private func swatches(_ mode: ThemeMode) -> [Color] {
        guard let palette = Theme.palettes[mode] else { return [] }
        return [palette.bg, palette.surfaceWarm, palette.accent, palette.textH]
    }

    private func saveCanvasToken() {
        savingCanvasToken = true
        Task {
            defer { savingCanvasToken = false }
            do {
                try await appState.updateCanvasToken(canvasToken.trimmingCharacters(in: .whitespaces))
                canvasTokenSaved = true
                canvasToken = ""
            } catch {
                canvasTokenSaved = false
            }
        }
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }
}
