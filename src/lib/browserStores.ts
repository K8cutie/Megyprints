/* ══════════════════════════════════════════════════════════════════════════
   browserStores — this browser's own key-value stores, in the shape the
   shared album code takes (shared/platform.ts KeyValueStore).

   Each call reaches localStorage / sessionStorage AT CALL TIME (never when
   this file loads), inside whatever try/catch the caller already has, so a
   blocked storage and a test that stubs globalThis.localStorage behave
   exactly as they did when the code called localStorage itself.

   The album builder's deviceStore / sessionStore on the website
   (lib/browserPlatform), and the website code that hands the shared rules
   this browser's store (draftAccountSave, lib/quotes).
   ══════════════════════════════════════════════════════════════════════════ */

import type { KeyValueStore } from '../shared/platform';

export const browserLocalStore: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export const browserSessionStore: KeyValueStore = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};
