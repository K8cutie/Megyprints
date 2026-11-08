import CoreGraphics
import ExpoModulesCore
import Foundation
import ImageIO
import Photos
import UniformTypeIdentifiers

/**
 * The iPhone half of modules/photo-files (the Android half is
 * android/.../PhotoFilesModule.kt; same names, same answers).
 *
 * On iPhone the album's photos are Photos library photos, by the address the
 * photo grid gives them (expo-media-library): "ph://<localIdentifier>". A
 * photo whose full picture is only in iCloud is downloaded when its pixels
 * are needed (drawableCopy, srgbCopy), never by `inspect`, which runs for
 * every photo each time an album opens and reads only what Photos already
 * knows. file:// addresses (a file in the app, a Files pick) are read as
 * files.
 *
 * Colours: Skia draws a photo's numbers as they are, and almost every iPhone
 * photo is Display P3, so every copy made here is drawn into an sRGB
 * surface first (ColorSync, relative colorimetric: the matrix conversion
 * Chrome uses), the same job Android's ImageDecoder setTargetColorSpace does.
 * Pictures come out upright (the EXIF turn applied), as on Android.
 *
 * Nothing here keeps or gives back access: Photos access is the one
 * permission the person gave (describe says kept: true for ph://), and iOS
 * has no per-file access count (release does nothing, keptCount is 0).
 * "Choose from Files" (pickPhotos) is Android's: not here.
 */
public class PhotoFilesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MegyPhotoFiles")

    AsyncFunction("describe") { (uris: [String]) async -> [[String: Any?]] in
      var out: [[String: Any?]] = []
      for uri in uris { out.append(await PhotoFiles.describe(uri)) }
      return out
    }

    AsyncFunction("release") { (_: [String]) -> Int in
      0
    }

    Function("keptCount") { () -> Int in
      0
    }

    AsyncFunction("srgbCopy") { (source: String, target: String) async throws -> [String: Any?] in
      try await PhotoFiles.srgbCopy(source: source, target: target)
    }

    AsyncFunction("inspect") { (uris: [String]) -> [[String: Any?]] in
      uris.map { PhotoFiles.inspect($0) }
    }

    AsyncFunction("drawableCopy") { (source: String, target: String, maxSide: Int) async throws -> [String: Any?] in
      try await PhotoFiles.drawableCopy(source: source, target: target, maxSide: maxSide)
    }
  }
}

enum PhotoFilesError: Error, LocalizedError {
  case notFound(String)
  case unreadable(String)
  case notFileAddress(String)
  case notWritten(String)

  var errorDescription: String? {
    switch self {
    case .notFound(let a): return "This photo is no longer on the phone: \(a)"
    case .unreadable(let a): return "Could not open the photo \(a)"
    case .notFileAddress(let a): return "Not a file address: \(a)"
    case .notWritten(let a): return "Could not write \(a)"
    }
  }
}

/** What a photo's header says (ImageIO, from its bytes). */
struct PhotoHeader {
  /** As stored (before the EXIF turn). */
  var width = 0
  var height = 0
  /** EXIF orientation, 1–8. */
  var orientation = 1
  /** The ICC profile's name ("Display P3", "sRGB IEC61966-2.1"): what Android calls the colour space. */
  var profile: String?
  var takenAt: String?
  var takenOffset: String?

  /** Degrees the picture is turned to show upright, as Android's
   *  ExifInterface.getRotationDegrees counts them (mirrored ones included). */
  var rotation: Int {
    switch orientation {
    case 6, 7: return 90
    case 3, 4: return 180
    case 8, 5: return 270
    default: return 0
    }
  }

  /** Width and height as shown (turned photos swapped). */
  var shown: (width: Int, height: Int) {
    rotation % 180 == 90 ? (width: height, height: width) : (width: width, height: height)
  }
}

enum PhotoFiles {
  static let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

  // MARK: where a photo is

  /** The Photos library photo behind "ph://<localIdentifier>". */
  static func asset(_ address: String) -> PHAsset? {
    guard address.hasPrefix("ph://") else { return nil }
    let id = String(address.dropFirst("ph://".count))
    return PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject
  }

  static func fileURL(_ address: String) -> URL? {
    if let u = URL(string: address), u.isFileURL { return u }
    if address.hasPrefix("/") { return URL(fileURLWithPath: address) }
    return nil
  }

