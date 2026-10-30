import { Capacitor } from '@capacitor/core';

/** Inside the Android app (the Capacitor shell) rather than on the website.
 *  Its own small module so a screen can ask without loading sign-in code. */
export const isNativeShell = (): boolean => Capacitor.isNativePlatform();
