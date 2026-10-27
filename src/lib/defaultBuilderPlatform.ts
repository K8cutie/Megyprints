/* ══════════════════════════════════════════════════════════════════════════
   defaultBuilderPlatform — what the album builder runs on when nothing is
   provided (shared/platform.ts).

   On the WEBSITE: the browser's own pieces (lib/browserPlatform), so every
   page and test that uses the builder works exactly as before.

   In the 2.0 APP: its bundler (Metro) picks defaultBuilderPlatform.native.ts
   instead, which is "none", so the app never loads the browser pieces
   (IndexedDB, face-api, the HEIC worker) and must pass its own.

   Both say BuilderPlatform | null, so the builder's code reads the same
   under either.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderPlatform } from '../shared/platform';
import { browserBuilderPlatform } from './browserPlatform';

export const defaultBuilderPlatform: BuilderPlatform | null = browserBuilderPlatform;
