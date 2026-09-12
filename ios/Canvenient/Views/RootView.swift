import SwiftUI
import CanvenientKit

struct RootView: View {
    @EnvironmentObject private var appState: AppState

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
    }

    private var tabs: some View {
        TabView(selection: $appState.selectedTab) {
            ScheduleView()
                .tabItem { Label("Schedule", systemImage: "calendar") }
                .tag(AppState.Tab.schedule)
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checklist") }
                .tag(AppState.Tab.tasks)
            BusView()
                .tabItem { Label("Bus", systemImage: "bus") }
                .tag(AppState.Tab.bus)
            VenuesView()
                .tabItem { Label("Venues", systemImage: "building.2") }
                .tag(AppState.Tab.venues)
            ModulesView()
                .tabItem { Label("Modules", systemImage: "book") }
                .tag(AppState.Tab.modules)
        }
        .tint(Theme.accent)
    }
}
