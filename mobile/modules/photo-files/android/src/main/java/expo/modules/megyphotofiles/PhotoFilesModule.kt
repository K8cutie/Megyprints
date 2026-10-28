package expo.modules.megyphotofiles

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Photos picked with "Choose from Files" (Android's document picker).
 *
 * The picker's content:// addresses can be read only while the app is open,
 * unless the app keeps them ("persistable" access). The album keeps photos
 * where they are on the phone (never copies them), so `describe` keeps access
 * to each picked photo and reads, without loading the picture itself:
 *   - its width and height as shown (EXIF rotation applied),
 *   - when it was taken (EXIF DateTimeOriginal, or DateTimeDigitized, as the
 *     website's EXIF reader does) and its time zone (OffsetTimeOriginal).
 * `release` gives access back when a photo leaves the album (Android keeps at
 * most 512 such addresses per app and drops the oldest past that).
 *
 * `srgbCopy` is the colour step a print page needs: Skia on Android draws a
 * photo's numbers as they are (its drawing surface has no colour space), so a
 * photo saved with a Display P3 or Adobe RGB profile would print duller than
 * the website prints it (Chrome turns every photo into sRGB as it draws it).
 * It decodes the photo with Android's ImageDecoder, turned into sRGB
 * (setTargetColorSpace), and writes that as a PNG file the page renderer can
 * read. Proven on the golden page photo-display-p3 (src/dev/goldenRun.ts).
 */
class PhotoFilesModule : Module() {
  private val resolver
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).contentResolver

  override fun definition() = ModuleDefinition {
    Name("MegyPhotoFiles")

    AsyncFunction("describe") Coroutine { uris: List<String> ->
      withContext(Dispatchers.IO) { uris.map { describeOne(it) } }
    }

    AsyncFunction("release") Coroutine { uris: List<String> ->
      withContext(Dispatchers.IO) { uris.count { releaseOne(it) } }
    }

    Function("keptCount") {
      resolver.persistedUriPermissions.size
    }

    AsyncFunction("srgbCopy") Coroutine { source: String, target: String ->
      withContext(Dispatchers.IO) { srgbCopy(source, target) }
    }
  }

  private fun describeOne(address: String): Map<String, Any?> {
    val uri = Uri.parse(address)
    val kept = try {
      resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      true
    } catch (_: Exception) {
      false
    }

    var readable = false
    var width = 0
    var height = 0
    try {
      resolver.openInputStream(uri)?.use { stream ->
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(stream, null, bounds)
        width = bounds.outWidth.coerceAtLeast(0)
        height = bounds.outHeight.coerceAtLeast(0)
        readable = true
      }
    } catch (_: Exception) {
    }

    var rotation = 0
    var taken: String? = null
    var offset: String? = null
    if (readable) {
      try {
        resolver.openInputStream(uri)?.use { stream ->
          val exif = ExifInterface(stream)
          rotation = exif.rotationDegrees
          taken = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
            ?: exif.getAttribute(ExifInterface.TAG_DATETIME_DIGITIZED)
          offset = exif.getAttribute(ExifInterface.TAG_OFFSET_TIME_ORIGINAL)
            ?: exif.getAttribute(ExifInterface.TAG_OFFSET_TIME_DIGITIZED)
        }
      } catch (_: Exception) {
      }
    }

    val turned = rotation % 180 == 90
    return mapOf(
      "uri" to address,
      "kept" to kept,
      "readable" to readable,
      "width" to if (turned) height else width,
      "height" to if (turned) width else height,
      "rotation" to rotation,
      "takenAt" to taken,
      "takenOffset" to offset
    )
  }

  private fun releaseOne(address: String): Boolean =
    try {
      resolver.releasePersistableUriPermission(Uri.parse(address), Intent.FLAG_GRANT_READ_URI_PERMISSION)
      true
    } catch (_: Exception) {
      false
    }

  /**
   * The photo at `source` (content:// or file://) as sRGB, written as a PNG
   * to the file:// address `target`. Says which colour space the photo was
   * saved in and whether it had to be converted. Android 9+ (ImageDecoder);
   * older phones get `supported: false` and nothing is written.
   */
  private fun srgbCopy(source: String, target: String): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return mapOf("supported" to false, "colorSpace" to null, "converted" to false)
    }
    val srgb = ColorSpace.get(ColorSpace.Named.SRGB)
    var saved: ColorSpace? = null
    val bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, Uri.parse(source))) { decoder, info, _ ->
      saved = info.colorSpace
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      decoder.setTargetColorSpace(srgb)
    }
    try {
      val path = Uri.parse(target).path ?: throw IllegalArgumentException("not a file address: $target")
      FileOutputStream(File(path)).use { out ->
        if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) throw IllegalStateException("could not write $target")
      }
    } finally {
      bitmap.recycle()
    }
    val was = saved
    return mapOf(
      "supported" to true,
      "colorSpace" to was?.name,
      "converted" to (was != null && was != srgb)
    )
  }
}
