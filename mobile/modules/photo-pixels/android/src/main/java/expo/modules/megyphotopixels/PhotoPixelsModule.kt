package expo.modules.megyphotopixels

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.math.floor
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.min

/**
 * Megy's photo check on the phone (see ../../../../../../index.ts): a small
 * copy of a photo, made the way the website's browser makes it, and Google
 * ML Kit's face finder on that copy.
 *
 * THE SMALL COPY. The website asks Chrome for each photo at CHECK_LONG_SIDE
 * (800 px) on its long side: createImageBitmap(..., resizeQuality 'medium').
 * Chrome decodes the whole photo, builds its "mipmaps" (the photo halved,
 * then halved again, each pixel the average of 2×2, or 1-2-1 weights where a
 * side is odd), and reads each small-copy pixel from the two nearest halvings
 * (bilinear in each, blended by how far between them it is, with Skia's
 * "sharpen" bias of half a step). tools/photo-check checked this against
 * Chrome itself: the same pixels, ±1. This does the same steps, so the
 * shared blur and repeat rules get the website's numbers:
 *   1. decode the whole photo (libjpeg-turbo, as in Chrome), colours in sRGB;
 *   2. halve it as Skia does, as many times as needed;
 *   3. read each small-copy pixel from the two nearest halvings, blended;
 *   4. turn the small copy the way the EXIF says (exact quarter turns and
 *      flips; the website's browser turns before shrinking, which gives the
 *      same pixels when the halved sides are even, as phone photos' are).
 * One whole photo is decoded at a time (a 12 MP photo is 48 MB while it is
 * halved: what the website's browser holds too). A photo over
 * MAX_FULL_PIXELS is first decoded at half size by the JPEG decoder (close
 * to, not exactly, the website's copy).
 *
 * THE FACES. ML Kit (com.google.mlkit:face-detection, its model inside the
 * app: no download, no network) on the same small copy, straight from
 * memory: each face's box, its two eye points and each eye's chance of being
 * open, in the small copy's pixels. Runs on a background thread, never on
 * the app's shared module thread, so other phone calls (the photo grid) are
 * not held up while it looks. Its model takes about 80 MB while loaded, so
 * it is let go IDLE_CLOSE_MS after its last photo and loaded again (a
 * fraction of a second) when the next photo comes.
 *
 * `size(uri)`: the photo's size as shown, from its header only.
 * `pixels(uri, w, h)`: the small copy's RGBA bytes, row by row.
 * `faces(uri, w, h)`: the faces ML Kit finds on that small copy.
 */
class PhotoPixelsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** One whole photo in memory at a time. */
  private val decodeLock = Mutex()

  private var detector: FaceDetector? = null
  private val detectorLock = Mutex()
  /** Photos ML Kit is looking at right now (guarded by detectorLock). */
  private var detectorBusy = 0
  private var closeJob: Job? = null

  override fun definition() = ModuleDefinition {
    Name("MegyPhotoPixels")

    OnDestroy {
      try {
        detector?.close()
      } catch (_: Exception) {
      }
      detector = null
    }

    AsyncFunction("size") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val parsed = Uri.parse(uri)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val turned = orientationOf(parsed) in TURNED
        val w = bounds.outWidth.coerceAtLeast(0)
        val h = bounds.outHeight.coerceAtLeast(0)
        mapOf("width" to if (turned) h else w, "height" to if (turned) w else h)
      }
    }

    AsyncFunction("pixels") Coroutine { uri: String, width: Int, height: Int ->
      withContext(Dispatchers.IO) { rgbaOf(smallCopy(uri, width, height)) }
    }

    AsyncFunction("faces") Coroutine { uri: String, width: Int, height: Int ->
      withContext(Dispatchers.IO) {
        val px = smallCopy(uri, width, height)
        val finder = takeFaceFinder()
        try {
          val bmp = Bitmap.createBitmap(px, width, height, Bitmap.Config.ARGB_8888)
          try {
            Tasks.await(finder.process(InputImage.fromBitmap(bmp, 0))).map { f -> faceReport(f) }
          } finally {
            bmp.recycle()
          }
        } finally {
          giveBackFaceFinder()
        }
      }
    }
  }

  /** One face, in the small copy's pixels, as index.ts NativeFace. */
  private fun faceReport(f: Face): Map<String, Any?> {
    val box = f.boundingBox
    val eye = { type: Int -> f.getLandmark(type)?.position?.let { mapOf("x" to it.x.toDouble(), "y" to it.y.toDouble()) } }
    return mapOf(
      "x" to box.left.toDouble(),
      "y" to box.top.toDouble(),
      "width" to box.width().toDouble(),
      "height" to box.height().toDouble(),
      "leftEye" to eye(FaceLandmark.LEFT_EYE),
      "rightEye" to eye(FaceLandmark.RIGHT_EYE),
      "leftEyeOpen" to f.leftEyeOpenProbability?.toDouble(),
      "rightEyeOpen" to f.rightEyeOpenProbability?.toDouble(),
    )
  }

  /** ML Kit, loaded when needed: settings for still photos (see src/lib/faceModel.ts). */
  private suspend fun takeFaceFinder(): FaceDetector = detectorLock.withLock {
    val finder = detector ?: FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
        .setMinFaceSize(MIN_FACE_SIZE)
        .build()
    ).also { detector = it }
    detectorBusy++
    closeJob?.cancel()
    closeJob = null
    finder
  }

  /** Done with ML Kit for one photo: let its model go once nothing has asked for IDLE_CLOSE_MS. */
  private suspend fun giveBackFaceFinder() = detectorLock.withLock {
    detectorBusy--
    if (detectorBusy > 0) return@withLock
    closeJob?.cancel()
    closeJob = appContext.backgroundCoroutineScope.launch {
      delay(IDLE_CLOSE_MS)
      detectorLock.withLock {
        if (detectorBusy == 0) {
          try {
            detector?.close()
          } catch (_: Exception) {
          }
          detector = null
        }
      }
    }
  }

  /** The small copy, `width` × `height` as shown: ARGB ints, row by row. */
  private suspend fun smallCopy(address: String, width: Int, height: Int): IntArray {
    if (width <= 0 || height <= 0) throw IllegalArgumentException("No size asked for")
    val uri = Uri.parse(address)
    val resolver = context.contentResolver
    val orientation = orientationOf(uri)
    // The size in the file's own orientation (before the EXIF turn).
    val turned = orientation in TURNED
    val fw = if (turned) height else width
    val fh = if (turned) width else height

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalStateException("The photo could not be read")
    var sample = 1
    while (bounds.outWidth.toLong() / sample * (bounds.outHeight.toLong() / sample) > MAX_FULL_PIXELS) sample *= 2

    val raw = decodeLock.withLock {
      val opts = BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
        if (Build.VERSION.SDK_INT >= 26) inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
      }
      val whole = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        ?: throw IllegalStateException("The photo could not be decoded")
      try {
        shrinkLikeChrome(whole, fw, fh)
      } finally {
        whole.recycle()
      }
    }
    return turn(raw, fw, fh, orientation)
  }

  /** A halving: `w` × `h` ARGB ints. */
  private class Level(val px: IntArray, val w: Int, val h: Int)

  /**
   * Chrome's createImageBitmap resize, 'medium' quality (Skia: bilinear,
   * linear between mipmap levels, the level from the smaller scale less
   * half a step). Returns `dw` × `dh` ARGB ints.
   */
  private fun shrinkLikeChrome(whole: Bitmap, dw: Int, dh: Int): IntArray {
    val bw = whole.width
    val bh = whole.height
    val scale = min(dw.toDouble() / bw, dh.toDouble() / bh)
    val level = if (scale >= 1.0 || scale <= 0.0) 0.0 else max(-log2(scale) - 0.5, 0.0)
    val lo = floor(level).toInt()
    val t = level - lo
    if (lo == 0 && bw.toLong() * bh > MAX_BASE_PIXELS) throw IllegalArgumentException("The size asked for does not fit the photo")

    // The two levels to read from: `lo` and, when between, `lo + 1`.
    val base: Level? = if (lo == 0) Level(IntArray(bw * bh).also { whole.getPixels(it, 0, bw, 0, 0, bw, bh) }, bw, bh) else null
    var current: Level? = base
    var upper: Level? = base
    var lower: Level? = null
    var n = 0
    while (n < lo + (if (t > 0) 1 else 0)) {
      val next = if (n == 0) halveBitmap(whole) else halve(current!!)
      n++
      current = next
      if (n == lo) upper = next
      if (n == lo + 1) lower = next
    }
    return sample(upper!!, if (t > 0) lower else null, t, dw, dh)
  }

  /** Skia's first halving, straight from the decoded photo, a few rows at a time. */
  private fun halveBitmap(src: Bitmap): Level {
    val w = src.width
    val h = src.height
    val nw = max(1, w shr 1)
    val nh = max(1, h shr 1)
    val oddY = h and 1 == 1 && h > 1
    val rows = IntArray(w * 3)
    val out = IntArray(nw * nh)
    for (y in 0 until nh) {
      val sy = 2 * y
      val n = min(if (oddY) 3 else 2, h - sy)
      src.getPixels(rows, 0, w, 0, sy, w, n)
      val r1 = if (n > 1) w else 0
      val r2 = if (n > 2) 2 * w else r1
      halveRow(rows, 0, r1, r2, w, oddY, out, y * nw, nw)
    }
    return Level(out, nw, nh)
  }

  /** Skia's halving of an earlier halving. */
  private fun halve(src: Level): Level {
    val w = src.w
    val h = src.h
    val nw = max(1, w shr 1)
    val nh = max(1, h shr 1)
    val oddY = h and 1 == 1 && h > 1
    val out = IntArray(nw * nh)
    for (y in 0 until nh) {
      val sy = 2 * y
      val r0 = sy * w
      val r1 = min(sy + 1, h - 1) * w
      val r2 = min(sy + 2, h - 1) * w
      halveRow(src.px, r0, r1, r2, w, oddY, out, y * nw, nw)
    }
    return Level(out, nw, nh)
  }

  /**
   * One row of a halving (SkMipmap's downsample procs): 2×2 averages; a side
   * that is odd takes three pixels weighted 1-2-1. Each channel on its own,
   * the sum shifted down (rounded down), as Skia does.
   */
  private fun halveRow(src: IntArray, r0: Int, r1: Int, r2: Int, w: Int, oddY: Boolean, out: IntArray, at: Int, nw: Int) {
    val oddX = w and 1 == 1 && w > 1
    // 2×2 sums 4 (>> 2); 3×2 and 2×3 sum 8 (>> 3); 3×3 sums 16 (>> 4).
    val shift = 2 + (if (oddX) 1 else 0) + (if (oddY) 1 else 0)
    for (x in 0 until nw) {
      val sx = 2 * x
      val x1 = min(sx + 1, w - 1)
      val x2 = min(sx + 2, w - 1)
      var pixel = 0
      var ch = 0
      while (ch < 32) {
        var v = rowSum(src, r0, sx, x1, x2, oddX, ch) + rowSum(src, r1, sx, x1, x2, oddX, ch) * (if (oddY) 2 else 1)
        if (oddY) v += rowSum(src, r2, sx, x1, x2, oddX, ch)
        pixel = pixel or ((v shr shift) shl ch)
        ch += 8
      }
      out[at + x] = pixel
    }
  }

  /** One channel (at bit `ch`) of a row's two pixels, or three weighted 1-2-1. */
  private fun rowSum(src: IntArray, r: Int, sx: Int, x1: Int, x2: Int, oddX: Boolean, ch: Int): Int {
    val a = (src[r + sx] ushr ch) and 0xff
    val b = (src[r + x1] ushr ch) and 0xff
    return if (oddX) a + 2 * b + ((src[r + x2] ushr ch) and 0xff) else a + b
  }

  /**
   * Each small-copy pixel, bilinear from `upper` (and `lower`, blended by
   * `t`), at the pixel's centre in each level's own scale, edges clamped,
   * rounded once at the end.
   */
  private fun sample(upper: Level, lower: Level?, t: Double, dw: Int, dh: Int): IntArray {
    val out = IntArray(dw * dh)
    val a = Sampler(upper, dw, dh)
    val b = lower?.let { Sampler(it, dw, dh) }
    val va = DoubleArray(4)
    val vb = DoubleArray(4)
    for (y in 0 until dh) {
      for (x in 0 until dw) {
        a.at(x, y, va)
        if (b != null) b.at(x, y, vb)
        var pixel = 0
        for (c in 0 until 4) {
          val v = if (b != null) va[c] * (1 - t) + vb[c] * t else va[c]
          val q = floor(v + 0.5).toInt().coerceIn(0, 255)
          pixel = pixel or (q shl (8 * c))
        }
        out[y * dw + x] = pixel
      }
    }
    return out
  }

  /** Bilinear reads from one level onto a `dw` × `dh` grid. */
  private class Sampler(val level: Level, dw: Int, dh: Int) {
    private val x0 = IntArray(dw)
    private val x1 = IntArray(dw)
    private val tx = DoubleArray(dw)
    private val y0 = IntArray(dh)
    private val y1 = IntArray(dh)
    private val ty = DoubleArray(dh)

    init {
      val sx = level.w.toDouble() / dw
      val sy = level.h.toDouble() / dh
      for (x in 0 until dw) {
        val f = ((x + 0.5) * sx - 0.5).coerceIn(0.0, (level.w - 1).toDouble())
        x0[x] = floor(f).toInt(); x1[x] = min(level.w - 1, x0[x] + 1); tx[x] = f - x0[x]
      }
      for (y in 0 until dh) {
        val f = ((y + 0.5) * sy - 0.5).coerceIn(0.0, (level.h - 1).toDouble())
        y0[y] = floor(f).toInt(); y1[y] = min(level.h - 1, y0[y] + 1); ty[y] = f - y0[y]
      }
    }

    /** The four channels (by byte: 0 = blue … 3 = alpha) at small-copy pixel x, y. */
    fun at(x: Int, y: Int, into: DoubleArray) {
      val w = level.w
      val p = level.px
      val a = p[y0[y] * w + x0[x]]
      val b = p[y0[y] * w + x1[x]]
      val c = p[y1[y] * w + x0[x]]
      val d = p[y1[y] * w + x1[x]]
      val fx = tx[x]
      val fy = ty[y]
      for (k in 0 until 4) {
        val s = 8 * k
        val top = ((a ushr s) and 0xff) * (1 - fx) + ((b ushr s) and 0xff) * fx
        val bottom = ((c ushr s) and 0xff) * (1 - fx) + ((d ushr s) and 0xff) * fx
        into[k] = top * (1 - fy) + bottom * fy
      }
    }
  }

  /** The small copy turned the way the EXIF says: `fw` × `fh` in the file's frame → as shown. */
  private fun turn(px: IntArray, fw: Int, fh: Int, orientation: Int): IntArray {
    if (orientation !in KNOWN || orientation == ExifInterface.ORIENTATION_NORMAL) return px
    val turned = orientation in TURNED
    val w = if (turned) fh else fw
    val h = if (turned) fw else fh
    val out = IntArray(w * h)
    for (y in 0 until h) {
      for (x in 0 until w) {
        val (rx, ry) = when (orientation) {
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> Pair(fw - 1 - x, y)
          ExifInterface.ORIENTATION_ROTATE_180 -> Pair(fw - 1 - x, fh - 1 - y)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> Pair(x, fh - 1 - y)
          ExifInterface.ORIENTATION_TRANSPOSE -> Pair(y, x)
          ExifInterface.ORIENTATION_ROTATE_90 -> Pair(y, fh - 1 - x)
          ExifInterface.ORIENTATION_TRANSVERSE -> Pair(fw - 1 - y, fh - 1 - x)
          else -> Pair(fw - 1 - y, x) // ORIENTATION_ROTATE_270
        }
        out[y * w + x] = px[ry * fw + rx]
      }
    }
    return out
  }

  private fun orientationOf(uri: Uri): Int =
    try {
      context.contentResolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
    } catch (_: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }

  /** RGBA bytes, row by row (what a canvas's getImageData gives). */
  private fun rgbaOf(argb: IntArray): ByteArray {
    val out = ByteArray(argb.size * 4)
    var p = 0
    for (c in argb) {
      out[p] = (c shr 16).toByte()
      out[p + 1] = (c shr 8).toByte()
      out[p + 2] = c.toByte()
      out[p + 3] = (c ushr 24).toByte()
      p += 4
    }
    return out
  }

  private companion object {
    /** Bigger photos are first halved by the JPEG decoder (memory). */
    const val MAX_FULL_PIXELS = 24_000_000L
    /** Reading straight from the whole photo is only for photos near the small copy's size. */
    const val MAX_BASE_PIXELS = 16_000_000L
    /** ML Kit's model is let go after this long without a photo. */
    const val IDLE_CLOSE_MS = 20_000L
    /** The smallest face ML Kit looks for, as a share of the picture's width. */
    const val MIN_FACE_SIZE = 0.05f
    val TURNED = setOf(
      ExifInterface.ORIENTATION_TRANSPOSE,
      ExifInterface.ORIENTATION_ROTATE_90,
      ExifInterface.ORIENTATION_TRANSVERSE,
      ExifInterface.ORIENTATION_ROTATE_270
    )
    val KNOWN = (1..8).toSet()
  }
}
