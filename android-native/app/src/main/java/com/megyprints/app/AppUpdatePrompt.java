package com.megyprints.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;

/**
 * Tells the person when a new version of the app is ready (Google Play In-App Updates,
 * flexible flow).
 *
 * 1.4.0: testers stayed on old versions, because Play doesn't always update tester apps on
 * its own. From now on the app tells them when a new version is ready.
 *
 * When the app comes on screen and Play has a newer version, Google's own sheet asks to
 * download it; the person can say no, and is not asked again until the next launch. The
 * download runs while they keep using the app. Once it is in, a box says "A new version of
 * Megy Prints is ready." with "Restart to update" and "Later". The app never restarts without
 * that tap: the person may be in the middle of an album.
 *
 * Only a phone that installed the app from Play can get an update. Anywhere else (debug
 * builds, the emulator, a sideloaded APK) the check fails, and this does nothing but log.
 *
 * To see the box on the emulator: gradlew.bat assembleDebug -PfakeAppUpdate=true. That
 * debug build uses Play's FakeAppUpdateManager and plays the person saying yes and the
 * download finishing. A release build can't: FAKE_APP_UPDATE is always false there.
 */
final class AppUpdatePrompt {

    private static final String TAG = "AppUpdatePrompt";

    private final AppCompatActivity activity;
    private final AppUpdateManager manager;
    private final FakeAppUpdateManager fake; // null unless debug + -PfakeAppUpdate=true
    private final ActivityResultLauncher<IntentSenderRequest> sheetLauncher;
    private final InstallStateUpdatedListener installListener = this::onInstallState;
    private final Handler main = new Handler(Looper.getMainLooper());

    private boolean onScreen;
    private boolean askedThisLaunch;
    private boolean laterThisLaunch;
    private AlertDialog readyDialog;

    /** Call from onCreate: a result launcher registered after onStart throws. */
    AppUpdatePrompt(AppCompatActivity activity) {
        this.activity = activity;
        if (BuildConfig.DEBUG && BuildConfig.FAKE_APP_UPDATE) {
            fake = new FakeAppUpdateManager(activity);
            fake.setUpdateAvailable(BuildConfig.VERSION_CODE + 1, AppUpdateType.FLEXIBLE);
            manager = fake;
        } else {
            fake = null;
            manager = AppUpdateManagerFactory.create(activity);
        }
        sheetLauncher = activity.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onSheetAnswer);
        manager.registerListener(installListener);
    }

    /**
     * One check does both jobs: on launch it may ask about a new version, and on every return
     * it shows the "ready" box if the download finished while the app was away (Google's advice).
     */
    void onResume() {
        onScreen = true;
        try {
            manager.getAppUpdateInfo()
                .addOnSuccessListener(activity, this::onUpdateInfo)
                .addOnFailureListener(activity, (e) -> Log.i(TAG, "No update check (app not installed from Google Play?): " + e));
        } catch (RuntimeException e) {
            Log.i(TAG, "No update check: " + e);
        }
    }

    void onPause() {
        onScreen = false;
    }

    void onDestroy() {
        manager.unregisterListener(installListener);
        main.removeCallbacksAndMessages(null);
        if (readyDialog != null) readyDialog.dismiss(); // a box left on a closed screen leaks its window
    }

    private void onUpdateInfo(AppUpdateInfo info) {
        int status = info.installStatus();
        if (UpdateDecision.shouldShowReadyDialog(status, onScreen, readyDialog != null, laterThisLaunch)) {
            showReadyDialog();
            return;
        }
        boolean flexibleAllowed = info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);
        if (UpdateDecision.shouldStartFlow(info.updateAvailability(), flexibleAllowed, status, askedThisLaunch)) {
            startFlow(info);
        }
    }

    private void startFlow(AppUpdateInfo info) {
        // Set before the sheet opens: closing it brings the app back on screen, which checks again.
        askedThisLaunch = true;
        try {
            boolean shown = manager.startUpdateFlowForResult(info, sheetLauncher, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build());
            Log.i(TAG, "Version " + info.availableVersionCode() + " is out; Google's update sheet " + (shown ? "shown" : "not shown"));
            if (shown && fake != null) playFakeDownload();
        } catch (RuntimeException e) {
            Log.i(TAG, "Could not show Google's update sheet: " + e);
        }
    }

    private void onSheetAnswer(ActivityResult result) {
        // OK = yes, the download runs in the background; CANCELED = no, not asked again this launch.
        int code = result.getResultCode();
        String answer = code == Activity.RESULT_OK ? "yes" : code == Activity.RESULT_CANCELED ? "no" : "failed (" + code + ")";
        Log.i(TAG, "Update sheet answer: " + answer);
    }

    private void onInstallState(InstallState state) {
        int status = state.installStatus();
        Log.i(TAG, "Install status " + status);
        // Off screen (say, in the photo picker), onResume shows the box on the way back.
        if (UpdateDecision.shouldShowReadyDialog(status, onScreen, readyDialog != null, laterThisLaunch)) {
            showReadyDialog();
        }
    }

    private void showReadyDialog() {
        readyDialog = new AlertDialog.Builder(activity)
            .setMessage(R.string.update_ready)
            .setPositiveButton(R.string.update_restart, (d, which) -> restartToUpdate())
            .setNegativeButton(R.string.update_later, (d, which) -> laterThisLaunch = true)
            .setOnCancelListener((d) -> laterThisLaunch = true) // Back, or a tap outside the box, means Later
            .setOnDismissListener((d) -> readyDialog = null)
            .show();
        Log.i(TAG, "Showed: new version is ready");
    }

    private void restartToUpdate() {
        Log.i(TAG, "Restart to update tapped");
        try {
            manager.completeUpdate().addOnFailureListener((e) -> Log.i(TAG, "Update did not install: " + e));
        } catch (RuntimeException e) {
            Log.i(TAG, "Update did not install: " + e);
        }
        if (fake != null) {
            fake.installCompletes(); // a real update restarts the app at completeUpdate()
            Log.i(TAG, "Fake update installed");
        }
    }

    /** Debug fake only: Play's part of the story, with pauses so each step shows in logcat. */
    private void playFakeDownload() {
        main.postDelayed(() -> {
            fake.userAcceptsUpdate();
            fake.downloadStarts();
        }, 1500);
        main.postDelayed(fake::downloadCompletes, 3500);
    }
}
