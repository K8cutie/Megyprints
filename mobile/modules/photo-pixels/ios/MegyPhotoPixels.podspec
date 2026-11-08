# The iPhone half of modules/photo-pixels (PhotoPixelsModule.swift).
Pod::Spec.new do |s|
  s.name           = 'MegyPhotoPixels'
  s.version        = '1.0.0'
  s.summary        = "Megy Prints: the photo check's small copy and faces on iPhone (Apple Vision)"
  s.description    = s.summary
  s.license        = { type: 'UNLICENSED' }
  s.author         = 'Megy Prints'
  s.homepage       = 'https://megyprints.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Photos are opened by the photo module's PhotoFiles (one place for ph:// and iCloud).
  s.dependency 'MegyPhotoFiles'
  s.frameworks = 'Vision', 'ImageIO', 'CoreGraphics', 'Photos'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_OPTIMIZATION_LEVEL' => '-O',
  }
end
