/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S BUTTONS KEEP WORKING AFTER ANDROID REBUILDS THE SCREEN.

   Found on the emulator (2026-10-30): after a change of display size (or
   font size) Android rebuilds the app's screen, so React Native starts a new
   root and then stops the old one (the log: startSurface, then stopSurface).
   expo-router's shared `router` (the one every screen imports) is bound by
   the new root, then UNBOUND when the old root goes away
   (routingQueueContext ImperativeRoutingQueueBridge cleanup), so every
   button that called router.push afterwards threw "The imperative router is
   unavailable before the first render has finished." and the app closed.

   The root layout mounts <KeepRouterBound /> in each root, which lists the
   router of each root mounted (useRouter: bound to that root). The shared
   router's methods then read from the newest root still mounted, whatever
   order roots come and go in and whatever expo-router writes into it; with
   no root mounted (before the first render) they are expo-router's own.
   ══════════════════════════════════════════════════════════════════════════ */

type Methods = Record<string, unknown>;

const roots: Methods[] = [];
let guarded: object | null = null;

/** Makes the shared router read from the newest mounted root (once). Writes
 *  to it (expo-router binding and unbinding it) are kept, and used when no
 *  root is mounted. */
export function guardSharedRouter(shared: object): void {
  if (guarded === shared) return;
  guarded = shared;
  const target = shared as Methods;
  for (const key of Object.keys(target)) {
    let written = target[key];
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get() {
        const newest = roots[roots.length - 1];
        return newest && key in newest ? newest[key] : written;
      },
      set(v: unknown) { written = v; },
    });
  }
}

/** A root's router came (mount). */
export function rootMounted(live: object): void {
  roots.push(live as Methods);
}

/** A root's router went (unmount). */
export function rootUnmounted(live: object): void {
  const i = roots.lastIndexOf(live as Methods);
  if (i >= 0) roots.splice(i, 1);
}

/** Tests: no roots, nothing guarded. */
export function resetRoots(): void {
  roots.length = 0;
  guarded = null;
}
