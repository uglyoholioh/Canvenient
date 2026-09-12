import SwiftUI
import CanvenientKit

/// Campus entry point: two rich destination cards instead of a bare rows
/// list — the icon-and-description language of the onboarding pages.
struct CampusView: View {

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    destinationCard(
                        title: "Internal Shuttle Bus",
                        detail: "Live ISB arrivals for every stop, with favourites a swipe away.",
                        systemImage: "bus.fill",
                        tint: Theme.info
                    ) {
                        BusView()
                    }
                    destinationCard(
                        title: "Free Venues",
                        detail: "Find a free room or lecture theatre near you, right now.",
                        systemImage: "building.2.fill",
                        tint: Theme.success
                    ) {
                        VenuesView()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .padding(.bottom, 24)
            }
            .background(Theme.bg)
            .navigationTitle("Campus")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { SidebarToggle() }
            }
        }
    }

    private func destinationCard<D: View>(
        title: String,
        detail: String,
        systemImage: String,
        tint: Color,
        @ViewBuilder destination: () -> D
    ) -> some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: 20))
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.textH)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textMuted.opacity(0.6))
            }
            .padding(14)
            .themeCard()
        }
        .buttonStyle(PressableCardStyle())
    }
}
