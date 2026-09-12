// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CanvenientKit",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "CanvenientKit", targets: ["CanvenientKit"])
    ],
    targets: [
        .target(
            name: "CanvenientKit",
            path: "Sources/CanvenientKit",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
