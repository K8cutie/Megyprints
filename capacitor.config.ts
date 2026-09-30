import type { CapacitorConfig } from '@capacitor/cli';

// Native Android shell. Loads the LIVE site (server.url) so web deploys stay
// instant — the shell only adds native plugins (uncapped multi-photo picker).
// Same package id + signing keys as the TWA, so it replaces it on Play.
const config: CapacitorConfig = {
  appId: 'com.megyprints.app',
  appName: 'Megy Prints',
  // The shell loads the live site, so only a tiny offline page is bundled
  // (bundling dist/ made the app 27 MB for nothing).
  webDir: 'native-shell',
  server: {
    // CAP_SERVER_URL lets a debug build point at a local dev server.
    url: process.env.CAP_SERVER_URL ?? 'https://megyprints.vercel.app',
    cleartext: !!process.env.CAP_SERVER_URL,
    androidScheme: 'https',
    errorPath: 'offline.html',
  },
  android: {
    path: 'android-native',
    backgroundColor: '#FFF8F0', // cream behind the page while it loads
  },
};

export default config;
