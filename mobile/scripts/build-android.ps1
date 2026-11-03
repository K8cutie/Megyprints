<#
  Builds the 2.0 app's Android APK on this PC (no paid services).

  WHY A SECOND, SHORT FOLDER
  React Native's C++ parts are built with CMake and ninja. Ninja cannot make
  a folder whose full path is longer than about 250 characters, and the build
  makes folders whose path holds the project's location TWICE. From a worktree
  (C:\megy-prints-flashdrive\V1\Megyprints-Clean\.claude\worktrees\<name>)
  that is about 265 characters, so Gradle stops with
      ninja: error: mkdir(CMakeFiles/rnscreens.dir/C_/megy-prints-...): No such file or directory
  A subst drive or a junction does not help: Node (autolinking) turns them back
  into the long path, and Gradle then stops with "different roots".

  So this script copies the app (mobile\, without android\) and the shared
  website code (src\) into a short folder, C:\megy2 by default, and builds
  there. The copy is kept, so the next run only copies what changed and Gradle
  reuses its work. The APK is copied back to mobile\dist\android\.

  DISK SPACE
  The copy is about 0.7 GB and a build adds 1-2 GB more. The script will not
  start with less than -NeedFreeGB free, and stops Gradle if free space falls
  under -MinFreeGB while it builds, so a build never fills the disk for the
  other work on this PC. To give the space back afterwards, delete
  C:\megy2\mobile\android and C:\megy2\mobile\node_modules.

  USAGE (PowerShell)
    mobile\scripts\build-android.ps1                    # debug APK: its code comes from Metro (npx expo start)
    mobile\scripts\build-android.ps1 -Variant release   # APK with the code inside, runs without Metro
                                                        # (signed with the debug key: for testing only)
    mobile\scripts\build-android.ps1 -Play              # THE REAL APP for Google Play (see PLAY BUILD below)
    -Abis arm64-v8a,x86_64   phones (arm64) and the PC emulator (x86_64); add armeabi-v7a for old 32-bit phones
    -BuildDir C:\megy2       the short folder
    -Fresh                   delete the short folder's android\ and node_modules\ first
    -GoldenPages             a TEST build that carries the golden pages and covers (about 10 MB) for the debug
                             screen "Golden pages" (Shared code check): the page renderer drawn by
                             the phone's own Skia (scripts\golden-phone-assets.cjs, src\dev\goldenRun.ts).
                             Never for a build that goes to customers.

  PLAY BUILD (-Play)
  The real app, to replace 1.x on Google Play (app.config.js): named
  "Megy Prints", com.megyprints.app, version 2.0.0 (version code 100, above
  1.x's), Google sign-in's ways back, and signed with the Play upload key, the
  key 1.x is signed with (plugins\withPlaySigning.js). The key's settings are
  read from the 1.x app's android-native\keystore.properties (not in git) or
  the file -KeystoreProperties names. Makes two files in mobile\dist\android\:
    megyprints-2.0-play.aab   upload this to Play Console (Internal testing first)
    megyprints-2.0-play.apk   the same app as an APK, signed with the upload key
  A phone with 1.x from Play cannot install the .apk over it (Play signs the
  copies it hands out with its own key): test through Play Internal testing.
  The dev build (com.megyprints.app.dev) and the Play build use one short
  folder in turn: switching between them starts android\ afresh.

  Needs: JDK 21 (Eclipse Adoptium), Android SDK at C:\Android\sdk, mobile\node_modules
  (npm ci in mobile\), and mobile\.env.local (see mobile\.env.example).
#>
param(
  [ValidateSet('debug', 'release')] [string] $Variant = 'debug',
  [string[]] $Abis = @('arm64-v8a', 'x86_64'),
  [string] $BuildDir = 'C:\megy2',
  [string] $JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot',
  [string] $AndroidHome = 'C:\Android\sdk',
  [double] $NeedFreeGB = 2.5,
  [double] $MinFreeGB = 1.0,
  [switch] $Fresh,
  [switch] $GoldenPages,
  [switch] $Play,
  [string] $KeystoreProperties = ''
)
$ErrorActionPreference = 'Stop'

$Mobile = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Mobile
$DestMobile = Join-Path $BuildDir 'mobile'
$DestSrc = Join-Path $BuildDir 'src'
$Drive = (Split-Path -Qualifier $BuildDir).TrimEnd(':')
function Get-FreeGB { [math]::Round((Get-PSDrive $Drive).Free / 1GB, 2) }

if (-not (Test-Path (Join-Path $Mobile 'node_modules'))) { throw "No mobile\node_modules: run npm ci in $Mobile first." }
if (-not (Test-Path $JavaHome)) { throw "JDK not found at $JavaHome" }

# The Play build (app.config.js reads MEGY_PLAY; plugins\withPlaySigning.js
# reads MEGY_KEYSTORE_PROPERTIES when Gradle builds).
if ($Play) {
  if ($GoldenPages) { throw '-GoldenPages is for test builds only, never with -Play.' }
  $Variant = 'release'
  if (-not (Test-Path (Join-Path $Mobile '.env.local'))) { throw 'No mobile\.env.local: a Play build without the server address cannot sign in (see mobile\.env.example).' }
  if (-not $KeystoreProperties) { $KeystoreProperties = Join-Path $Repo 'android-native\keystore.properties' }
  if (-not (Test-Path $KeystoreProperties)) {
    throw "No upload key settings at $KeystoreProperties. The Play build is signed with the same upload key as 1.x: copy 1.x's keystore.properties there, or pass -KeystoreProperties <file>."
  }
  $env:MEGY_PLAY = '1'
  $env:MEGY_KEYSTORE_PROPERTIES = (Resolve-Path $KeystoreProperties).Path
  Write-Host "Play build: com.megyprints.app, signed with the upload key in $env:MEGY_KEYSTORE_PROPERTIES"
} else {
  if (-not (Test-Path (Join-Path $Mobile '.env.local'))) { Write-Warning 'No mobile\.env.local: the app will build, but it cannot sign in (see mobile\.env.example).' }
  Remove-Item Env:\MEGY_PLAY -ErrorAction SilentlyContinue
  Remove-Item Env:\MEGY_KEYSTORE_PROPERTIES -ErrorAction SilentlyContinue
}
$kind = if ($Play) { 'play' } else { 'dev' }

# The golden pages go into a test build only when asked for (goldenPages.js):
# Metro reads MEGY_GOLDEN_PAGES when Gradle bundles the app's code.
if ($GoldenPages) {
  Write-Host 'Golden pages: node scripts\golden-phone-assets.cjs'
  Push-Location $Mobile
  try {
    & node (Join-Path $PSScriptRoot 'golden-phone-assets.cjs')
    if ($LASTEXITCODE -ne 0) { throw "golden-phone-assets.cjs failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  $env:MEGY_GOLDEN_PAGES = '1'
} else {
  Remove-Item Env:\MEGY_GOLDEN_PAGES -ErrorAction SilentlyContinue
}

# robocopy exit codes 0-7 mean success (8+ is a failure).
function Copy-Tree([string] $From, [string] $To, [string[]] $Extra) {
  & robocopy $From $To @Extra /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $From -> $To failed ($LASTEXITCODE)" }
}

if ($Fresh) {
  foreach ($d in @((Join-Path $DestMobile 'android'), (Join-Path $DestMobile 'node_modules'))) {
    if (Test-Path $d) { Write-Host "Removing $d"; Remove-Item -Recurse -Force $d }
  }
}
# The dev and Play builds have different app names: android\ made for one is
# not reused for the other.
$kindFile = Join-Path $BuildDir 'build-kind.txt'
$lastKind = if (Test-Path $kindFile) { (Get-Content $kindFile -Raw).Trim() } else { 'dev' }
$androidCopy = Join-Path $DestMobile 'android'
if ($lastKind -ne $kind -and (Test-Path $androidCopy)) {
  Write-Host "Last build was '$lastKind', this one is '$kind': removing $androidCopy"
  Remove-Item -Recurse -Force $androidCopy
}
$free = Get-FreeGB
$firstCopy = -not (Test-Path (Join-Path $DestMobile 'node_modules'))
if ($free -lt $NeedFreeGB -and ($firstCopy -or $free -lt $MinFreeGB + 0.5)) {
  throw "Only $free GB free on ${Drive}: (need $NeedFreeGB GB). Free some space first."
}
Write-Host "Free on ${Drive}: $free GB"
New-Item -ItemType Directory -Force $DestMobile | Out-Null

Write-Host "Copying the shared website code: $Repo\src -> $DestSrc"
Copy-Tree "$Repo\src" $DestSrc @('/MIR')

Write-Host "Copying the app: $Mobile -> $DestMobile"
# Top-level files (package.json, app.json, metro.config.js, sharedCode.js, .env.local, ...).
Copy-Tree $Mobile $DestMobile @('/XF', '*.log')
# The app's own folders, mirrored (a deleted screen must not linger in the copy).
$skip = @('android', 'ios', 'node_modules', '.expo', '.claude', 'dist', 'scripts')
Get-ChildItem -Directory -Force $Mobile | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
  Copy-Tree $_.FullName (Join-Path $DestMobile $_.Name) @('/MIR')
}
# node_modules: copied, never mirrored, so the copy keeps its own build output.
# Native build output left in the worktree's node_modules (long paths) is skipped.
$stale = Get-ChildItem -Directory -Force (Join-Path $Mobile 'node_modules') -Recurse -Depth 3 -ErrorAction SilentlyContinue |
  Where-Object { ($_.Name -eq 'build' -or $_.Name -eq '.cxx') -and $_.Parent.Name -eq 'android' } |
  ForEach-Object { $_.FullName }
$xd = @('/XD', '.cxx') + @($stale)
Copy-Tree (Join-Path $Mobile 'node_modules') (Join-Path $DestMobile 'node_modules') (@('/E') + $xd)

Push-Location $DestMobile
try {
  Write-Host 'npx expo prebuild --platform android'
  & npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed ($LASTEXITCODE)" }
  Set-Content -Path $kindFile -Value $kind
} finally {
  Pop-Location
}

Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$tasks = if ($Play) { @('bundleRelease', 'assembleRelease') } elseif ($Variant -eq 'release') { @('assembleRelease') } else { @('assembleDebug') }
# Play: every phone Google Play may send the app to, including old 32-bit ones.
if ($Play -and -not $PSBoundParameters.ContainsKey('Abis')) { $Abis = @('arm64-v8a', 'armeabi-v7a', 'x86_64') }
$abiList = $Abis -join ','
$androidDir = Join-Path $DestMobile 'android'
$log = Join-Path $BuildDir "gradle-$kind-$Variant.log"
Write-Host "gradlew $($tasks -join ' ') (ABIs: $abiList, JDK: $JavaHome), log: $log"
# --no-daemon: Gradle is this script's own child, so the disk guard below can stop it.
$gradle = Start-Process -FilePath (Join-Path $androidDir 'gradlew.bat') -WorkingDirectory $androidDir -PassThru -NoNewWindow `
  -ArgumentList (@($tasks) + @("-PreactNativeArchitectures=$abiList", '--no-daemon', '--console=plain')) `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err"
$handle = $gradle.Handle  # keeps the exit code readable after it ends
$lowest = Get-FreeGB
while (-not $gradle.HasExited) {
  Start-Sleep -Seconds 5
  $now = Get-FreeGB
  if ($now -lt $lowest) { $lowest = $now }
  if ($now -lt $MinFreeGB) {
    & taskkill /PID $gradle.Id /T /F | Out-Null
    throw "Stopped Gradle: only $now GB left on ${Drive}:. Free some space and run again."
  }
}
$gradle.WaitForExit()
Write-Host "Lowest free space during the build: $lowest GB (now $(Get-FreeGB) GB)"
if ($gradle.ExitCode -ne 0) {
  Get-Content $log -Tail 40
  Get-Content "$log.err" -Tail 40
  throw "Gradle $($tasks -join ' ') failed ($($gradle.ExitCode)). Full log: $log"
}
Get-Content $log -Tail 3

$apk = Join-Path $androidDir "app\build\outputs\apk\$Variant\app-$Variant.apk"
if (-not (Test-Path $apk)) { throw "Built, but no APK at $apk" }
$outDir = Join-Path $Mobile 'dist\android'
New-Item -ItemType Directory -Force $outDir | Out-Null
if ($Play) {
  $aab = Join-Path $androidDir 'app\build\outputs\bundle\release\app-release.aab'
  if (-not (Test-Path $aab)) { throw "Built, but no app bundle at $aab" }
  $outAab = Join-Path $outDir 'megyprints-2.0-play.aab'
  $out = Join-Path $outDir 'megyprints-2.0-play.apk'
  Copy-Item -Force $aab $outAab
  Copy-Item -Force $apk $out
  Write-Host "For Play Console: $outAab ($([math]::Round((Get-Item $outAab).Length / 1MB, 1)) MB)"
  Write-Host "The same app as an APK: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
  # Which key signed it: it must be the upload key. The website's
  # assetlinks.json lists the upload key and Play's own key (Google sign-in's
  # verified link), so the upload key's SHA-256 must be one of them.
  $apksigner = Get-ChildItem (Join-Path $AndroidHome 'build-tools') -Directory -ErrorAction SilentlyContinue |
    Sort-Object { try { [version]($_.Name -replace '[^0-9.].*$', '') } catch { [version]'0.0' } } -Descending |
    ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($apksigner) {
    # Its warnings (stderr) go to the screen: with 2>&1, Windows PowerShell
    # would stop the script on them.
    try { $certs = (& $apksigner verify --print-certs $out) | Out-String } catch { $certs = '' }
    $sha = if ($certs -match 'SHA-256 digest:\s*([0-9a-fA-F]{64})') { $Matches[1].ToUpper() } else { '' }
    $links = Get-Content (Join-Path $Repo 'public\.well-known\assetlinks.json') -Raw | ConvertFrom-Json
    $known = @($links | ForEach-Object { $_.target.sha256_cert_fingerprints } | ForEach-Object { $_ -replace ':', '' })
    if (-not $sha) { Write-Warning "Could not read the signing key from $out ($apksigner)." }
    elseif ($known -contains $sha) { Write-Host "Signed with a key the website knows (assetlinks.json): $sha" }
    else { Write-Warning "Signed with $sha, a key assetlinks.json does not list. If Play Console refuses the .aab, check the key in $env:MEGY_KEYSTORE_PROPERTIES." }
  } else {
    Write-Warning 'apksigner not found in the Android SDK build-tools: the signing key was not checked.'
  }
} else {
  $suffix = if ($GoldenPages) { '-golden' } else { '' }
  $out = Join-Path $outDir "megyprints-2.0-dev-$Variant$suffix.apk"
  Copy-Item -Force $apk $out
  Write-Host "APK: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
}
