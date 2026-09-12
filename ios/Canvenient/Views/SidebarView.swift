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
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: appState.sidebarOpen)
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Canvenient")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.textH)
                .padding(.top, 68)
                .padding(.bottom, 2)
                .padding(.horizontal, 18)
            if let email = appState.user?.email {
                Text(email)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .padding(.bottom, 14)
                    .padding(.horizontal, 18)
            } else {
                Text("Companion to the macOS workbench")
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                    .padding(.bottom, 14)
                    .padding(.horizontal, 18)
            }

            section("Menu")
            item("Today", systemImage: "square.grid.2x2", tab: .dashboard)
            item("Schedule", systemImage: "calendar", tab: .schedule)
            item("Tasks", systemImage: "checklist", tab: .tasks)
            item("Campus", systemImage: "bus", tab: .campus)

            section("Library")
            overlayItem("Modules", systemImage: "book", destination: .modules)
            overlayItem("Wheel", systemImage: "smallcircle.filled.circle", destination: .wheel)

            Spacer(minLength: 12)
            section("Preferences")
            overlayItem("Settings", systemImage: "gearshape", destination: .settings)
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
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .background(selected ? Theme.surfaceWarm : Color.clear)
        }
        .buttonStyle(.plain)
    }

    /// Library destinations aren't tabs — they present full screen.
    private func overlayItem(_ label: String, systemImage: String,
                             destination: AppState.OverlayDestination) -> some View {
        Button {
            appState.overlay = destination
            close()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 20)
                    .foregroundStyle(Theme.textMuted)
                Text(label)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.text)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
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
