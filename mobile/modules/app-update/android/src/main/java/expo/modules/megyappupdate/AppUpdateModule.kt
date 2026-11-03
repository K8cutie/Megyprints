package expo.modules.megyappupdate

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager
import com.google.android.play.core.install.model.AppUpdateType
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play's in-app updates, the flexible kind, for src/lib/appUpdate.ts (../../../../index.ts):
 *   - check: Play's word on a newer version and its download (Play's own numbers);
 *   - startFlexible: Google's sheet, "Update available"; a yes downloads it while the person
 *     keeps using the app;
 *   - completeUpdate: installs the download, and the app restarts.
 * The JavaScript decides when (1.x's rules, android-native AppUpdatePrompt.java). Only an app
 * installed from Google Play gets an answer: anywhere else check fails, and nothing shows.
 *
 * MEGY_FAKE_APP_UPDATE=1 at build time (emulator builds only, never Play): Play's
 * FakeAppUpdateManager with a newer version out, and Play's part played by itself after the
 * sheet (yes, the download, done), as 1.x's -PfakeAppUpdate=true.
 */
class AppUpdateModule : Module() {
  private var manager: AppUpdateManager? = null
  private var fake: FakeAppUpdateManager? = null
  private val main = Handler(Looper.getMainLooper())

  private fun manager(): AppUpdateManager {
    manager?.let { return it }
    val ctx: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val made: AppUpdateManager = if (BuildConfig.FAKE_APP_UPDATE) {
      val code = PackageInfoCompat.getLongVersionCode(ctx.packageManager.getPackageInfo(ctx.packageName, 0)).toInt()
      FakeAppUpdateManager(ctx).also {
        it.setUpdateAvailable(code + 1, AppUpdateType.FLEXIBLE)
        fake = it
        Log.i(TAG, "Fake Play update: version ${code + 1} is out")
      }
    } else {
      AppUpdateManagerFactory.create(ctx)
    }
    manager = made
    return made
  }

  override fun definition() = ModuleDefinition {
    Name("MegyAppUpdate")

    AsyncFunction("check") { promise: Promise ->
      try {
        manager().appUpdateInfo
          .addOnSuccessListener { info ->
            Log.i(TAG, "Play: availability ${info.updateAvailability()}, install status ${info.installStatus()}, version ${info.availableVersionCode()}")
            promise.resolve(infoMap(info))
          }
          .addOnFailureListener { e ->
            Log.i(TAG, "No update check (app not installed from Google Play?): $e")
            promise.reject("ERR_APP_UPDATE_CHECK", "No update check", e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_APP_UPDATE_CHECK", "No update check", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startFlexible") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val m = manager()
        m.appUpdateInfo
          .addOnSuccessListener { info ->
            try {
              // The answer (yes or no) only goes to the log: the next check says what happened.
              m.startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE))
                .addOnSuccessListener { code -> Log.i(TAG, "Update sheet answer: $code") }
                .addOnFailureListener { e -> Log.i(TAG, "Update sheet failed: $e") }
              Log.i(TAG, "Version ${info.availableVersionCode()} is out: Google's update sheet shown")
              fake?.let { playFakeDownload(it) }
              promise.resolve(true)
            } catch (e: Exception) {
              Log.i(TAG, "Could not show Google's update sheet: $e")
              promise.resolve(false)
            }
          }
          .addOnFailureListener { e ->
            Log.i(TAG, "No update check: $e")
            promise.resolve(false)
          }
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("completeUpdate") { promise: Promise ->
      Log.i(TAG, "Restart to update tapped")
      try {
        manager().completeUpdate()
          .addOnFailureListener { e -> Log.i(TAG, "Update did not install: $e") }
        // A real update restarts the app here; the fake says it is in.
        fake?.let {
          it.installCompletes()
          Log.i(TAG, "Fake update installed")
        }
      } catch (e: Exception) {
        Log.i(TAG, "Update did not install: $e")
      }
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      main.removeCallbacksAndMessages(null)
    }
  }

  /** Fake only: Play's part of the story, with pauses so each step shows in logcat. */
  private fun playFakeDownload(f: FakeAppUpdateManager) {
    main.postDelayed({
      f.userAcceptsUpdate()
      f.downloadStarts()
      Log.i(TAG, "Fake: yes, the download started")
    }, 1500)
    main.postDelayed({
      f.downloadCompletes()
      Log.i(TAG, "Fake: the download is in")
    }, 3500)
  }

  private fun infoMap(info: AppUpdateInfo): Map<String, Any?> = mapOf(
    "availability" to info.updateAvailability(),
    "installStatus" to info.installStatus(),
    "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
    "versionCode" to info.availableVersionCode(),
  )

  companion object {
    private const val TAG = "MegyAppUpdate"
  }
}
