package expo.modules.megyorderkeeper

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Keeps Place order going while the person uses other apps (../../../../index.ts,
 * src/lib/checkout/backgroundSend.ts):
 *   - start: the foreground service with its notification (the bar), and a
 *     React Native headless task. With the app out of sight React Native
 *     stops the app's timers unless a headless task is running, and making
 *     the print files waits on a timer between pages. The task's JavaScript
 *     half (registered in index.ts) waits until finish.
 *   - update: the notification's words and bar.
 *   - finish: both stopped; with words, the "done" notification.
 * Started only from the screen, while the app is in front (Android lets a
 * foreground service start only then).
 */
class OrderKeeperModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** The running headless task, if any. */
  private var taskId: Int? = null

  override fun definition() = ModuleDefinition {
    Name("MegyOrderKeeper")

    Function("notificationsAllowed") {
      OrderNotifications.allowed(context)
    }

    // On the main thread: React Native starts a headless task only there.
    AsyncFunction("start") Coroutine { title: String, text: String ->
      withContext(Dispatchers.Main) { start(title, text) }
    }

    Function("update") { title: String, text: String, percent: Int ->
      OrderNotifications.showWorking(context, title, text, percent)
    }

    AsyncFunction("finish") Coroutine { title: String?, text: String? ->
      withContext(Dispatchers.Main) { finish(title, text) }
    }
  }

  private fun start(title: String, text: String): Map<String, Boolean> {
    val ctx = context
    var service = false
    try {
      val intent = Intent(ctx, OrderKeeperService::class.java)
        .putExtra(OrderKeeperService.EXTRA_TITLE, title)
        .putExtra(OrderKeeperService.EXTRA_TEXT, text)
      ContextCompat.startForegroundService(ctx, intent)
      service = true
    } catch (e: Exception) {
      // Android refused (the app not in front): the order goes on while the app is open.
    }
    var task = false
    val react = ctx as? ReactContext
    if (react != null) {
      try {
        if (taskId == null) {
          taskId = HeadlessJsTaskContext.getInstance(react)
            .startTask(HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0L, true))
        }
        task = true
      } catch (e: Exception) {
        taskId = null
      }
    }
    return mapOf("service" to service, "task" to task)
  }

  private fun finish(title: String?, text: String?) {
    val ctx = context
    try {
      ctx.stopService(Intent(ctx, OrderKeeperService::class.java))
    } catch (e: Exception) {
      // Already stopped.
    }
    OrderNotifications.cancelWorking(ctx)
    val id = taskId
    taskId = null
    val react = ctx as? ReactContext
    if (id != null && react != null) {
      // Safe twice: the JavaScript half finishes it too.
      HeadlessJsTaskContext.getInstance(react).finishTask(id)
    }
    if (title != null && text != null) OrderNotifications.showDone(ctx, title, text)
  }

  companion object {
    /** The JavaScript half's name (index.ts KEEPER_TASK). */
    const val TASK_KEY = "MegyOrderKeeper"
  }
}
