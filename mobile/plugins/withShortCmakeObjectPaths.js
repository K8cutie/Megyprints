/* ══════════════════════════════════════════════════════════════════════════
   Config plugin: lets the Android C++ build run on Windows.

   CMake names each object file after the full path of its source file. For
   sources outside a module's own folder (React Native's generated "codegen"
   files) that path is long, and the ninja that comes with the Android SDK's
   CMake 3.22.1 cannot make folders whose full path is longer than about 250
   characters, so the build stops with
       ninja: error: mkdir(.../CMakeFiles/react_codegen_safeareacontext.dir/C_/megy2/mobile/node_modules/...): No such file or directory

   CMake shortens such names (it swaps the front of the path for a short hash)
   when a path would pass CMAKE_OBJECT_PATH_MAX. Expo sets that to 1024 for
   every module (expo-modules-autolinking, ExpoRootProjectPlugin), which means
   "never shorten". Its Gradle property expo.android.cmakeObjectPathMax sets
   another value; this plugin writes it into android/gradle.properties.

   Even shortened, a worktree folder (.claude\worktrees\<name>) is too long:
   the folder part alone leaves no room. scripts/build-android.ps1 builds from
   the short folder C:\megy2, where this limit fits easily. (The other fix,
   a newer CMake whose ninja handles long paths, needs an SDK download:
   android.cmakeVersion in gradle.properties.)
   ══════════════════════════════════════════════════════════════════════════ */
const { withGradleProperties } = require('expo/config-plugins');

const PROPERTY = 'expo.android.cmakeObjectPathMax';
const OBJECT_PATH_MAX = 240;

/** gradle.properties items with the limit set (once, replacing any other value). */
function setObjectPathMax(items) {
  const rest = items.filter((item) => !(item.type === 'property' && item.key === PROPERTY));
  return [...rest, { type: 'property', key: PROPERTY, value: String(OBJECT_PATH_MAX) }];
}

function withShortCmakeObjectPaths(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = setObjectPathMax(cfg.modResults);
    return cfg;
  });
}

module.exports = withShortCmakeObjectPaths;
module.exports.setObjectPathMax = setObjectPathMax;
module.exports.PROPERTY = PROPERTY;
module.exports.OBJECT_PATH_MAX = OBJECT_PATH_MAX;
