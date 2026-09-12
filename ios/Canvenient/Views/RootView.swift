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
        TabView {
            ScheduleView()
                .tabItem { Label("Schedule", systemImage: "calendar") }
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checklist") }
            BusView()
                .tabItem { Label("Bus", systemImage: "bus") }
            WheelView()
                .tabItem { Label("Wheel", systemImage: "disk") }
            ModulesView()
                .tabItem { Label("Modules", systemImage: "book") }
        }
    }
}
