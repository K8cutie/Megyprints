package expo.modules.megyvideoshrink

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
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
  /** HEVC (H.265) at this bitrate when the phone can make it; 0 = H.264 only.
   *  The same look in about a third less space (owner, 2026-11-21:
   *  "HEVC is low risk so lets do it"). */
  @Field val hevcBitrate: Int = 0
  /** How an HDR video is made normal (Composition.HDR_MODE_*); -1 = the
   *  best one: tone-mapped with OpenGL on Android 10+. The caller tries the
   *  others when that fails (a phone without GL_EXT_YUV_target). */
  @Field val hdrMode: Int = -1
}

/** Android's own software encoders (c2.android.*, OMX.google.*). */
private fun softwareOnly(info: MediaCodecInfo): Boolean =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) info.isSoftwareOnly
  else info.name.startsWith("c2.android.", ignoreCase = true) || info.name.startsWith("OMX.google.", ignoreCase = true)

/**
 * The phone has a HARDWARE HEVC encoder that can make a `width` × `height`
 * picture. Android's own software HEVC encoder, on every phone, stops at
 * 512×512, and Media3 then quietly makes the picture smaller to fit: on the
 * emulator on 2026-11-21 a 720p memory video came out 512×288. A phone without
 * a hardware one keeps today's H.264.
 */
private fun canMakeHevc(width: Int, height: Int): Boolean = try {
  MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
    if (!info.isEncoder || softwareOnly(info)) return@any false
    val type = info.supportedTypes.firstOrNull { it.equals(MimeTypes.VIDEO_H265, ignoreCase = true) } ?: return@any false
    val video = info.getCapabilitiesForType(type).videoCapabilities ?: return@any false
    video.isSizeSupported(width, height) || video.isSizeSupported(height, width)
  }
} catch (_: Exception) {
  false
}

/** The video's width and height as shown (rotation applied); null if unknown. */
private fun shownSize(context: Context, uri: String): Pair<Int, Int>? {
  val r = MediaMetadataRetriever()
  return try {
    r.setDataSource(context, Uri.parse(uri))
    val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
    val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
    val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    when {
      w <= 0 || h <= 0 -> null
      rotation == 90 || rotation == 270 -> h to w
      else -> w to h
    }
  } catch (_: Exception) {
    null
  } finally {
    try { r.release() } catch (_: Exception) {}
  }
}

/** The size Presentation.createForShortSide makes: the short side at
 *  `shortEdge`, the shape kept (16:9 when the video's size is unknown). */
private fun shrunkSize(shown: Pair<Int, Int>?, shortEdge: Int): Pair<Int, Int> {
  val (w, h) = shown ?: (16 to 9)
  val long = ((maxOf(w, h).toLong() * shortEdge + minOf(w, h) - 1) / minOf(w, h)).toInt()
  val even = long + (long and 1)
  return if (w >= h) even to shortEdge else shortEdge to even
}

/**
 * Shrinks a memory video the way the website does in the browser
 * (src/lib/videoTranscode.ts): one MP4 (HEVC on a phone with a hardware HEVC
 * encoder that can make the full size, else H.264; AAC sound), its short side at most
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
      // HEVC when asked and the phone's hardware can make it at full size,
      // else H.264 as before.
      val hevc = options.hevcBitrate > 0 &&
        shrunkSize(shownSize(context, input), options.shortEdge).let { (w, h) -> canMakeHevc(w, h) }
      val encoders = DefaultEncoderFactory.Builder(context)
        .setRequestedVideoEncoderSettings(
          VideoEncoderSettings.Builder().setBitrate(if (hevc) options.hevcBitrate else options.videoBitrate).build())
        .build()

      val progress = ProgressHolder()
      lateinit var poll: Runnable
      val transformer = Transformer.Builder(context)
        .setVideoMimeType(if (hevc) MimeTypes.VIDEO_H265 else MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoders)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            main.removeCallbacks(poll)
            running = null
            pending = null
            val shortSide = minOf(exportResult.width, exportResult.height)
            Log.i("MegyVideoShrink", "${if (hevc) "hevc" else "h264"} ${exportResult.width}x${exportResult.height} " +
              "by ${exportResult.videoEncoderName} (${exportResult.videoMimeType}), ${out.length()} bytes")
            // HEVC that still came out smaller than asked: the caller makes it
            // again in H.264 rather than keep a small, soft picture.
            if (hevc && shortSide > 0 && shortSide < options.shortEdge * 9 / 10) {
              if (out.exists()) out.delete()
              promise.reject(CodedException("ERR_HEVC_SMALL",
                "HEVC came out ${exportResult.width}x${exportResult.height}, not ${options.shortEdge}p", null))
              return
            }
            promise.resolve(mapOf(
              "uri" to Uri.fromFile(out).toString(),
              "size" to out.length().toDouble(),
              "codec" to (if (hevc) "hevc" else "h264"),
            ))
          }

          override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            main.removeCallbacks(poll)
            running = null
            pending = null
            Log.w("MegyVideoShrink", "shrink failed: ${exportException.errorCodeName}: ${exportException.message}", exportException)
            if (out.exists()) out.delete()
            // The error's name leads the message: the caller tries another HDR
            // way after a frame-processing or HDR failure (index.ts).
            promise.reject(CodedException("ERR_SHRINK", "${exportException.errorCodeName}: ${exportException.message ?: "Could not shrink the video"}", exportException))
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
      // HDR video (10-bit: Samsung's HDR10+, Pixel's 10-bit HDR, an iPhone's
      // Dolby Vision) is tone-mapped to a normal video. Without this Media3
      // keeps HDR, which an 8-bit H.264 file can't hold: the shrink failed,
      // the phone kept the original, and a 40-second clip went up at 71 MB,
      // over the server's 50 MB (MP-2026-9M5572U, reproduced 2026-11-22 on
      // the emulator). Tone-mapping with OpenGL needs Android 10 or later.
      // The caller may ask for another way (MediaCodec's tone-mapping, or
      // reading HDR as normal video) when this one fails on a phone.
      val hdrMode = when {
        options.hdrMode >= 0 -> options.hdrMode
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL
        else -> Composition.HDR_MODE_KEEP_HDR
      }
      val composition = Composition.Builder(EditedMediaItemSequence.Builder(item).build())
        .setHdrMode(hdrMode)
        .build()
      try {
        transformer.start(composition, out.absolutePath)
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
