import SwiftUI
import BackgroundTasks
import CanvenientKit

@main
struct CanvenientApp: App {
    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        BackgroundRefresh.registerHandler()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .onOpenURL { url in
                    // canvenient://<tab> from Live Activity taps and widgets.
                    switch url.host?.lowercased() {
                    case "schedule": appState.selectedTab = .schedule
                    case "tasks": appState.selectedTab = .tasks
                    case "bus", "venues", "campus": appState.selectedTab = .campus
                    case "modules": appState.selectedTab = .modules
                    default: break
                    }
                    appState.refreshLiveActivity()
                }
                .task {
                    if ProcessInfo.processInfo.arguments.contains("-previewLiveActivity") {
                        await LiveActivityController.shared.startPreview()
                    }
                    await appState.bootstrap()
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        appState.refreshLiveActivity()
                    case .background:
                        appState.scheduleBackgroundRefresh()
                    default:
                        break
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
                    appState.refreshLiveActivity()
                }
        }
    }
}
