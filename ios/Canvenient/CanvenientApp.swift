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
                .task { await appState.bootstrap() }
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
