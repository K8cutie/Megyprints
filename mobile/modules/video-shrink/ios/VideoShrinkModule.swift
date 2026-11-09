import AVFoundation
import ExpoModulesCore
import Photos

/** What shrink is asked for (the website's QUALITY_TARGETS, videoTranscode.ts). */
struct ShrinkOptions: Record {
  @Field var shortEdge: Int = 720
  @Field var videoBitrate: Int = 2_200_000
  @Field var frameRate: Double = 30
}

/**
 * The iPhone half of modules/video-shrink (the Android half is
 * android/.../VideoShrinkModule.kt; same name, calls and event).
 *
 * Shrinks a memory video the way the website does in the browser
 * (src/lib/videoTranscode.ts): one H.264 + AAC MP4 (AUDIO_BITRATE 128 kbps),
 * its short side at most 720 (Standard) or 1080 (HD) pixels, at most
 * `frameRate` (30) frames a second, at the tier's bitrate. Apple's own
 * AVFoundation does it on the phone's video hardware: a reader through a
 * video composition (the picture turned upright and scaled, frames dropped
 * to the rate) into a writer. Progress goes out as "onShrinkProgress"
 * events, at most twice a second. One video at a time; cancel stops it and
 * rejects its promise, as on Android.
 */
public class VideoShrinkModule: Module {
  private var reader: AVAssetReader?
  private var writer: AVAssetWriter?
  private var pending: Promise?
  private let work = DispatchQueue(label: "megy.videoshrink")

  public func definition() -> ModuleDefinition {
    Name("MegyVideoShrink")
    Events("onShrinkProgress")

    /** The video's length, size as shown, and whether it has sound. */
    AsyncFunction("probe") { (uri: String) async -> [String: Any] in
      guard let asset = try? await VideoShrink.asset(uri),
            let track = try? await asset.loadTracks(withMediaType: .video).first
      else { return ["width": 0, "height": 0, "durationMs": -1.0, "hasAudio": false] }
      let shown = (try? await VideoShrink.shownSize(track)) ?? .zero
      let duration = (try? await asset.load(.duration)).map { CMTimeGetSeconds($0) * 1000 } ?? -1
      let audio = (try? await asset.loadTracks(withMediaType: .audio)) ?? []
      return [
        "width": Int(shown.width.rounded()),
        "height": Int(shown.height.rounded()),
        "durationMs": duration.isFinite ? duration : -1.0,
        "hasAudio": !audio.isEmpty,
      ]
    }

    /** Shrinks `input` into a new MP4 at `output` (a file path). One at a time. */
    AsyncFunction("shrink") { (input: String, output: String, options: ShrinkOptions, promise: Promise) in
      if self.pending != nil {
        promise.reject("ERR_BUSY", "A video is already being shrunk")
        return
      }
      self.pending = promise
      Task {
        do {
          let result = try await self.run(input: input, output: output, options: options)
          DispatchQueue.main.async { self.settle { $0.resolve(result) } }
        } catch {
          try? FileManager.default.removeItem(atPath: output)
          let why = error.localizedDescription
          DispatchQueue.main.async { self.settle { $0.reject("ERR_SHRINK", why) } }
        }
      }
    }.runOnQueue(.main)

    /** Stops the video being shrunk (its promise is rejected). */
    AsyncFunction("cancel") { () -> Bool in
      guard self.pending != nil else { return false }
      self.reader?.cancelReading()
      self.writer?.cancelWriting()
      self.settle { $0.reject("ERR_CANCELLED", "Stopped") }
      return true
    }.runOnQueue(.main)
  }

  /** Answers the promise once (a cancel may have answered it already). */
  private func settle(_ answer: (Promise) -> Void) {
    guard let p = pending else { return }
    pending = nil
    reader = nil
    writer = nil
    answer(p)
  }

  private func run(input: String, output: String, options: ShrinkOptions) async throws -> [String: Any] {
    let asset = try await VideoShrink.asset(input)
    guard let video = try await asset.loadTracks(withMediaType: .video).first else {
      throw VideoShrinkError.noVideo
    }
    let audio = try await asset.loadTracks(withMediaType: .audio).first
    let duration = try await asset.load(.duration)
    let natural = try await video.load(.naturalSize)
    let turn = try await video.load(.preferredTransform)
    let nominal = try await video.load(.nominalFrameRate)
    let sourceRate = Double(nominal)

    // As shown (turned upright), then scaled so its short side is at most shortEdge; even sides.
    let shown = natural.applying(turn)
    let sw = abs(shown.width), sh = abs(shown.height)
    let scale = min(1.0, Double(options.shortEdge) / Double(max(1, min(sw, sh))))
    let ow = max(2, Int((Double(sw) * scale / 2).rounded()) * 2)
    let oh = max(2, Int((Double(sh) * scale / 2).rounded()) * 2)
    let rate = sourceRate > 0 ? min(options.frameRate, sourceRate) : options.frameRate

    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: ow, height: oh)
    composition.frameDuration = CMTime(value: 1000, timescale: CMTimeScale((rate * 1000).rounded()))
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
    let sx = CGFloat(ow) / sw, sy = CGFloat(oh) / sh
    layer.setTransform(turn.concatenating(CGAffineTransform(scaleX: sx, y: sy)), at: .zero)
    instruction.layerInstructions = [layer]
    composition.instructions = [instruction]

    let reader = try AVAssetReader(asset: asset)
    let videoOut = AVAssetReaderVideoCompositionOutput(
      videoTracks: [video],
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
    )
    videoOut.videoComposition = composition
    videoOut.alwaysCopiesSampleData = false
    reader.add(videoOut)

