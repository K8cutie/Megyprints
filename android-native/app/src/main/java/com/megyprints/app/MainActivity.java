package com.megyprints.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AppUpdatePrompt updatePrompt;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Still before onStart, so the chooser can register its result launcher.
        bridge.getWebView().setWebChromeClient(new MegyWebChromeClient(bridge));
        // Same for the launcher of Google's update sheet.
        updatePrompt = new AppUpdatePrompt(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        updatePrompt.onResume();
    }

    @Override
    public void onPause() {
        super.onPause();
        updatePrompt.onPause();
    }

    @Override
    public void onDestroy() {
        if (updatePrompt != null) updatePrompt.onDestroy();
        super.onDestroy();
    }
}
