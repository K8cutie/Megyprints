/* ══════════════════════════════════════════════════════════════════════════
   Config plugin: signs the Play build (app.config.js, MEGY_PLAY=1) with the
   owner's Play upload key, the key the 1.x app is signed with. Google Play
   takes an update of com.megyprints.app only when it is signed with that key.

   The key and its passwords are never in git. Gradle reads them, when it
   builds, from the file MEGY_KEYSTORE_PROPERTIES names: the 1.x app's
   android-native/keystore.properties (git-ignored), with the same four lines
       storeFile=…        (the .jks/.keystore file; a relative path is read
                           from the folder keystore.properties is in, as 1.x)
       storePassword=…
       keyAlias=…
       keyPassword=…
   scripts/build-android.ps1 -Play sets MEGY_KEYSTORE_PROPERTIES and stops
   first when the file is not there. A release build without it stops with
   a clear message rather than coming out signed with the public debug key.

   The lines are added at the end of android/app/build.gradle (made by
   prebuild), once, and set the release build's signing after the template's
   own (which signs release with the debug key).
   ══════════════════════════════════════════════════════════════════════════ */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// Megy Prints: Play upload key signing (plugins/withPlaySigning.js)';

const GRADLE = `
${MARK}
def megyKeysPath = System.getenv('MEGY_KEYSTORE_PROPERTIES')
if (megyKeysPath) {
    def megyKeysFile = new File(megyKeysPath)
    if (!megyKeysFile.isFile()) {
        throw new GradleException("MEGY_KEYSTORE_PROPERTIES: no file at \${megyKeysPath}")
    }
    def megyKeys = new Properties()
    megyKeysFile.withInputStream { megyKeys.load(it) }
    ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].each { name ->
        if (!megyKeys[name]) {
            throw new GradleException("\${megyKeysPath} has no \${name}=")
        }
    }
    def megyStore = new File(megyKeys['storeFile'])
    if (!megyStore.isAbsolute()) {
        megyStore = new File(megyKeysFile.parentFile, megyKeys['storeFile'])
    }
    if (!megyStore.isFile()) {
        throw new GradleException("The upload key file is not there: \${megyStore}")
    }
    android {
        signingConfigs {
            megyUpload {
                storeFile megyStore
                storePassword megyKeys['storePassword']
                keyAlias megyKeys['keyAlias']
                keyPassword megyKeys['keyPassword']
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.megyUpload
            }
        }
    }
} else {
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.name.toLowerCase().contains('release') }) {
            throw new GradleException('A Play build is signed with the upload key: set MEGY_KEYSTORE_PROPERTIES (scripts/build-android.ps1 -Play does).')
        }
    }
}
`;

/** android/app/build.gradle with the signing lines added (once). */
function addPlaySigning(buildGradle) {
  if (buildGradle.includes(MARK)) return buildGradle;
  return `${buildGradle.replace(/\s*$/, '')}\n${GRADLE}`;
}

function withPlaySigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withPlaySigning: android/app/build.gradle is not Groovy');
    }
    cfg.modResults.contents = addPlaySigning(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withPlaySigning;
module.exports.addPlaySigning = addPlaySigning;
module.exports.MARK = MARK;
