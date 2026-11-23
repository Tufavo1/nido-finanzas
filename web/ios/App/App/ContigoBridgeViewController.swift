import UIKit
import Capacitor

/// Registra el plugin propio (los plugins locales no se autodescubren en Capacitor).
class ContigoBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ContigoPlugin())
    }
}
