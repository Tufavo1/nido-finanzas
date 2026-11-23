// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import cl.dinovance.contigo.plugin.ContigoNativePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins locales se registran antes de super.onCreate (que arranca el puente).
        registerPlugin(ContigoNativePlugin.class);
        DeepLinkGuard.INSTANCE.sanitize(getIntent());
        // Sin capturas de pantalla ni miniatura en «recientes»: la app muestra montos y comercios (S-04).
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        super.onCreate(savedInstanceState);
        // Ronda 5: el WebView solo carga la app empaquetada (https://localhost via el servidor local de Capacitor).
        // Sin file:// ni content:// (en Android 8-10 file:// venia permitido por defecto), sin geolocalizacion
        // (Contigo no la pide) y sin toques a traves de una ventana superpuesta (tapjacking en Android < 12).
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setFilterTouchesWhenObscured(true);
            WebSettings settings = webView.getSettings();
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setGeolocationEnabled(false);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        DeepLinkGuard.INSTANCE.sanitize(intent);
        super.onNewIntent(intent);
    }
}
