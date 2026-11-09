# The iPhone half of modules/video-shrink (VideoShrinkModule.swift).
Pod::Spec.new do |s|
  s.name           = 'MegyVideoShrink'
  s.version        = '1.0.0'
  s.summary        = 'Megy Prints: shrinks a memory video on iPhone (H.264 + AAC MP4, AVFoundation)'
  s.description    = s.summary
  s.license        = { type: 'UNLICENSED' }
  s.author         = 'Megy Prints'
  s.homepage       = 'https://megyprints.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Photos', 'CoreMedia'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
