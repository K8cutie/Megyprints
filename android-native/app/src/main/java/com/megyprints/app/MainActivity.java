package com.megyprints.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Still before onStart, so the chooser can register its result launcher.
        bridge.getWebView().setWebChromeClient(new MegyWebChromeClient(bridge));
    }
}
