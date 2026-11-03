package expo.modules.megyorderkeeper

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat

/**
 * The foreground service that keeps the app working while Place order makes
 * and sends the print files and the person uses other apps. It does no work
 * itself (the app's JavaScript does): while it runs, Android keeps the app
 * in the "foreground" class, so it is not frozen or closed to save battery.
 * Its notification shows the bar (OrderNotifications.working).
 *
 * Type dataSync: sending the album's files to the print shop. Android 15
 * gives dataSync about 6 hours a day; onTimeout stops it then.
 *
 * It also keeps the phone's processor awake while it runs (a partial wake
 * lock: the screen may go dark, the work goes on), for at most WAKE_MS;
 * without it the work all but stops once the screen turns off.
 */
class OrderKeeperService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  private fun keepAwake() {
    if (wakeLock?.isHeld == true) return
    try {
      val pm = getSystemService(POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MegyPrints:order").apply {
        setReferenceCounted(false)
        acquire(WAKE_MS)
      }
    } catch (e: Exception) {
      // No wake lock: the order still goes on while the screen is on.
      wakeLock = null
    }
  }

  private fun letSleep() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (e: Exception) {
      // Already let go.
    }
    wakeLock = null
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Placing your order"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val notification = OrderNotifications.working(this, title, text, -1)
    val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    try {
      ServiceCompat.startForeground(this, OrderNotifications.ID_WORKING, notification, type)
      keepAwake()
    } catch (e: Exception) {
      // Android refused (rare: the app was no longer in front). The order
      // still goes on while the app is open.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  // Android 15: the day's dataSync time is used up.
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  // The app was swiped away: its work stopped with it.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
  }

  override fun onDestroy() {
    letSleep()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    /** Longest the processor is kept awake for one order: 2 hours. */
    const val WAKE_MS = 2L * 60 * 60 * 1000
  }
}
