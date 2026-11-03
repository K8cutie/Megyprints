/* The app's own native module for Google Play's in-app updates, the flexible
   kind (android/src/main/java/expo/modules/megyappupdate): the same Play
   library and flow 1.x has had since 1.4.0 (android-native AppUpdatePrompt).
     • check: what Play says about a newer version and its download;
     • startFlexible: Google's own sheet, "Update available" (the person can
       say no); a yes downloads it while they keep using the app;
     • completeUpdate: installs the downloaded version and restarts the app.
   src/lib/appUpdate.ts decides when each runs. Only an app installed from
   Google Play can be updated: anywhere else (the dev build, a sideloaded
   APK, the emulator) check fails, and nothing shows. Missing in jest and in
   an APK built before it: null. */
import { requireOptionalNativeModule } from 'expo';

/** What Play says (the numbers are Play's own: UpdateAvailability, InstallStatus). */
export interface AppUpdateInfo {
  availability: number;
  installStatus: number;
  /** Play lets this update go the flexible way (download while in use). */
  flexibleAllowed: boolean;
  /** The newer version's code (0 when there is none). */
  versionCode: number;
}

/** The native half (AppUpdateModule.kt). */
export interface AppUpdateNative {
  check(): Promise<AppUpdateInfo>;
  /** Opens Google's sheet; true once it was shown. */
  startFlexible(): Promise<boolean>;
  /** Installs the downloaded version: the app restarts. */
  completeUpdate(): Promise<void>;
}

export const appUpdate = requireOptionalNativeModule<AppUpdateNative>('MegyAppUpdate');
