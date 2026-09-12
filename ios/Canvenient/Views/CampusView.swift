import SwiftUI
import CanvenientKit

struct CampusView: View {

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
            }
            .themedForm()
            .navigationTitle("Campus")
        }
    }
}
