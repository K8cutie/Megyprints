import CoreGraphics
import ExpoModulesCore
import Foundation
import ImageIO
import MegyPhotoFiles
import Photos
import Vision

/**
 * The iPhone half of modules/photo-pixels (the Android half is
 * android/.../PhotoPixelsModule.kt; same name, same calls).
 *
 * THE SMALL COPY: the very steps of the Android half, which copy Chrome's
 * createImageBitmap 'medium' resize (tools/photo-check: the same pixels as
 * Chrome, ±1): decode the whole photo in sRGB, halve it as Skia does (2×2
 * averages, 1-2-1 where a side is odd, each channel summed and shifted
 * down), read each pixel bilinear from the two nearest halvings blended by
 * the level's fraction (Skia's half-step "sharpen" bias), round once, then
 * turn it the way the EXIF says. Same arithmetic, so the same numbers, apart
 * from the JPEG decoder itself (Apple's, not libjpeg-turbo: a level or two
 * on some pixels).
 *
 * THE FACES: Apple's own face finder (Vision, VNDetectFaceLandmarksRequest),
 * not ML Kit: ML Kit for iPhone has no build for the Apple-chip simulators
 * the app is checked on, and Vision is on the phone already (nothing sent to
 * anyone, nothing added to the app). Vision gives no "eye open" chance, but
 * it gives each eye's outline, so each eye's aspect ratio (the website's own
 * measure, eyeAspectRatio: lid gap at a third and two thirds of the eye over
 * its width) is reported as leftEyeEar / rightEyeEar, and the app turns it
 * into ML Kit's 0–1 scale (phoneFaces.ts openChanceFromEar, the exact
 * inverse of earFromOpenChance), so the same rules read it. The eyes are
 * named by where they are in the picture (left = picture's left), as the
 * app reads ML Kit's. Faces narrower than 5 % of the copy are left out, as
 * ML Kit's MIN_FACE_SIZE does.
 *
 * Photos are opened by modules/photo-files (PhotoFiles.bytes): Photos
 * photos by ph:// (iCloud downloaded when needed), files by file://.
 */
public class PhotoPixelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MegyPhotoPixels")

    AsyncFunction("size") { (uri: String) async throws -> [String: Int] in
      try await PhotoPixels.size(uri)
    }

    AsyncFunction("pixels") { (uri: String, width: Int, height: Int) async throws -> Data in
      try await PhotoPixels.pixels(uri, width: width, height: height)
    }

    AsyncFunction("faces") { (uri: String, width: Int, height: Int) async throws -> [[String: Any?]] in
      try await PhotoPixels.faces(uri, width: width, height: height)
    }
  }
}

enum PhotoPixelsError: Error, LocalizedError {
  case noSize
  case unreadable(String)
  case tooBig

  var errorDescription: String? {
    switch self {
    case .noSize: return "No size asked for"
    case .unreadable(let a): return "The photo could not be read: \(a)"
    case .tooBig: return "The size asked for does not fit the photo"
    }
  }
}

/** One halving (or the whole photo): RGBA bytes, row by row. */
struct Level {
  var px: [UInt8]
  let w: Int
  let h: Int
}

enum PhotoPixels {
  /** Bigger photos are first decoded at half size (memory), as on Android. */
  static let maxFullPixels = 24_000_000
  /** Reading straight from the whole photo is only for photos near the small copy's size. */
  static let maxBasePixels = 16_000_000
  /** The smallest face looked for, as a share of the copy's width (ML Kit's MIN_FACE_SIZE). */
  static let minFaceShare = 0.05

  static let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

  static func turned(_ orientation: Int) -> Bool { [5, 6, 7, 8].contains(orientation) }

  // MARK: size

  static func size(_ uri: String) async throws -> [String: Int] {
    if let a = PhotoFiles.asset(uri) {
      // Photos keeps the size as shown: no download needed.
      return ["width": a.pixelWidth, "height": a.pixelHeight]
    }
    let data = try await PhotoFiles.bytes(uri)
    let h = PhotoFiles.header(try PhotoFiles.source(data, uri))
    return ["width": h.shown.width, "height": h.shown.height]
  }

  // MARK: the small copy

  static func pixels(_ uri: String, width: Int, height: Int) async throws -> Data {
    guard width > 0, height > 0 else { throw PhotoPixelsError.noSize }
    let data = try await PhotoFiles.bytes(uri)
    let src = try PhotoFiles.source(data, uri)
    let h = PhotoFiles.header(src)
    // The size in the file's own orientation (before the EXIF turn).
    let fw = turned(h.orientation) ? height : width
    let fh = turned(h.orientation) ? width : height
    guard h.width > 0, h.height > 0 else { throw PhotoPixelsError.unreadable(uri) }
    var sample = 1
    while (h.width / sample) * (h.height / sample) > maxFullPixels { sample *= 2 }
    let whole = try decodeWhole(src, h, sample: sample, uri)
    let small = try shrinkLikeChrome(whole, dw: fw, dh: fh)
    return Data(turn(small, fw: fw, fh: fh, orientation: h.orientation))
  }