  /** The photo's bytes: from Photos (edits applied; downloaded from iCloud
   *  when the phone has only a small copy), or from the file. */
  static func bytes(_ address: String) async throws -> Data {
    if address.hasPrefix("ph://") {
      guard let a = asset(address) else { throw PhotoFilesError.notFound(address) }
      let options = PHImageRequestOptions()
      options.isNetworkAccessAllowed = true
      options.deliveryMode = .highQualityFormat
      options.version = .current
      return try await withCheckedThrowingContinuation { (done: CheckedContinuation<Data, Error>) in
        let once = Once()
        PHImageManager.default().requestImageDataAndOrientation(for: a, options: options) { data, _, _, info in
          guard once.first() else { return }
          if let data = data {
            done.resume(returning: data)
          } else if let e = info?[PHImageErrorKey] as? Error {
            done.resume(throwing: e)
          } else {
            done.resume(throwing: PhotoFilesError.unreadable(address))
          }
        }
      }
    }
    guard let url = fileURL(address) else { throw PhotoFilesError.unreadable(address) }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      return try Data(contentsOf: url)
    } catch {
      throw PhotoFilesError.unreadable(address)
    }
  }

  // MARK: reading a header

  static func source(_ data: Data, _ address: String) throws -> CGImageSource {
    guard let s = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(s) > 0 else {
      throw PhotoFilesError.unreadable(address)
    }
    return s
  }

  static func header(_ s: CGImageSource) -> PhotoHeader {
    var h = PhotoHeader()
    let p = CGImageSourceCopyPropertiesAtIndex(s, 0, nil) as? [CFString: Any] ?? [:]
    h.width = (p[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue ?? 0
    h.height = (p[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue ?? 0
    h.orientation = (p[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    h.profile = p[kCGImagePropertyProfileName] as? String
    let exif = p[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
    // As the website's EXIF reader (and Android's half) does: taken, else digitized.
    h.takenAt = (exif[kCGImagePropertyExifDateTimeOriginal] as? String) ?? (exif[kCGImagePropertyExifDateTimeDigitized] as? String)
    h.takenOffset = (exif[kCGImagePropertyExifOffsetTimeOriginal] as? String) ?? (exif[kCGImagePropertyExifOffsetTimeDigitized] as? String)
    return h
  }

  /** Is this sRGB already (nothing to change)? A grey picture counts: its
   *  greys stay greys in sRGB. */
  static func isSrgb(_ cs: CGColorSpace?) -> Bool {
    guard let cs = cs else { return true }
    if cs.model != .rgb { return true }
    let name = cs.name as String?
    return name == (CGColorSpace.sRGB as String) || name == (CGColorSpace.extendedSRGB as String)
  }

  /** Android's names for the colour spaces (ColorSpace.Named), when ImageIO
   *  has no profile name. */
  static func spaceName(_ h: PhotoHeader, _ img: CGImage?) -> String? {
    if let p = h.profile, !p.isEmpty { return p }
    guard let cf = img?.colorSpace?.name else { return nil }
    let name = cf as String
    if name == (CGColorSpace.sRGB as String) { return "sRGB IEC61966-2.1" }
    if name == (CGColorSpace.displayP3 as String) { return "Display P3" }
    if name == (CGColorSpace.adobeRGB1998 as String) { return "Adobe RGB (1998)" }
    return name
  }

  // MARK: the functions

  /** describe: what a picked photo is (Android: and keeps access to it). */
  static func describe(_ address: String) async -> [String: Any?] {
    var out: [String: Any?] = [
      "uri": address, "kept": address.hasPrefix("ph://"), "readable": false,
      "width": 0, "height": 0, "rotation": 0, "takenAt": nil, "takenOffset": nil,
    ]
    guard let data = try? await bytes(address), let s = try? source(data, address) else { return out }
    let h = header(s)
    out["readable"] = true
    out["width"] = h.shown.width
    out["height"] = h.shown.height
    out["rotation"] = h.rotation
    // Set only when known: assigning nil would take the key out (JS wants null).
    if let t = h.takenAt { out["takenAt"] = t }
    if let o = h.takenOffset { out["takenOffset"] = o }
    return out
  }

  /**
   * inspect: is the photo still on the phone, and its size as shown and in
   * bytes. A Photos photo: only what Photos knows (no pixels, no iCloud
   * download): its colour space is not known without the pixels, so it is
   * null here, like Android 7's answer; the print step turns EVERY photo
   * into sRGB anyway (print/phonePhotos.ts). A file: its header.
   */
  static func inspect(_ address: String) -> [String: Any?] {
    var out: [String: Any?] = [
      "uri": address, "readable": false, "size": 0.0, "width": 0, "height": 0,
      "colorSpace": nil, "needsSrgb": false,
    ]
    if address.hasPrefix("ph://") {
      guard let a = asset(address) else { return out }
      out["readable"] = true
      // Photos keeps the size as shown (a turned photo's sides already swapped).
      out["width"] = a.pixelWidth
      out["height"] = a.pixelHeight
      out["size"] = Double(fileSize(a))
      return out
    }
    guard let url = fileURL(address) else { return out }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let s = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(s) > 0 else { return out }
    let h = header(s)
    out["readable"] = true
    out["width"] = h.shown.width
    out["height"] = h.shown.height
    if let n = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber {
      out["size"] = n.doubleValue
    }
    if let p = h.profile {
      out["colorSpace"] = p
      out["needsSrgb"] = p != "sRGB IEC61966-2.1"
    }
    return out
  }

  /** The original's size in bytes, as Photos keeps it (0 = unknown). */
  static func fileSize(_ a: PHAsset) -> Int64 {
    let resources = PHAssetResource.assetResources(for: a)
    guard let r = resources.first(where: { $0.type == .photo || $0.type == .fullSizePhoto }) ?? resources.first else { return 0 }
    // Not in Photos' public interface; asked only if Photos answers to it.
    guard r.responds(to: NSSelectorFromString("fileSize")) else { return 0 }
    return (r.value(forKey: "fileSize") as? NSNumber)?.int64Value ?? 0
  }

  /** A picture of the photo, upright, at most `maxSide` px on its longest
   *  side (0: full size), as ImageIO decodes it. */
  static func upright(_ s: CGImageSource, _ h: PhotoHeader, maxSide: Int, _ address: String) throws -> CGImage {
    let longest = max(h.shown.width, h.shown.height)
    let side = (maxSide > 0 && (longest == 0 || maxSide < longest)) ? maxSide : max(longest, 1)
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: side,
    ]
    guard let img = CGImageSourceCreateThumbnailAtIndex(s, 0, options as CFDictionary) else {
      throw PhotoFilesError.unreadable(address)
    }
    return img
  }

  /** The picture drawn into an sRGB surface: its colours turned into sRGB. */
  static func inSrgb(_ img: CGImage, alpha: Bool, _ address: String) throws -> CGImage {
    let info = alpha ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue
    guard let ctx = CGContext(
      data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: 0,
      space: srgb, bitmapInfo: info
    ) else { throw PhotoFilesError.unreadable(address) }
    ctx.setRenderingIntent(.relativeColorimetric)
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
    guard let out = ctx.makeImage() else { throw PhotoFilesError.unreadable(address) }
    return out
  }

  static func write(_ img: CGImage, to target: String, type: UTType, quality: Double?) throws {
    guard let url = fileURL(target) else { throw PhotoFilesError.notFileAddress(target) }
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else {
      throw PhotoFilesError.notWritten(target)
    }
    var props: [CFString: Any] = [:]
    if let q = quality { props[kCGImageDestinationLossyCompressionQuality] = q }
    CGImageDestinationAddImage(dest, img, props as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw PhotoFilesError.notWritten(target) }
  }

  /** drawableCopy: a small upright sRGB JPEG (quality 90, as Android's) for pages on screen. */
  static func drawableCopy(source: String, target: String, maxSide: Int) async throws -> [String: Any?] {
    let data = try await bytes(source)
    let s = try self.source(data, source)
    let h = header(s)
    let picture = try upright(s, h, maxSide: maxSide, source)
    let copy = try inSrgb(picture, alpha: false, source)
    try write(copy, to: target, type: .jpeg, quality: 0.9)
    let shown = h.shown
    return [
      "width": shown.width > 0 ? shown.width : picture.width,
      "height": shown.height > 0 ? shown.height : picture.height,
      "outWidth": copy.width,
      "outHeight": copy.height,
      "colorSpace": spaceName(h, picture),
      "converted": !isSrgb(picture.colorSpace),
    ]
  }

  /** srgbCopy: the whole photo, upright, in sRGB, as a PNG (for a print page). */
  static func srgbCopy(source: String, target: String) async throws -> [String: Any?] {
    let data = try await bytes(source)
    let s = try self.source(data, source)
    let h = header(s)
    let picture = try upright(s, h, maxSide: 0, source)
    let hasAlpha: Bool = {
      switch picture.alphaInfo {
      case .none, .noneSkipLast, .noneSkipFirst: return false
      default: return true
      }
    }()
    let copy = try inSrgb(picture, alpha: hasAlpha, source)
    try write(copy, to: target, type: .png, quality: nil)
    return [
      "supported": true,
      "colorSpace": spaceName(h, picture),
      "converted": !isSrgb(picture.colorSpace),
    ]
  }
}

/** Lets a callback that Photos might call twice answer only once. */
final class Once: @unchecked Sendable {
  private var done = false
  private let lock = NSLock()

  func first() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if done { return false }
    done = true
    return true
  }
}
