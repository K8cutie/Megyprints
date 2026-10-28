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
    -Abis arm64-v8a,x86_64   phones (arm64) and the PC emulator (x86_64); add armeabi-v7a for old 32-bit phones
    -BuildDir C:\megy2       the short folder
    -Fresh                   delete the short folder's android\ and node_modules\ first
    -GoldenPages             a TEST build that carries the golden pages and covers (about 10 MB) for the debug
                             screen "Golden pages" (Shared code check): the page renderer drawn by
                             the phone's own Skia (scripts\golden-phone-assets.cjs, src\dev\goldenRun.ts).
                             Never for a build that goes to customers.

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
  [switch] $GoldenPages
)
$ErrorActionPreference = 'Stop'

$Mobile = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Mobile
$DestMobile = Join-Path $BuildDir 'mobile'
$DestSrc = Join-Path $BuildDir 'src'
$Drive = (Split-Path -Qualifier $BuildDir).TrimEnd(':')
function Get-FreeGB { [math]::Round((Get-PSDrive $Drive).Free / 1GB, 2) }

if (-not (Test-Path (Join-Path $Mobile 'node_modules'))) { throw "No mobile\node_modules: run npm ci in $Mobile first." }
if (-not (Test-Path (Join-Path $Mobile '.env.local'))) { Write-Warning 'No mobile\.env.local: the app will build, but it cannot sign in (see mobile\.env.example).' }
if (-not (Test-Path $JavaHome)) { throw "JDK not found at $JavaHome" }

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
} finally {
  Pop-Location
}

Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$task = if ($Variant -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
$abiList = $Abis -join ','
$androidDir = Join-Path $DestMobile 'android'
$log = Join-Path $BuildDir "gradle-$Variant.log"
Write-Host "gradlew $task (ABIs: $abiList, JDK: $JavaHome), log: $log"
# --no-daemon: Gradle is this script's own child, so the disk guard below can stop it.
$gradle = Start-Process -FilePath (Join-Path $androidDir 'gradlew.bat') -WorkingDirectory $androidDir -PassThru -NoNewWindow `
  -ArgumentList @($task, "-PreactNativeArchitectures=$abiList", '--no-daemon', '--console=plain') `
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
  throw "Gradle $task failed ($($gradle.ExitCode)). Full log: $log"
}
Get-Content $log -Tail 3

$apk = Join-Path $androidDir "app\build\outputs\apk\$Variant\app-$Variant.apk"
if (-not (Test-Path $apk)) { throw "Built, but no APK at $apk" }
$outDir = Join-Path $Mobile 'dist\android'
New-Item -ItemType Directory -Force $outDir | Out-Null
$suffix = if ($GoldenPages) { '-golden' } else { '' }
$out = Join-Path $outDir "megyprints-2.0-dev-$Variant$suffix.apk"
Copy-Item -Force $apk $out
Write-Host "APK: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
