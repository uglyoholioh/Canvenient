import SwiftUI
import CanvenientKit

struct CampusView: View {
    @State private var showingWheel = false

    var body: some View {
        NavigationStack {
            List {
                Section("Transport") {
                    NavigationLink { BusView() } label: {
                        Label("Internal Shuttle Bus", systemImage: "bus")
                    }
                }
                Section("Facilities") {
                    NavigationLink { VenuesView() } label: {
                        Label("Free Venues", systemImage: "building.2")
                    }
                }
                Section("Fun") {
                    Button { showingWheel = true } label: {
                        Label("Spin the Wheel", systemImage: "smallcircle.filled.circle")
                    }
                    .foregroundStyle(Theme.text)
                }
            }
            .themedForm()
            .navigationTitle("Campus")
            .sheet(isPresented: $showingWheel) {
                WheelView()
                    .preferredColorScheme(.dark)
            }
        }
    }
}