    let url = URL(fileURLWithPath: output)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let videoIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: ow,
      AVVideoHeightKey: oh,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: options.videoBitrate,
        AVVideoExpectedSourceFrameRateKey: Int(rate.rounded()),
        AVVideoMaxKeyFrameIntervalKey: Int((rate * 2).rounded()),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    videoIn.expectsMediaDataInRealTime = false
    writer.add(videoIn)

    var audioOut: AVAssetReaderTrackOutput?
    var audioIn: AVAssetWriterInput?
    if let audio = audio {
      let (sampleRate, channels) = try await VideoShrink.audioFormat(audio)
      let out = AVAssetReaderTrackOutput(track: audio, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
      ])
      out.alwaysCopiesSampleData = false
      reader.add(out)
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVEncoderBitRateKey: 128_000,
      ])
      input.expectsMediaDataInRealTime = false
      writer.add(input)
      audioOut = out
      audioIn = input
    }

    await MainActor.run {
      self.reader = reader
      self.writer = writer
    }
    guard reader.startReading() else { throw reader.error ?? VideoShrinkError.failed }
    guard writer.startWriting() else { throw writer.error ?? VideoShrinkError.failed }
    writer.startSession(atSourceTime: .zero)

    let total = max(0.001, CMTimeGetSeconds(duration))
    var lastSent = Date.distantPast
    let progress: (CMTime) -> Void = { [weak self] t in
      let now = Date()
      guard now.timeIntervalSince(lastSent) >= 0.5 else { return }
      lastSent = now
      let p = max(0, min(1, CMTimeGetSeconds(t) / total))
      self?.sendEvent("onShrinkProgress", ["output": output, "progress": p])
    }

    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
      let group = DispatchGroup()
      group.enter()
      pump(videoOut, into: videoIn, on: work, onTime: progress) { group.leave() }
      if let audioOut = audioOut, let audioIn = audioIn {
        group.enter()
        pump(audioOut, into: audioIn, on: DispatchQueue(label: "megy.videoshrink.audio"), onTime: nil) { group.leave() }
      }
      group.notify(queue: work) {
        if reader.status == .cancelled || writer.status == .cancelled {
          done.resume(throwing: VideoShrinkError.cancelled)
          return
        }
        if reader.status == .failed {
          writer.cancelWriting()
          done.resume(throwing: reader.error ?? VideoShrinkError.failed)
          return
        }
        writer.finishWriting {
          if writer.status == .completed {
            done.resume()
          } else {
            done.resume(throwing: writer.error ?? VideoShrinkError.failed)
          }
        }
      }
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: output)[.size] as? NSNumber)?.doubleValue ?? 0
    sendEvent("onShrinkProgress", ["output": output, "progress": 1.0])
    return ["uri": url.absoluteString, "size": size]
  }

  /** Copies samples from `output` into `input` as fast as the writer takes them. */
  private func pump(
    _ output: AVAssetReaderOutput, into input: AVAssetWriterInput, on queue: DispatchQueue,
    onTime: ((CMTime) -> Void)?, finished: @escaping () -> Void
  ) {
    var ended = false
    input.requestMediaDataWhenReady(on: queue) {
      while input.isReadyForMoreMediaData && !ended {
        if let sample = output.copyNextSampleBuffer() {
          onTime?(CMSampleBufferGetPresentationTimeStamp(sample))
          if !input.append(sample) {
            ended = true
            input.markAsFinished()
            finished()
            return
          }
        } else {
          ended = true
          input.markAsFinished()
          finished()
          return
        }
      }
    }
  }
}

enum VideoShrinkError: Error, LocalizedError {
  case noVideo, notFound(String), failed, cancelled

  var errorDescription: String? {
    switch self {
    case .noVideo: return "There is no video in this file"
    case .notFound(let a): return "Could not open the video \(a)"
    case .failed: return "Could not shrink the video"
    case .cancelled: return "Stopped"
    }
  }
}

enum VideoShrink {
  /** The video at a file:// address, or a Photos video by ph:// (iCloud downloaded when needed). */
  static func asset(_ uri: String) async throws -> AVAsset {
    if uri.hasPrefix("ph://") {
      let id = String(uri.dropFirst("ph://".count))
      guard let ph = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
        throw VideoShrinkError.notFound(uri)
      }
      let options = PHVideoRequestOptions()
      options.isNetworkAccessAllowed = true
      options.version = .current
      options.deliveryMode = .highQualityFormat
      return try await withCheckedThrowingContinuation { done in
        PHImageManager.default().requestAVAsset(forVideo: ph, options: options) { asset, _, _ in
          if let asset = asset { done.resume(returning: asset) } else { done.resume(throwing: VideoShrinkError.notFound(uri)) }
        }
      }
    }
    let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
    return AVURLAsset(url: url)
  }

  /** The track's size as shown (turned upright). */
  static func shownSize(_ track: AVAssetTrack) async throws -> CGSize {
    let natural = try await track.load(.naturalSize)
    let turn = try await track.load(.preferredTransform)
    let s = natural.applying(turn)
    return CGSize(width: abs(s.width), height: abs(s.height))
  }

  /** The source's sample rate and channels (at most 2: more are mixed down). */
  static func audioFormat(_ track: AVAssetTrack) async throws -> (Double, Int) {
    let descriptions = try await track.load(.formatDescriptions)
    if let d = descriptions.first, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(d)?.pointee {
      let rate = asbd.mSampleRate > 0 ? asbd.mSampleRate : 44_100
      return (rate, max(1, min(2, Int(asbd.mChannelsPerFrame))))
    }
    return (44_100, 2)
  }
}
