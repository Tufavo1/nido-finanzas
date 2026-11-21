// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;

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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        DeepLinkGuard.INSTANCE.sanitize(intent);
        super.onNewIntent(intent);
    }
}
