/* ══════════════════════════════════════════════════════════════════════════
   defaultBuilderPlatform, the 2.0 APP's copy (React Native).

   The app's bundler (Metro) picks this file over defaultBuilderPlatform.ts,
   and the app's type check does too (tsconfig moduleSuffixes [".native", ""]).
   There is no fallback in the app: it wraps the album builder in
   <BuilderPlatformContext.Provider> with its own device pieces, and the
   builder says so plainly if it doesn't. Pure, so it is on the shared list
   (sharedModules.ts), which lets shared code import defaultBuilderPlatform.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderPlatform } from '../shared/platform';

export const defaultBuilderPlatform: BuilderPlatform | null = null;
