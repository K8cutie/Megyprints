// Native libraries that are installed but NOT built into the Android app.
//
// expo-router lists Reanimated, Worklets and Gesture Handler as (optional)
// peer packages, and react-native-drawer-layout needs them, so npm installs
// them. This app's code does not use them (Metro's bundle has none of their
// code), yet Android autolinking would compile their C++ for every phone type:
// minutes of build time and gigabytes of build files on a nearly full disk.
//
// When a screen needs one (likely the editor in Phase 4: pinch and drag),
// delete its line here, import it, and run prebuild + Gradle again.
// test/nativeLibraries.test.ts fails if app code imports one that is off here.
module.exports = {
  dependencies: {
    'react-native-reanimated': { platforms: { android: null, ios: null } },
    'react-native-worklets': { platforms: { android: null, ios: null } },
    'react-native-gesture-handler': { platforms: { android: null, ios: null } },
  },
};
