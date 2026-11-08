# The iPhone half of modules/order-keeper (OrderKeeperModule.swift).
Pod::Spec.new do |s|
  s.name           = 'MegyOrderKeeper'
  s.version        = '1.0.0'
  s.summary        = 'Megy Prints: keeps Place order going while the person uses other apps (iPhone)'
  s.description    = s.summary
  s.license        = { type: 'UNLICENSED' }
  s.author         = 'Megy Prints'
  s.homepage       = 'https://megyprints.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'BackgroundTasks', 'UIKit', 'UserNotifications'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
