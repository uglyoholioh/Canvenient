import SwiftUI
import CanvenientKit

/// Desktop auth.css language: typographic poster on a radial surface-to-bg
/// lift, blueprint corner ticks, mono corner metadata, brand mark with the
/// icon's ink-red dot.
struct LoginView: View {
    @EnvironmentObject private var appState: AppState

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var busy = false
    @State private var errorMessage: String?
    @State private var showingServerSheet = false

    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in"
        case register = "Create account"
        var id: String { rawValue }
    }

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

            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 24)
                BrandMark()
                Spacer(minLength: 12)

                VStack(alignment: .leading, spacing: 18) {
                    Picker("", selection: $mode) {
                        ForEach(Mode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(alignment: .leading, spacing: 14) {
                        authField("Email", text: $email)
                        authField("Password", text: $password, secure: true)
                        if mode == .register {
                            authField("Display name (optional)", text: $name)
                        }
                    }

                    Button {
                        submit()
                    } label: {
                        HStack {
                            Spacer()
                            if busy {
                                ProgressView().tint(Theme.textH)
                            } else {
                                Text(mode == .signIn ? "Sign in" : "Create account")
                                    .fontWeight(.semibold)
                            }
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
                    .disabled(busy || email.isEmpty || password.isEmpty)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.callout)
                            .foregroundStyle(Theme.error)
                    }

                    Button {
                        showingServerSheet = true
                    } label: {
                        HStack {
                            Text("SERVER")
                                .font(.system(size: 10, weight: .semibold))
                                .kerning(0.08)
                                .foregroundStyle(Theme.textMuted)
                            Spacer()
                            Text(appState.serverURL.replacingOccurrences(of: "https://", with: ""))
                                .font(.system(size: 11).monospaced())
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 12)
                        .themeCard(fill: Theme.surface, radius: 8)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
                Text("CANVENIENT FOR IPHONE · COMPANION TO THE MACOS WORKBENCH")
                    .font(.system(size: 9.5, weight: .medium).monospaced())
                    .kerning(0.08)
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 6)
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

    private func authField(_ placeholder: String, text: Binding<String>, secure: Bool = false) -> some View {
        Group {
            if secure {
                SecureField(placeholder, text: text)
            } else {
                TextField(placeholder, text: text)
                    .keyboardType(placeholder == "Email" ? .emailAddress : .default)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .font(.system(size: 15))
        .foregroundStyle(Theme.textH)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .themeCard(fill: Theme.surface, radius: 8)
    }

    private func submit() {
        busy = true
        errorMessage = nil
        Task {
            defer { busy = false }
            do {
                switch mode {
                case .signIn:
                    try await appState.signIn(email: email, password: password)
                case .register:
                    try await appState.signUp(email: email, password: password, name: name.isEmpty ? nil : name)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct BrandMark: View {
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text("Canvenient")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(Theme.textH)
            Circle()
                .fill(Theme.brandDot)
                .frame(width: 8, height: 8)
        }
    }
}

struct CornerTicks: View {
    var body: some View {
        Canvas { context, size in
            let length: CGFloat = 16
            let inset: CGFloat = 20
            var path = Path()
            func tick(_ x: CGFloat, _ y: CGFloat, _ dx: CGFloat, _ dy: CGFloat) {
                path.move(to: CGPoint(x: x + dx * length, y: y))
                path.addLine(to: CGPoint(x: x, y: y))
                path.addLine(to: CGPoint(x: x, y: y + dy * length))
            }
            tick(inset, inset, 1, 1)
            tick(size.width - inset, inset, -1, 1)
            tick(size.width - inset, size.height - inset, -1, -1)
            tick(inset, size.height - inset, 1, -1)
            context.stroke(path, with: .color(Theme.borderStrong), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

struct ServerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var serverURL: String
    let onSave: (String) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://your-server", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("The iOS app talks to your hosted Canvenient backend over HTTPS (e.g. a Tailscale URL or Fly.io deployment).")
                }
            }
            .themedForm()
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(serverURL.trimmingCharacters(in: .whitespaces))
                        dismiss()
                    }
                    .tint(Theme.accent)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(Theme.accent)
                }
            }
        }
    }
}
