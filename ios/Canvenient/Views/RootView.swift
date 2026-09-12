import SwiftUI
import CanvenientKit

struct RootView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage(Theme.modeKey) private var themeMode = ThemeMode.graphite.rawValue

    var body: some View {
        ZStack(alignment: .topLeading) {
            tabs
            SidebarDrawer()
        }
        .animation(.easeInOut(duration: 0.2), value: appState.session)
        .preferredColorScheme(.dark)
        .fullScreenCover(item: $appState.overlay) { destination in
            Group {
                switch destination {
                case .modules: ModulesView(showsDone: true)
                case .wheel: WheelView(showsDone: true)
                case .settings: SettingsView(showsDone: true)
                }
            }
            .preferredColorScheme(.dark)
        }
        // Rebuild on palette change so every Theme.* colour re-evaluates.
        .id(themeMode)
    }

    private var tabs: some View {
        TabView(selection: $appState.selectedTab) {
            Tab("Today", systemImage: "square.grid.2x2", value: .dashboard) {
                DashboardView()
            }
            Tab("Schedule", systemImage: "calendar", value: .schedule) {
                ScheduleView()
            }
            Tab("Tasks", systemImage: "checklist", value: .tasks) {
                TasksView()
            }
            Tab("Campus", systemImage: "bus", value: .campus) {
                CampusView()
            }
        }
        .tint(Theme.accent)
    }
}
