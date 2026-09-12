import SwiftUI
import ActivityKit
import CanvenientKit

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var serverURL = ""
    @State private var activitiesEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
    @State private var activityCount = 0

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Signed in", value: appState.user?.email ?? "—")
                    Button("Refresh data") {
                        Task { await appState.refreshAll() }
                    }
                    Button("Sign out", role: .destructive) {
                        appState.signOut()
                        dismiss()
                    }
                }
                Section {
                    LabeledContent("System allows", value: activitiesEnabled ? "Yes" : "No")
                    LabeledContent("Active", value: activityCount > 0 ? "Yes" : "No")
                    Button("Refresh next-class activity") {
                        Task { await LiveActivityController.shared.refreshNow() }
                    }
                } header: {
                    Text("Live Activity")
                } footer: {
                    Text("Shows your current or next class with a live countdown, the venue, the next ISB bus and a Get Directions shortcut. Updates when you open the app (countdowns tick on their own).")
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
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                serverURL = appState.serverURL
                activityCount = Activity<ClassActivityAttributes>.activities.count
            }
        }
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }
}
