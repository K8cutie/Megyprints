package com.megyprints.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Uncapped multi-photo picking for every <input type=file multiple accept=image/*>.
 *
 * The stock chooser uses ACTION_GET_CONTENT, which Android 13+ redirects into the
 * system Photo Picker — and that stops a selection at ~100 photos. ACTION_OPEN_DOCUMENT
 * is not redirected: it opens the Files picker (no cap, has "Select all").
 *
 * The URIs go straight back to the WebView, which turns them into ordinary
 * disk-backed File objects — exactly like Chrome. No copying through JS, so 500
 * full-size photos cost no memory (an earlier bytes-over-the-bridge version hit
 * WebView's ~360 MB blob ceiling at ~120 photos).
 */
public class MegyWebChromeClient extends BridgeWebChromeClient {

    private final ActivityResultLauncher<Intent> photoLauncher;
    private ValueCallback<Uri[]> pending;

    public MegyWebChromeClient(Bridge bridge) {
        super(bridge);
        photoLauncher = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), (result) -> {
            ValueCallback<Uri[]> cb = pending;
            pending = null;
            if (cb == null) return;
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null) {
                cb.onReceiveValue(null);
                return;
            }
            ClipData clip = data.getClipData();
            if (clip != null) {
                Uri[] uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
                cb.onReceiveValue(uris);
            } else if (data.getData() != null) {
                cb.onReceiveValue(new Uri[] { data.getData() });
            } else {
                cb.onReceiveValue(null);
            }
        });
    }

    private static boolean isMultiPhoto(FileChooserParams params) {
        if (params.getMode() != FileChooserParams.MODE_OPEN_MULTIPLE || params.isCaptureEnabled()) return false;
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return false;
        for (String t : types) {
            if (t == null || !(t.startsWith("image/") || t.isEmpty())) return false;
        }
        return true;
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
        if (!isMultiPhoto(params)) return super.onShowFileChooser(webView, filePathCallback, params);
        if (pending != null) pending.onReceiveValue(null); // never leave a previous input hanging
        pending = filePathCallback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            photoLauncher.launch(intent);
        } catch (ActivityNotFoundException e) {
            pending = null;
            return super.onShowFileChooser(webView, filePathCallback, params);
        }
        return true;
    }
}
