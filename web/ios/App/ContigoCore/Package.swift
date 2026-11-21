// swift-tools-version: 5.9
import PackageDescription

// Lógica nativa de Contigo sin dependencias de Capacitor (validación de enlaces,
// importes y Keychain). Se puede probar con `swift test` en un Mac.
let package = Package(
    name: "ContigoCore",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "ContigoCore", targets: ["ContigoCore"])
    ],
    targets: [
        .target(name: "ContigoCore"),
        .testTarget(name: "ContigoCoreTests", dependencies: ["ContigoCore"])
    ]
)
