import SwiftUI
import CanvenientKit

struct RootView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage(Theme.modeKey) private var themeMode = ThemeMode.graphite.rawValue

    var body: some View {
        Group {
            switch appState.session {
            case .unknown:
                ProgressView("Connecting…")
            case .loggedOut:
                LoginView()
            case .loggedIn:
                tabs
            }
        }
        .animation(.easeInOut(duration: 0.2), value: appState.session)
        .preferredColorScheme(.dark)
        // Rebuild on palette change so every Theme.* colour re-evaluates.
        .id(themeMode)
    }

    private var tabs: some View {
        TabView(selection: $appState.selectedTab) {
            Tab("Home", systemImage: "square.grid.2x2", value: .home) {
                DashboardView()
            }
            Tab("Schedule", systemImage: "calendar", value: .schedule) {
                ScheduleView()
            }
            Tab("Tasks", systemImage: "checklist", value: .tasks) {
                TasksView()
            }
            Tab("Modules", systemImage: "book", value: .modules) {
                ModulesView()
            }
            Tab("Campus", systemImage: "building.2", value: .campus) {
                CampusView()
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .tint(Theme.accent)
    }
}
