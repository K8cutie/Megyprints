import BackgroundTasks
import ExpoModulesCore
import UIKit
import UserNotifications

/**
 * The iPhone half of modules/order-keeper (the Android half is
 * android/.../OrderKeeperModule.kt; same name, same calls).
 *
 * iPhone has no foreground service. While Place order makes and sends the
 * print files:
 *   - every iPhone: a background task (beginBackgroundTask), so a quick look
 *     at another app does not stop the order (iOS gives it about 30 s);
 *   - iOS 26 and later: a "continued processing" task
 *     (BGContinuedProcessingTask), the kind iOS keeps going for work the
 *     person started, with iOS's own progress bar on screen. Only then does
 *     `start` say it runs (`service: true`), so only then does the screen say
 *     "You can use other apps…"; on older iPhones it keeps "Keep this screen
 *     open".
 *   - at the end, while the person is in another app: a notification that
 *     says how it went (tap: the app opens).
 * Pages are drawn on CPU surfaces (Skia Surface.Make), which iOS allows in
 * the background.
 *
 * Its task ids are "<bundle id>.order.<n>", allowed by app.json's
 * BGTaskSchedulerPermittedIdentifiers "$(PRODUCT_BUNDLE_IDENTIFIER).order.*".
 */
public class OrderKeeperModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MegyOrderKeeper")

    OnCreate {
      OrderKeeper.shared.readNotificationSettings()
    }

    Function("notificationsAllowed") { () -> Bool in
      OrderKeeper.shared.notificationsAllowed
    }

    // iPhone asks before an app may show notifications (Android 13+ asks
    // through PermissionsAndroid in JS instead).
    AsyncFunction("requestNotifications") { () async -> Bool in
      await OrderKeeper.shared.requestNotifications()
    }

    AsyncFunction("start") { (title: String, text: String) -> [String: Bool] in
      OrderKeeper.shared.start(title: title, text: text)
    }.runOnQueue(.main)

    Function("update") { (title: String, text: String, percent: Double) in
      DispatchQueue.main.async { OrderKeeper.shared.update(title: title, text: text, percent: percent) }
    }

    AsyncFunction("finish") { (title: String?, text: String?) in
      OrderKeeper.shared.finish(title: title, text: text)
    }.runOnQueue(.main)
  }
}

/** One order at a time, on the main thread (start/update/finish go there). */
final class OrderKeeper: @unchecked Sendable {
  static let shared = OrderKeeper()

  private let lock = NSLock()
  private var allowed = false
  private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
  /** The iOS 26 task, once iOS has started it (BGContinuedProcessingTask). */
  private var continued: AnyObject?
  private var continuedId: String?
  /** The latest words and bar, for a task iOS starts a moment after `start`. */
  private var latest: (title: String, text: String, percent: Double) = ("", "", 0)
  private var counter = 0

  var notificationsAllowed: Bool {
    lock.lock(); defer { lock.unlock() }
    return allowed
  }

  private func setAllowed(_ ok: Bool) {
    lock.lock(); allowed = ok; lock.unlock()
  }

  func readNotificationSettings() {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let s = settings.authorizationStatus
      OrderKeeper.shared.setAllowed(s == .authorized || s == .provisional || s == .ephemeral)
    }
  }

  func requestNotifications() async -> Bool {
    let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    if ok {
      setAllowed(true)
    } else {
      readNotificationSettings()
    }
    return ok
  }

  // MARK: start, update, finish (main thread)

  func start(title: String, text: String) -> [String: Bool] {
    stopAll(success: false)
    latest = (title, text, 0)
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Megy Prints order") {
      OrderKeeper.shared.endBackgroundTask()
    }
    var keeps = false
    if #available(iOS 26.0, *) {
      keeps = startContinued(title: title, text: text)
    }
    // "service": iOS keeps the order going in other apps (iOS 26+).
    // "task": false, as React Native's timers need no headless task here.
    return ["service": keeps, "task": false]
  }

  func update(title: String, text: String, percent: Double) {
    latest = (title, text, percent)
    if #available(iOS 26.0, *), let task = continued as? BGContinuedProcessingTask {
      show(latest, on: task)
    }
  }

  func finish(title: String?, text: String?) {
    stopAll(success: true)
    if let title = title, notificationsAllowed {
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = text ?? ""
      content.sound = .default
      let request = UNNotificationRequest(identifier: "megy-order-done", content: content, trigger: nil)
      UNUserNotificationCenter.current().add(request) { error in
        if let error = error { NSLog("[MegyOrderKeeper] notification not shown: \(error.localizedDescription)") }
      }
    }
  }

  // MARK: the tasks

  private func endBackgroundTask() {
    let task = backgroundTask
    backgroundTask = .invalid
    if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
  }

  private func stopAll(success: Bool) {
    if #available(iOS 26.0, *), let task = continued as? BGContinuedProcessingTask {
      task.setTaskCompleted(success: success)
    }
    continued = nil
    continuedId = nil
    endBackgroundTask()
  }

  @available(iOS 26.0, *)
  private func startContinued(title: String, text: String) -> Bool {
    counter += 1
    let id = "\(Bundle.main.bundleIdentifier ?? "com.megyprints.app").order.\(counter)"
    let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: .main) { task in
      guard let task = task as? BGContinuedProcessingTask else {
        task.setTaskCompleted(success: false)
        return
      }
      OrderKeeper.shared.began(task, id: id)
    }
    guard registered else {
      NSLog("[MegyOrderKeeper] could not register \(id)")
      return false
    }
    let request = BGContinuedProcessingTaskRequest(identifier: id, title: title, subtitle: text)
    // Start now or not at all: an order never waits in a queue.
    request.strategy = .fail
    do {
      try BGTaskScheduler.shared.submit(request)
      continuedId = id
      return true
    } catch {
      NSLog("[MegyOrderKeeper] continued task not started: \(error.localizedDescription)")
      return false
    }
  }

  /** iOS started the task (main queue). */
  @available(iOS 26.0, *)
  private func began(_ task: BGContinuedProcessingTask, id: String) {
    guard id == continuedId else {
      // An order that already finished: nothing left to keep going.
      task.setTaskCompleted(success: true)
      return
    }
    continued = task
    task.expirationHandler = {
      // iOS (or the person, from iOS's own bar) ended it: let it go.
      DispatchQueue.main.async {
        if OrderKeeper.shared.continuedId == id {
          OrderKeeper.shared.continued = nil
          OrderKeeper.shared.continuedId = nil
        }
      }
    }
    task.progress.totalUnitCount = 100
    show(latest, on: task)
  }

  @available(iOS 26.0, *)
  private func show(_ words: (title: String, text: String, percent: Double), on task: BGContinuedProcessingTask) {
    // Below 0: sending, no known share yet. iOS's bar keeps its last value.
    if words.percent >= 0 {
      task.progress.completedUnitCount = Int64(max(0, min(100, words.percent.rounded())))
    }
    task.updateTitle(words.title, subtitle: words.text)
  }
}
