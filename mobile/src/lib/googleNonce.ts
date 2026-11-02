/* The one-time code a Google sign-in carries (lib/googleSignIn.ts), kept on
   the phone while Google is open (Android may close the app meanwhile), and
   made from the phone's secure random numbers (expo-crypto). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import type { NonceStore } from './googleSignIn';

/** The website's own key name (nativeAuth.ts NONCE_KEY). */
export const NONCE_KEY = 'megy-native-auth-nonce';

export const nonceStore: NonceStore = {
  get: () => AsyncStorage.getItem(NONCE_KEY),
  set: async (value) => { if (value) await AsyncStorage.setItem(NONCE_KEY, value); else await AsyncStorage.removeItem(NONCE_KEY); },
};

/** 16 random bytes as hex (the website uses crypto.getRandomValues the same way). */
export function randomHex(): string {
  return Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}
