import SwiftUI
import CanvenientKit

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
        NavigationStack {
            Form {
                Section {
                    Picker("", selection: $mode) {
                        ForEach(Mode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section("Account") {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                    if mode == .register {
                        TextField("Display name (optional)", text: $name)
                    }
                }
                Section {
                    Button {
                        submit()
                    } label: {
                        HStack {
                            Spacer()
                            if busy {
                                ProgressView()
                            } else {
                                Text(mode == .signIn ? "Sign in" : "Create account")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }
                Section {
                    Button {
                        showingServerSheet = true
                    } label: {
                        HStack {
                            Text("Server")
                            Spacer()
                            Text(appState.serverURL)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                } footer: {
                    Text("Canvenient for iPhone — sign in with your hosted Canvenient account.")
                }
            }
            .navigationTitle("Canvenient")
            .sheet(isPresented: $showingServerSheet) {
                ServerSheet(serverURL: appState.serverURL) { newURL in
                    appState.updateServerURL(newURL)
                }
            }
        }
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
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(serverURL.trimmingCharacters(in: .whitespaces))
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
