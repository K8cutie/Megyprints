package expo.modules.megyphotofiles

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.Promise
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
private const val PICK_PHOTOS_CODE = 4211

/** The phone's camera folder, where Android's Files picker opens
 *  (owner, 2026-11-02: "make the phone's photo folder the default"). A phone
 *  without it: the picker opens where it would anyway. */
private const val CAMERA_FOLDER_ID = "primary:DCIM/Camera"

class PhotoFilesModule : Module() {
  private val resolver
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).contentResolver

  /** The "Choose from Files" picker that is open, waiting for its answer. */
  private var pickPromise: Promise? = null

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

    AsyncFunction("inspect") Coroutine { uris: List<String> ->
      withContext(Dispatchers.IO) { uris.map { inspectOne(it) } }
    }

    AsyncFunction("drawableCopy") Coroutine { source: String, target: String, maxSide: Int ->
      withContext(Dispatchers.IO) { drawableCopy(source, target, maxSide) }
    }

    // "Choose from Files": Android's document picker for photos, many at
    // once, opened in the camera folder. The answer: { canceled, assets },
    // each asset its address, name, type, bytes and last change (the shape
    // expo-document-picker gives, which the app used before).
    AsyncFunction("pickPhotos") { promise: Promise ->
      if (pickPromise != null) {
        promise.reject("ERR_PICKING", "The Files picker is already open", null)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "image/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", CAMERA_FOLDER_ID))
        }
      }
      pickPromise = promise
      try {
        appContext.throwingActivity.startActivityForResult(intent, PICK_PHOTOS_CODE)
      } catch (e: Exception) {
        pickPromise = null
        promise.reject("ERR_PICKER", e.message ?: "Could not open Files", e)
      }
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != PICK_PHOTOS_CODE) return@OnActivityResult
      val promise = pickPromise ?: return@OnActivityResult
      pickPromise = null
      if (resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(mapOf("canceled" to true, "assets" to emptyList<Map<String, Any?>>()))
        return@OnActivityResult
      }
      try {
        val clip = data.clipData
        val uris = if (clip != null) (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri } else listOfNotNull(data.data)
        promise.resolve(mapOf("canceled" to uris.isEmpty(), "assets" to uris.map { pickedFile(it) }))
      } catch (e: Exception) {
        promise.reject("ERR_PICKED", e.message ?: "Could not read the picked photos", e)
      }
    }
  }

  /** A picked file's address, name, type, bytes and last change, from the
   *  picker's own answer (no file opened). */
  private fun pickedFile(uri: Uri): Map<String, Any?> {
    var name: String? = null
    var size: Long? = null
    var modified: Long? = null
    resolver.query(uri, null, null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (n >= 0 && !c.isNull(n)) name = c.getString(n)
        val s = c.getColumnIndex(OpenableColumns.SIZE)
        if (s >= 0 && !c.isNull(s)) size = c.getLong(s)
        val m = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
        if (m >= 0 && !c.isNull(m)) modified = c.getLong(m)
      }
    }
    return mapOf(
      "uri" to uri.toString(),
      "name" to (name ?: uri.lastPathSegment ?: ""),
      "mimeType" to resolver.getType(uri),
      "size" to size,
      "lastModified" to modified,
    )
  }

  /**
   * Is the photo still on the phone, and what is it? Reads only the file's
   * header (no pixels): its size as shown (EXIF rotation applied), its file
   * size in bytes (the website knows a photo again by its name and bytes), the
   * colour space it was saved in (Android 8+), so the album knows which
   * photos must be turned into sRGB before a print page is drawn. Never
   * takes or changes any access: a photo the app can no longer open is
   * simply `readable: false` (deleted, or its access was taken back).
   */
  private fun inspectOne(address: String): Map<String, Any?> {
    val uri = Uri.parse(address)
    var readable = false
    var width = 0
    var height = 0
    var colorSpace: String? = null
    var needsSrgb = false
    try {
      resolver.openInputStream(uri)?.use { stream ->
        readable = true
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(stream, null, bounds)
        width = bounds.outWidth.coerceAtLeast(0)
        height = bounds.outHeight.coerceAtLeast(0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val cs = bounds.outColorSpace
          colorSpace = cs?.name
          needsSrgb = cs != null && cs != ColorSpace.get(ColorSpace.Named.SRGB)
        }
      }
    } catch (_: Exception) {
    }
    var rotation = 0
    var bytes = 0L
    if (readable) {
      try {
        resolver.openInputStream(uri)?.use { rotation = ExifInterface(it).rotationDegrees }
      } catch (_: Exception) {
      }
      try {
        resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
          val i = c.getColumnIndex(OpenableColumns.SIZE)
          if (c.moveToFirst() && i >= 0 && !c.isNull(i)) bytes = c.getLong(i)
        }
      } catch (_: Exception) {
      }
      if (bytes <= 0L) {
        try {
          resolver.openAssetFileDescriptor(uri, "r")?.use { bytes = it.length.coerceAtLeast(0L) }
        } catch (_: Exception) {
        }
      }
    }
    val turned = rotation % 180 == 90
    return mapOf(
      "uri" to address,
      "readable" to readable,
      "size" to bytes.toDouble(),
      "width" to if (turned) height else width,
      "height" to if (turned) width else height,
      "colorSpace" to colorSpace,
      "needsSrgb" to needsSrgb
    )
  }

  /**
   * A small copy of the photo for drawing on screen: at most `maxSide` px on
   * its longest side, turned upright (EXIF), in sRGB, written as a JPEG to
   * the file:// address `target` (the app's cache: it can be made again at
   * any time, and the album keeps only the photo's own address). Android 9+
   * decodes with ImageDecoder, which applies the EXIF rotation, opens HEIC
   * and converts colours; older phones get BitmapFactory with the rotation
   * applied by hand and no colour conversion (`converted: false`).
   */
  private fun drawableCopy(source: String, target: String, maxSide: Int): Map<String, Any?> {
    val uri = Uri.parse(source)
    val path = Uri.parse(target).path ?: throw IllegalArgumentException("not a file address: $target")
    var width = 0
    var height = 0
    var saved: ColorSpace? = null
    val bitmap: Bitmap
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val srgb = ColorSpace.get(ColorSpace.Named.SRGB)
      bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
        width = info.size.width
        height = info.size.height
        saved = info.colorSpace
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        decoder.setTargetColorSpace(srgb)
        val longest = maxOf(width, height)
        if (maxSide in 1 until longest) {
          val s = maxSide.toDouble() / longest
          decoder.setTargetSize(maxOf(1, Math.round(width * s).toInt()), maxOf(1, Math.round(height * s).toInt()))
        }
      }
    } else {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
      var sample = 1
      val longest = maxOf(bounds.outWidth, bounds.outHeight)
      while (maxSide > 0 && longest / (sample * 2) >= maxSide) sample *= 2
      val decoded = resolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
      } ?: throw IllegalStateException("could not open $source")
      val rotation = try {
        resolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0
      } catch (_: Exception) {
        0
      }
      bitmap = if (rotation != 0) {
        val m = android.graphics.Matrix().apply { postRotate(rotation.toFloat()) }
        Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true).also { if (it !== decoded) decoded.recycle() }
      } else decoded
      val turned = rotation % 180 == 90
      width = if (turned) bounds.outHeight else bounds.outWidth
      height = if (turned) bounds.outWidth else bounds.outHeight
    }
    val outWidth = bitmap.width
    val outHeight = bitmap.height
    try {
      File(path).parentFile?.mkdirs()
      FileOutputStream(File(path)).use { out ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)) throw IllegalStateException("could not write $target")
      }
    } finally {
      bitmap.recycle()
    }
    val was = saved
    return mapOf(
      "width" to width,
      "height" to height,
      "outWidth" to outWidth,
      "outHeight" to outHeight,
      "colorSpace" to was?.name,
      "converted" to (was != null && was != ColorSpace.get(ColorSpace.Named.SRGB))
    )
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
