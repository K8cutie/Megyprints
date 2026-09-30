import type { CapacitorConfig } from '@capacitor/cli';

// Native Android shell. Loads the LIVE site (server.url) so web deploys stay
// instant — the shell only adds native plugins (uncapped multi-photo picker).
// Same package id + signing keys as the TWA, so it replaces it on Play.
const config: CapacitorConfig = {
  appId: 'com.megyprints.app',
  appName: 'Megy Prints',
  webDir: 'dist',
  server: {
    // CAP_SERVER_URL lets a debug build point at a local dev server.
    url: process.env.CAP_SERVER_URL ?? 'https://megyprints.vercel.app',
    cleartext: !!process.env.CAP_SERVER_URL,
    androidScheme: 'https',
  },
  android: {
    path: 'android-native',
    backgroundColor: '#F05239',
  },
};

export default config;
