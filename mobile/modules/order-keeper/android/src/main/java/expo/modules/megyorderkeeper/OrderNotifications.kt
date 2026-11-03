package expo.modules.megyorderkeeper

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * The order keeper's two notifications:
 *   - while Place order works: the bar ("Placing your order", "Making page 4
 *     of 40…"), quiet, on the "Placing your order" channel; it is the
 *     foreground service's own notification (OrderKeeperService);
 *   - when it is done and the person is in another app: how it went, on the
 *     "Your orders" channel.
 * Tapping either opens the app where it was (like tapping its icon).
 */
object OrderNotifications {
  private const val CHANNEL_WORKING = "megy-order-working"
  private const val CHANNEL_DONE = "megy-order-done"
  const val ID_WORKING = 4101
  private const val ID_DONE = 4102

  /** Notifications are on for the app (Android's settings for it). */
  fun allowed(context: Context): Boolean =
    NotificationManagerCompat.from(context).areNotificationsEnabled()

  /** Android 13+: the person said yes to notifications. */
  private fun canPost(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  private fun channels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_WORKING, "Placing your order", NotificationManager.IMPORTANCE_LOW),
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_DONE, "Your orders", NotificationManager.IMPORTANCE_DEFAULT),
    )
  }

  /** Opens the app as its icon does: back where it was. */
  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /** The bar. `percent` below 0: a moving bar (sending can't be measured). */
  fun working(context: Context, title: String, text: String, percent: Int): Notification {
    channels(context)
    return NotificationCompat.Builder(context, CHANNEL_WORKING)
      .setSmallIcon(R.drawable.megy_order_keeper)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setProgress(100, percent.coerceIn(0, 100), percent < 0)
      .setContentIntent(openApp(context))
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  @SuppressLint("MissingPermission")
  fun showWorking(context: Context, title: String, text: String, percent: Int) {
    if (!canPost(context)) return
    NotificationManagerCompat.from(context).notify(ID_WORKING, working(context, title, text, percent))
  }

  fun cancelWorking(context: Context) {
    NotificationManagerCompat.from(context).cancel(ID_WORKING)
  }

  @SuppressLint("MissingPermission")
  fun showDone(context: Context, title: String, text: String) {
    if (!canPost(context)) return
    channels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_DONE)
      .setSmallIcon(R.drawable.megy_order_keeper)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setContentIntent(openApp(context))
      .build()
    NotificationManagerCompat.from(context).notify(ID_DONE, notification)
  }
}
