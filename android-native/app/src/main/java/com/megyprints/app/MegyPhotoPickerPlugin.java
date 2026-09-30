package com.megyprints.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Uncapped multi-photo picker.
 *
 * Android 13+ redirects ACTION_GET_CONTENT (and <input type=file accept=image/*>)
 * into the system Photo Picker, which stops at ~100 photos. ACTION_OPEN_DOCUMENT
 * is NOT redirected: it opens the Files picker, which has no cap and has
 * "Select all". pick() returns the chosen URIs; read() streams one file's bytes
 * at a time so 500 photos are never held in memory at once.
 */
@CapacitorPlugin(name = "MegyPhotoPicker")
public class MegyPhotoPickerPlugin extends Plugin {

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("files", new JSArray()));
            return;
        }
        Intent data = result.getData();
        JSArray files = new JSArray();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) files.put(describe(clip.getItemAt(i).getUri()));
        } else if (data.getData() != null) {
            files.put(describe(data.getData()));
        }
        call.resolve(new JSObject().put("files", files));
    }

    private JSObject describe(Uri uri) {
        JSObject o = new JSObject();
        o.put("uri", uri.toString());
        String type = getContext().getContentResolver().getType(uri);
        o.put("mimeType", type == null ? "image/jpeg" : type);
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int s = c.getColumnIndex(OpenableColumns.SIZE);
                if (n >= 0) o.put("name", c.getString(n));
                if (s >= 0) o.put("size", c.getLong(s));
            }
        } catch (Exception ignored) {}
        if (!o.has("name")) o.put("name", "photo-" + Math.abs(uri.hashCode()) + ".jpg");
        return o;
    }

    @PluginMethod
    public void read(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri required"); return; }
        try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
            if (in == null) { call.reject("cannot open"); return; }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            call.resolve(new JSObject().put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)));
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "read failed" : e.getMessage());
        }
    }
}
