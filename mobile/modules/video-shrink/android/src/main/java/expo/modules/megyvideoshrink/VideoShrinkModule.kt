package expo.modules.megyvideoshrink

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

/** What shrink is asked for (the website's QUALITY_TARGETS, videoTranscode.ts). */
class ShrinkOptions : Record {
  @Field val shortEdge: Int = 720
  @Field val videoBitrate: Int = 2_200_000
  @Field val frameRate: Double = 30.0
}

/**
 * Shrinks a memory video the way the website does in the browser
 * (src/lib/videoTranscode.ts): one H.264 + AAC MP4, its short side at most
 * 720 (Standard) or 1080 (HD) pixels, at most 30 frames a second, at the
 * tier's bitrate. Google's Media3 Transformer does the work on the phone's
 * own video hardware. Progress is sent as "onShrinkProgress" events.
 */
@UnstableApi
class VideoShrinkModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var running: Transformer? = null
  /** The promise of the video being shrunk (cancel rejects it: Transformer
   *  calls no listener after cancel()). */
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("MegyVideoShrink")
    Events("onShrinkProgress")

    /** The video's length, size as shown, and whether it has sound. */
    AsyncFunction("probe") { uri: String ->
      val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "No Android context", null)
      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(context, Uri.parse(uri))
        val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        val durationMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: -1L
        val hasAudio = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
        val sideways = rotation == 90 || rotation == 270
        mapOf(
          "width" to (if (sideways) h else w),
          "height" to (if (sideways) w else h),
          "durationMs" to durationMs.toDouble(),
          "hasAudio" to hasAudio,
        )
      } catch (e: Exception) {
        mapOf("width" to 0, "height" to 0, "durationMs" to -1.0, "hasAudio" to false)
      } finally {
        try { r.release() } catch (_: Exception) {}
      }
    }

    /** Shrinks `input` into a new MP4 at `output` (a file path). One at a time. */
    AsyncFunction("shrink") { input: String, output: String, options: ShrinkOptions, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_NO_CONTEXT", "No Android context", null))
        return@AsyncFunction
      }
      if (running != null) {
        promise.reject(CodedException("ERR_BUSY", "A video is already being shrunk", null))
        return@AsyncFunction
      }
      val out = File(output)
      out.parentFile?.mkdirs()
      if (out.exists()) out.delete()

      val videoEffects = listOf(
        FrameDropEffect.createDefaultFrameDropEffect(options.frameRate.toFloat()),
        Presentation.createForShortSide(options.shortEdge),
      )
      val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(input)))
        .setEffects(Effects(listOf(), videoEffects))
        .build()
      val encoders = DefaultEncoderFactory.Builder(context)
        .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(options.videoBitrate).build())
        .build()

      val progress = ProgressHolder()
      lateinit var poll: Runnable
      val transformer = Transformer.Builder(context)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoders)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            main.removeCallbacks(poll)
            running = null
            pending = null
            promise.resolve(mapOf("uri" to Uri.fromFile(out).toString(), "size" to out.length().toDouble()))
          }

          override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            main.removeCallbacks(poll)
            running = null
            pending = null
            if (out.exists()) out.delete()
            promise.reject(CodedException("ERR_SHRINK", exportException.message ?: "Could not shrink the video", exportException))
          }
        })
        .build()
      running = transformer
      pending = promise

      poll = Runnable {
        val t = running ?: return@Runnable
        if (t.getProgress(progress) == Transformer.PROGRESS_STATE_AVAILABLE) {
          sendEvent("onShrinkProgress", mapOf("output" to output, "progress" to progress.progress / 100.0))
        }
        main.postDelayed(poll, 500)
      }
      try {
        transformer.start(item, out.absolutePath)
        main.postDelayed(poll, 500)
      } catch (e: Exception) {
        running = null
        pending = null
        promise.reject(CodedException("ERR_SHRINK", e.message ?: "Could not start shrinking the video", e))
      }
    }.runOnQueue(Queues.MAIN)

    /** Stops the video being shrunk (its promise is rejected). */
    AsyncFunction("cancel") {
      val t = running ?: return@AsyncFunction false
      running = null
      t.cancel()
      pending?.reject(CodedException("ERR_CANCELLED", "Stopped", null))
      pending = null
      true
    }.runOnQueue(Queues.MAIN)
  }
}
