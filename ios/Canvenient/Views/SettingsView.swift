import SwiftUI
import ActivityKit
import UserNotifications
import CanvenientKit

struct SettingsView: View {
    var showsDone = true
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @AppStorage(Theme.modeKey) private var themeMode = ThemeMode.graphite.rawValue
    @AppStorage(Preferences.isbAutoRefresh) private var isbAutoRefresh = true
    @AppStorage(Preferences.hapticsEnabled) private var hapticsEnabled = true
    @AppStorage(Preferences.liveActivityEnabled) private var liveActivityEnabled = true
    @AppStorage(Preferences.classRemindersEnabled) private var classRemindersEnabled = true
    @AppStorage(Preferences.taskRemindersEnabled) private var taskRemindersEnabled = true

    @State private var serverURL = ""
    @State private var canvasToken = ""
    @State private var savingCanvasToken = false
    @State private var canvasTokenSaved = false
    @State private var confirmingSignOut = false
    @State private var activitiesAllowed = ActivityAuthorizationInfo().areActivitiesEnabled
    @State private var activityCount = 0
    @State private var notificationsAllowed: Bool?
    @State private var testingConnection = false
    @State private var connectionReached: Bool?

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                canvasSection
                notificationsSection
                liveActivitySection
                campusSection
                wheelSection
                appearanceSection
                serverSection
                aboutSection
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
                refreshNotificationStatus()
            }
            .onChange(of: themeMode) { _, newValue in
                SharedStore.defaults.set(newValue, forKey: Theme.modeKey)
            }
            .onChange(of: classRemindersEnabled) { _, enabled in
                handleReminderToggle(enabled: enabled, otherEnabled: taskRemindersEnabled)
            }
            .onChange(of: taskRemindersEnabled) { _, enabled in
                handleReminderToggle(enabled: enabled, otherEnabled: classRemindersEnabled)
            }
        }
    }

    // MARK: Sections — grouped by feature, account first

    private var accountSection: some View {
        Section("Account") {
            LabeledContent("Signed in", value: appState.user?.email ?? "—")
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
    }

    private var canvasSection: some View {
        Section {
            LabeledContent("Status", value: canvasTokenSaved ? "Connected ✓" : "Not connected")
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
                        Text(canvasTokenSaved ? "Update token" : "Connect Canvas")
                    }
                    Spacer()
                }
            }
            .disabled(savingCanvasToken || canvasToken.trimmingCharacters(in: .whitespaces).isEmpty)
        } header: {
            Text("Canvas")
        } footer: {
            Text("Links the Modules screen to Canvas LMS for courses and assignments. Create a token in Canvas → Account → Settings → Approved Integrations → New Access Token.")
        }
    }

    private var notificationsSection: some View {
        Section {
            Toggle("Class reminders (15 min before)", isOn: $classRemindersEnabled)
            Toggle("Task reminders (1 h before)", isOn: $taskRemindersEnabled)
            if let notificationsAllowed {
                LabeledContent("Allowed by system",
                               value: notificationsAllowed ? "Yes" : "No")
            }
        } header: {
            Text("Notifications")
        } footer: {
            Text("Scheduled on device from your timetable and tasks for the coming week. Turning a toggle on asks for permission once.")
        }
    }

    private var liveActivitySection: some View {
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
    }

    private var campusSection: some View {
        Section {
            Toggle("ISB auto-refresh (20 s)", isOn: $isbAutoRefresh)
        } header: {
            Text("Campus")
        } footer: {
            Text("Bus arrivals refresh every 20 s while a bus screen is open. Pick stops and favourites right on the Today card.")
        }
    }

    private var wheelSection: some View {
        Section {
            Toggle("Haptics on wheel spin", isOn: $hapticsEnabled)
        } header: {
            Text("Wheel")
        }
    }

    private var appearanceSection: some View {
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
    }

    private var serverSection: some View {
        Section {
            TextField("Server URL", text: $serverURL)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button {
                testConnection()
            } label: {
                HStack {
                    Text("Test connection")
                    Spacer()
                    if testingConnection { ProgressView() }
                }
            }
            .disabled(testingConnection)
            if let connectionReached {
                Label(connectionReached ? "Server reachable" : "No response — is Tailscale connected?",
                      systemImage: connectionReached ? "checkmark.circle" : "exclamationmark.triangle")
                    .foregroundStyle(connectionReached ? Theme.success : Theme.warning)
                    .font(.callout)
            }
            Button("Apply & reload") {
                appState.updateServerURL(serverURL.trimmingCharacters(in: .whitespaces))
                Task { await appState.bootstrap() }
                dismiss()
            }
            Button("Refresh data") {
                Task { await appState.refreshAll() }
            }
        } header: {
            Text("Server & data")
        } footer: {
            Text("The app talks to your hosted backend over Tailscale. Applying a new URL signs nothing out — it just retargets the client and reloads.")
        }
    }

    private var aboutSection: some View {
        Section("About") {
            LabeledContent("Version", value: appVersion)
            LabeledContent("Academic week", value: appState.academicWeek?.label ?? "—")
        }
    }

    // MARK: Helpers

    private func refreshNotificationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
            Task { @MainActor in
                notificationsAllowed = allowed
            }
        }
    }

    private func testConnection() {
        testingConnection = true
        connectionReached = nil
        Task {
            let reached = await appState.checkConnection()
            connectionReached = reached
            testingConnection = false
        }
    }

    private func handleReminderToggle(enabled: Bool, otherEnabled: Bool) {
        Task { @MainActor in
            if enabled {
                if otherEnabled {
                    await ReminderScheduler.requestAuthorization()
                }
                ReminderScheduler.regenerate(schedule: appState.schedule, tasks: appState.tasks)
            } else if !otherEnabled {
                ReminderScheduler.removeAll()
            }
            refreshNotificationStatus()
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
