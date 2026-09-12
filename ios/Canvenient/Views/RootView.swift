import SwiftUI
import CanvenientKit

struct RootView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage(Theme.modeKey) private var themeMode = ThemeMode.graphite.rawValue

    var body: some View {
        Group {
            switch appState.session {
            case .unknown:
                splash
            case .loggedOut:
                LoggedOutRoot()
            case .loggedIn:
                mainChrome
            }
        }
        .animation(.easeInOut(duration: 0.2), value: appState.session)
        .preferredColorScheme(.dark)
        // Rebuild on palette change so every Theme.* colour re-evaluates.
        .id(themeMode)
    }

    /// Brief branded hold while the saved session is being validated.
    private var splash: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            BrandMark()
        }
    }

    private var mainChrome: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 0) {
                if appState.offline {
                    offlineBanner
                }
                tabs
            }
            SidebarDrawer()
        }
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
    }

    private var offlineBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.caption)
            Text(bannerText)
                .font(.caption)
                .fontWeight(.medium)
            Spacer()
        }
        .foregroundStyle(Theme.textH)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.surfaceWarm)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.borderStrong).frame(height: 1)
        }
    }

    private var bannerText: String {
        if let synced = SharedStore.lastSyncDate {
            return "Offline — last synced \(synced.formatted(date: .omitted, time: .shortened))"
        }
        return "Offline — showing last synced data"
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

/// Signed-out shell: first launch shows the onboarding walk-through, after
/// that the login screen — with a link back to the walk-through.
struct LoggedOutRoot: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage("canvenient.onboardingDone") private var onboardingDone = false

    var body: some View {
        if onboardingDone {
            LoginView(showOnboarding: { onboardingDone = false })
        } else {
            OnboardingView { onboardingDone = true }
        }
    }
}
