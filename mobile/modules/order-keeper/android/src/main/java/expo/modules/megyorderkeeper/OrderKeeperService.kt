package expo.modules.megyorderkeeper

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
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
 */
class OrderKeeperService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Placing your order"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val notification = OrderNotifications.working(this, title, text, -1)
    val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    try {
      ServiceCompat.startForeground(this, OrderNotifications.ID_WORKING, notification, type)
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
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
  }
}
