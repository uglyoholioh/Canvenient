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
            Tab("Dashboard", systemImage: "square.grid.2x2", value: .dashboard) {
                DashboardView()
            }
            Tab("Schedule", systemImage: "calendar", value: .schedule) {
                ScheduleView()
            }
            Tab("Tasks", systemImage: "checklist", value: .tasks) {
                TasksView()
            }
            Tab("Bus", systemImage: "bus", value: .bus) {
                BusView()
            }
            Tab("Venues", systemImage: "building.2", value: .venues) {
                VenuesView()
            }
            Tab("Modules", systemImage: "book", value: .modules) {
                ModulesView()
            }
            Tab("Wheel", systemImage: "smallcircle.filled.circle", value: .wheel) {
                WheelView()
            }
            .tabPlacement(.sidebarOnly)
        }
        .tabViewStyle(.sidebarAdaptable)
        .tint(Theme.accent)
    }
}
