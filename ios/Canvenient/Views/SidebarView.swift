import SwiftUI
import CanvenientKit

/// Slide-out navigation drawer — the iPhone counterpart of the desktop's
/// sidebar. Hosts the low-frequency destinations so the bottom bar stays
/// to the daily anchors.
struct SidebarDrawer: View {
    @EnvironmentObject private var appState: AppState

    private let width: CGFloat = 280

    var body: some View {
        ZStack(alignment: .topLeading) {
            if appState.sidebarOpen {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture { close() }
                    .transition(.opacity)
            }
            panel
                .frame(width: width)
                .frame(maxHeight: .infinity)
                .background(Theme.surface)
                .overlay(alignment: .trailing) {
                    Rectangle().fill(Theme.border).frame(width: 1)
                }
                .ignoresSafeArea(edges: .vertical)
                .offset(x: appState.sidebarOpen ? 0 : -width - 8)
        }
        .animation(.easeOut(duration: 0.22), value: appState.sidebarOpen)
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Canvenient")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.textH)
                .padding(.top, 68)
                .padding(.bottom, 18)
                .padding(.horizontal, 18)

            section("Menu")
            item("Today", systemImage: "square.grid.2x2", tab: .dashboard)
            item("Schedule", systemImage: "calendar", tab: .schedule)
            item("Tasks", systemImage: "checklist", tab: .tasks)
            item("Campus", systemImage: "bus", tab: .campus)

            section("Library")
            item("Modules", systemImage: "book", tab: .modules)
            item("Wheel", systemImage: "smallcircle.filled.circle", tab: .wheel)

            Spacer(minLength: 12)
            section("Preferences")
            item("Settings", systemImage: "gearshape", tab: .settings)
                .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func section(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .kerning(0.08)
            .foregroundStyle(Theme.textMuted)
            .padding(.horizontal, 18)
            .padding(.vertical, 6)
    }

    private func item(_ label: String, systemImage: String, tab: AppState.Tab) -> some View {
        let selected = appState.selectedTab == tab
        return Button {
            appState.selectedTab = tab
            close()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 20)
                    .foregroundStyle(selected ? Theme.accent : Theme.textMuted)
                Text(label)
                    .font(.system(size: 15, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Theme.textH : Theme.text)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(selected ? Theme.surfaceWarm : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private func close() {
        appState.sidebarOpen = false
    }
}

/// Leading toolbar button that opens the drawer. Drop into any tab's
/// NavigationStack toolbar.
struct SidebarToggle: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Button { appState.sidebarOpen = true } label: {
            Image(systemName: "sidebar.leading")
        }
        .tint(Theme.accent)
    }
}