  /** The whole photo (or 1/sample of it), in the file's own orientation, sRGB RGBA. */
  static func decodeWhole(_ src: CGImageSource, _ h: PhotoHeader, sample: Int, _ uri: String) throws -> Level {
    let image: CGImage?
    if sample == 1 {
      image = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    } else {
      // No EXIF turn here: the small copy is turned at the end, as on Android.
      let opts: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: false,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: max(h.width, h.height) / sample,
      ]
      image = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }
    guard let img = image else { throw PhotoPixelsError.unreadable(uri) }
    return try rgba(img, width: img.width, height: img.height, uri)
  }

  /** The picture drawn into a `width` × `height` sRGB RGBA surface (colours turned into sRGB). */
  static func rgba(_ img: CGImage, width: Int, height: Int, _ uri: String) throws -> Level {
    var px = [UInt8](repeating: 0, count: width * height * 4)
    let ok: Bool = px.withUnsafeMutableBytes { buf in
      guard let ctx = CGContext(
        data: buf.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: srgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else { return false }
      ctx.setRenderingIntent(.relativeColorimetric)
      ctx.interpolationQuality = .high
      ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard ok else { throw PhotoPixelsError.unreadable(uri) }
    return Level(px: px, w: width, h: height)
  }

  /** Chrome's createImageBitmap resize, 'medium' quality: `dw` × `dh` RGBA. */
  static func shrinkLikeChrome(_ whole: Level, dw: Int, dh: Int) throws -> [UInt8] {
    let scale = min(Double(dw) / Double(whole.w), Double(dh) / Double(whole.h))
    let level = (scale >= 1.0 || scale <= 0.0) ? 0.0 : max(-log2(scale) - 0.5, 0.0)
    let lo = Int(floor(level))
    let t = level - Double(lo)
    if lo == 0 && whole.w * whole.h > maxBasePixels { throw PhotoPixelsError.tooBig }
    var current = whole
    var upper: Level? = lo == 0 ? whole : nil
    var lower: Level? = nil
    var n = 0
    while n < lo + (t > 0 ? 1 : 0) {
      current = halve(current)
      n += 1
      if n == lo { upper = current }
      if n == lo + 1 { lower = current }
    }
    return sample(upper!, t > 0 ? lower : nil, t: t, dw: dw, dh: dh)
  }

  /**
   * Skia's halving (SkMipmap's downsample procs): 2×2 averages; a side that
   * is odd takes three pixels weighted 1-2-1. Each channel on its own, the
   * sum shifted down (rounded down).
   */
  static func halve(_ src: Level) -> Level {
    let w = src.w, h = src.h
    let nw = max(1, w >> 1), nh = max(1, h >> 1)
    let oddY = h & 1 == 1 && h > 1
    let oddX = w & 1 == 1 && w > 1
    // 2×2 sums 4 (>> 2); 3×2 and 2×3 sum 8 (>> 3); 3×3 sums 16 (>> 4).
    let shift = 2 + (oddX ? 1 : 0) + (oddY ? 1 : 0)
    var out = [UInt8](repeating: 0, count: nw * nh * 4)
    src.px.withUnsafeBufferPointer { s in
      out.withUnsafeMutableBufferPointer { o in
        for y in 0..<nh {
          let sy = 2 * y
          let r0 = sy * w * 4
          let r1 = min(sy + 1, h - 1) * w * 4
          let r2 = min(sy + 2, h - 1) * w * 4
          for x in 0..<nw {
            let sx = 2 * x
            let c0 = sx * 4
            let c1 = min(sx + 1, w - 1) * 4
            let c2 = min(sx + 2, w - 1) * 4
            let at = (y * nw + x) * 4
            for ch in 0..<4 {
              @inline(__always) func row(_ r: Int) -> Int {
                let a = Int(s[r + c0 + ch]), b = Int(s[r + c1 + ch])
                return oddX ? a + 2 * b + Int(s[r + c2 + ch]) : a + b
              }
              var v = row(r0) + row(r1) * (oddY ? 2 : 1)
              if oddY { v += row(r2) }
              o[at + ch] = UInt8(truncatingIfNeeded: v >> shift)
            }
          }
        }
      }
    }
    return Level(px: out, w: nw, h: nh)
  }

  /** Bilinear reads from one level onto a `dw` × `dh` grid. */
  struct Sampler {
    let level: Level
    var x0: [Int], x1: [Int], tx: [Double]
    var y0: [Int], y1: [Int], ty: [Double]

    init(_ level: Level, dw: Int, dh: Int) {
      self.level = level
      x0 = [Int](repeating: 0, count: dw); x1 = x0; tx = [Double](repeating: 0, count: dw)
      y0 = [Int](repeating: 0, count: dh); y1 = y0; ty = [Double](repeating: 0, count: dh)
      let sx = Double(level.w) / Double(dw)
      let sy = Double(level.h) / Double(dh)
      for x in 0..<dw {
        let f = min(max((Double(x) + 0.5) * sx - 0.5, 0.0), Double(level.w - 1))
        x0[x] = Int(floor(f)); x1[x] = min(level.w - 1, x0[x] + 1); tx[x] = f - Double(x0[x])
      }
      for y in 0..<dh {
        let f = min(max((Double(y) + 0.5) * sy - 0.5, 0.0), Double(level.h - 1))
        y0[y] = Int(floor(f)); y1[y] = min(level.h - 1, y0[y] + 1); ty[y] = f - Double(y0[y])
      }
    }

    /** One channel at small-copy pixel x, y. */
    @inline(__always) func at(_ p: UnsafeBufferPointer<UInt8>, _ x: Int, _ y: Int, _ ch: Int) -> Double {
      let w = level.w
      let a = Double(p[(y0[y] * w + x0[x]) * 4 + ch])
      let b = Double(p[(y0[y] * w + x1[x]) * 4 + ch])
      let c = Double(p[(y1[y] * w + x0[x]) * 4 + ch])
      let d = Double(p[(y1[y] * w + x1[x]) * 4 + ch])
      let fx = tx[x], fy = ty[y]
      let top = a * (1 - fx) + b * fx
      let bottom = c * (1 - fx) + d * fx
      return top * (1 - fy) + bottom * fy
    }
  }

  /** Each small-copy pixel from `upper` (and `lower`, blended by `t`), rounded once. */
  static func sample(_ upper: Level, _ lower: Level?, t: Double, dw: Int, dh: Int) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: dw * dh * 4)
    let a = Sampler(upper, dw: dw, dh: dh)
    let b = lower.map { Sampler($0, dw: dw, dh: dh) }
    upper.px.withUnsafeBufferPointer { pa in
      (lower?.px ?? []).withUnsafeBufferPointer { pb in
        out.withUnsafeMutableBufferPointer { o in
          for y in 0..<dh {
            for x in 0..<dw {
              let at = (y * dw + x) * 4
              for c in 0..<4 {
                let va = a.at(pa, x, y, c)
                let v = b.map { va * (1 - t) + $0.at(pb, x, y, c) * t } ?? va
                o[at + c] = UInt8(min(255, max(0, Int(floor(v + 0.5)))))
              }
            }
          }
        }
      }
    }
    return out
  }

  /** The small copy turned the way the EXIF says: `fw` × `fh` in the file's frame → as shown. */
  static func turn(_ px: [UInt8], fw: Int, fh: Int, orientation: Int) -> [UInt8] {
    guard (2...8).contains(orientation) else { return px }
    let w = turned(orientation) ? fh : fw
    let h = turned(orientation) ? fw : fh
    var out = [UInt8](repeating: 0, count: w * h * 4)
    for y in 0..<h {
      for x in 0..<w {
        let (rx, ry): (Int, Int)
        switch orientation {
        case 2: (rx, ry) = (fw - 1 - x, y)          // flip horizontal
        case 3: (rx, ry) = (fw - 1 - x, fh - 1 - y) // rotate 180
        case 4: (rx, ry) = (x, fh - 1 - y)          // flip vertical
        case 5: (rx, ry) = (y, x)                   // transpose
        case 6: (rx, ry) = (y, fh - 1 - x)          // rotate 90
        case 7: (rx, ry) = (fw - 1 - y, fh - 1 - x) // transverse
        default: (rx, ry) = (fw - 1 - y, x)         // rotate 270
        }
        let to = (y * w + x) * 4, from = (ry * fw + rx) * 4
        out[to] = px[from]; out[to + 1] = px[from + 1]; out[to + 2] = px[from + 2]; out[to + 3] = px[from + 3]
      }
    }
    return out
  }

  // MARK: the faces

  static func faces(_ uri: String, width: Int, height: Int) async throws -> [[String: Any?]] {
    guard width > 0, height > 0 else { throw PhotoPixelsError.noSize }
    let data = try await PhotoFiles.bytes(uri)
    let src = try PhotoFiles.source(data, uri)
    // A quick copy, upright (EXIF turn applied), then drawn at exactly the size asked for.
    let opts: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: max(width, height),
    ]
    guard let quick = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else {
      throw PhotoPixelsError.unreadable(uri)
    }
    let copy = try rgba(quick, width: width, height: height, uri)
    guard let picture = image(copy) else { throw PhotoPixelsError.unreadable(uri) }

    let request = VNDetectFaceLandmarksRequest()
    let handler = VNImageRequestHandler(cgImage: picture, orientation: .up, options: [:])
    try handler.perform([request])
    let found = request.results ?? []
    let W = Double(width), H = Double(height)
    return found.compactMap { face -> [String: Any?]? in
      let bb = face.boundingBox // 0–1, origin at the bottom left
      let box = (x: bb.minX * W, y: (1 - bb.maxY) * H, width: bb.width * W, height: bb.height * H)
      if box.width < minFaceShare * W { return nil }
      // Each eye's outline in the copy's pixels (origin top left).
      let outline = { (region: VNFaceLandmarkRegion2D?) -> [CGPoint]? in
        guard let r = region, r.pointCount >= 4 else { return nil }
        return r.pointsInImage(imageSize: CGSize(width: W, height: H)).map { CGPoint(x: $0.x, y: H - $0.y) }
      }
      var eyes = [outline(face.landmarks?.leftEye), outline(face.landmarks?.rightEye)].compactMap { $0 }
      // Named by where they are in the picture, as the app reads ML Kit's.
      eyes.sort { centre($0).x < centre($1).x }
      let pictureLeft = eyes.count == 2 ? eyes[0] : nil
      let pictureRight = eyes.count == 2 ? eyes[1] : nil
      return [
        "x": box.x, "y": box.y, "width": box.width, "height": box.height,
        "leftEye": pictureLeft.map { p -> [String: Double] in let c = centre(p); return ["x": c.x, "y": c.y] },
        "rightEye": pictureRight.map { p -> [String: Double] in let c = centre(p); return ["x": c.x, "y": c.y] },
        "leftEyeOpen": nil,
        "rightEyeOpen": nil,
        "leftEyeEar": pictureLeft.flatMap { eyeAspectRatio($0) },
        "rightEyeEar": pictureRight.flatMap { eyeAspectRatio($0) },
      ]
    }
  }

  static func image(_ l: Level) -> CGImage? {
    let data = Data(l.px) as CFData
    guard let provider = CGDataProvider(data: data) else { return nil }
    return CGImage(
      width: l.w, height: l.h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: l.w * 4, space: srgb,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider,
      decode: nil, shouldInterpolate: false, intent: .defaultIntent
    )
  }

  static func centre(_ pts: [CGPoint]) -> (x: Double, y: Double) {
    let n = Double(pts.count)
    return (pts.reduce(0) { $0 + Double($1.x) } / n, pts.reduce(0) { $0 + Double($1.y) } / n)
  }

  /**
   * The eye's aspect ratio as the website measures it (photoCheck.ts
   * eyeAspectRatio on face-api's six points): the lid gap at a third and at
   * two thirds of the eye, over the eye's width. From Vision's outline: the
   * two points furthest apart are the corners; the upper and lower lids are
   * the outline's two sides of the line between them, each read at a third
   * and two thirds of the way along it.
   */
  static func eyeAspectRatio(_ pts: [CGPoint]) -> Double? {
    var a = 0, b = 1, best = -1.0
    for i in 0..<pts.count {
      for j in (i + 1)..<pts.count {
        let d = hypot(Double(pts[i].x - pts[j].x), Double(pts[i].y - pts[j].y))
        if d > best { best = d; a = i; b = j }
      }
    }
    guard best > 0 else { return nil }
    let ux = Double(pts[b].x - pts[a].x) / best, uy = Double(pts[b].y - pts[a].y) / best
    // Each point as (along the corner line, off it).
    let placed = pts.map { p -> (s: Double, d: Double) in
      let vx = Double(p.x - pts[a].x), vy = Double(p.y - pts[a].y)
      return (vx * ux + vy * uy, vx * -uy + vy * ux)
    }
    let corners: [(s: Double, d: Double)] = [(0, 0), (best, 0)]
    let upper = (placed.filter { $0.d > 0 } + corners).sorted { $0.s < $1.s }
    let lower = (placed.filter { $0.d < 0 } + corners).sorted { $0.s < $1.s }
    func at(_ side: [(s: Double, d: Double)], _ s: Double) -> Double {
      for k in 1..<side.count where side[k].s >= s {
        let p = side[k - 1], q = side[k]
        let f = q.s > p.s ? (s - p.s) / (q.s - p.s) : 0
        return p.d + (q.d - p.d) * f
      }
      return side.last?.d ?? 0
    }
    let gap1 = at(upper, best / 3) - at(lower, best / 3)
    let gap2 = at(upper, 2 * best / 3) - at(lower, 2 * best / 3)
    return max(0, (gap1 + gap2) / (2 * best))
  }
}
