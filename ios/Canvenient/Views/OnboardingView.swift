import SwiftUI
import CanvenientKit

/// First-run welcome, in the same typographic-poster language as the login
/// screen: radial surface lift, blueprint corner ticks, brand mark with the
/// ink-red dot. Three pages — what the app is, where the server lives (with
/// a live connection test), then a hand-off to sign in.
struct OnboardingView: View {
    /// Called when the user finishes (or skips); the parent then shows login.
    let onFinish: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var page = 0
    @State private var showingServerSheet = false

    private let lastPage = 2

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [Theme.surface, Theme.bg],
                center: UnitPoint(x: 0.5, y: 0.38),
                startRadius: 10,
                endRadius: 620
            )
            .ignoresSafeArea()

            CornerTicks()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button(page == lastPage ? "Done" : "Skip") { onFinish() }
                        .font(.callout)
                        .foregroundStyle(Theme.textMuted)
                }
                .padding(.top, 12)

                TabView(selection: $page) {
                    welcomePage.tag(0)
                    serverPage.tag(1)
                    signInPage.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .tint(Theme.accent)

                HStack(spacing: 7) {
                    ForEach(0...lastPage, id: \.self) { index in
                        Capsule()
                            .fill(index == page ? Theme.accent : Theme.borderStrong)
                            .frame(width: index == page ? 18 : 6, height: 6)
                            .animation(.easeInOut(duration: 0.2), value: page)
                    }
                }
                .padding(.bottom, 8)
            }
            .padding(.horizontal, 28)
        }
        .sheet(isPresented: $showingServerSheet) {
            ServerSheet(serverURL: appState.serverURL) { newURL in
                appState.updateServerURL(newURL)
            }
            .preferredColorScheme(.dark)
        }
    }

    // MARK: Page 1 — what this is

    private var welcomePage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 16)
            BrandMark()
            Text("Your NUS day, in one place.")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Theme.text)
                .padding(.top, 10)

            VStack(alignment: .leading, spacing: 16) {
                feature("square.grid.2x2", "A quiet today view",
                        "What's next, what's due, the next bus — nothing you didn't ask for.")
                feature("calendar.badge.clock", "Live Activity",
                        "Your current or next class with venue and bus, on the lock screen.")
                feature("checklist", "Tasks that keep up",
                        "Due dates, priorities and Canvas assignments in one list.")
                feature("bus", "Campus at a glance",
                        "ISB arrivals and free venues, plus modules synced from Canvas.")
            }
            .padding(.top, 26)
            Spacer(minLength: 16)
        }
        .padding(.vertical, 8)
    }

    private func feature(_ systemImage: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.callout)
                .foregroundStyle(Theme.accent)
                .frame(width: 24)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Theme.textH)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
            }
        }
    }

    // MARK: Page 2 — the server

    private var serverPage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 16)
            Text("Runs on your\nown hardware.")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.textH)
                .lineSpacing(3)

            Text("Canvenient talks to a backend you host. Away from your desk it reaches it over Tailscale, so the VPN just needs to be on.")
                .font(.callout)
                .foregroundStyle(Theme.text)
                .padding(.top, 12)

            ConnectionTester(serverURL: appState.serverURL,
                             onEditServer: { showingServerSheet = true })
                .padding(.top, 22)
            Spacer(minLength: 16)
        }
        .padding(.vertical, 8)
    }

    // MARK: Page 3 — hand-off

    private var signInPage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 16)
            Text("One account,\nevery screen.")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.textH)
                .lineSpacing(3)

            Text("Sign in with the account you use on the macOS app — or create one right here. Your timetable, tasks and modules stay in sync.")
                .font(.callout)
                .foregroundStyle(Theme.text)
                .padding(.top, 12)

            Button {
                onFinish()
            } label: {
                HStack {
                    Spacer()
                    Text("Continue to sign in")
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding(.vertical, 12)
                .background(Theme.accent.opacity(0.16),
                            in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Theme.accent, lineWidth: 1)
                )
                .foregroundStyle(Theme.accent)
            }
            .padding(.top, 26)
            Spacer(minLength: 16)
        }
        .padding(.vertical, 8)
    }
}

/// Live reachability probe against the configured backend's /health, so a
/// first-run user can tell "server down" from "Tailscale off".
struct ConnectionTester: View {
    let serverURL: String
    let onEditServer: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var status: Status = .idle

    enum Status: Equatable {
        case idle, testing, reachable, unreachable
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Server")
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                Spacer()
                Text(serverURL.replacingOccurrences(of: "https://", with: ""))
                    .font(.system(size: 11).monospaced())
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .themeCard(fill: Theme.surface, radius: 8)

            Button {
                test()
            } label: {
                HStack {
                    Spacer()
                    switch status {
                    case .idle:
                        Text("Test connection").fontWeight(.medium)
                    case .testing:
                        ProgressView().tint(Theme.textH)
                    case .reachable:
                        Label("Connected — backend is reachable", systemImage: "checkmark")
                            .foregroundStyle(Theme.success)
                            .fontWeight(.medium)
                    case .unreachable:
                        Label("Can't reach it — is Tailscale on?", systemImage: "xmark")
                            .foregroundStyle(Theme.error)
                            .fontWeight(.medium)
                    }
                    Spacer()
                }
                .padding(.vertical, 10)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Theme.borderStrong, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(status == .testing)

            Button("Use a different server") { onEditServer() }
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
        }
    }

    private func test() {
        status = .testing
        Task {
            let ok = await appState.checkConnection()
            status = ok ? .reachable : .unreachable
        }
    }
}
