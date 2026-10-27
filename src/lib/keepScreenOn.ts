/* ══════════════════════════════════════════════════════════════════════════
   KEEP THE SCREEN ON while checkout makes and sends the print files. A phone
   whose screen locks pauses the page, so a 70-page print file (2–4 minutes on
   the live walk, 2026-10-26) stopped half made. The Screen Wake Lock API keeps
   the screen awake; the phone drops the lock whenever the page is hidden, so
   it is taken again when the page is back. A phone without the API just
   carries on (the "Keep this screen open" line says the rest).
   ══════════════════════════════════════════════════════════════════════════ */

interface ScreenLock { release(): Promise<void> }
interface WakeLockApi { request(type: 'screen'): Promise<ScreenLock> }

/** Keep the screen on until the returned function is called. Never throws. */
export function keepScreenOn(): () => void {
  const api = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
    : undefined;
  if (!api || typeof document === 'undefined') return () => {};

  let lock: ScreenLock | null = null;
  let stopped = false;
  const take = () => {
    api.request('screen')
      .then((l) => { if (stopped) void l.release().catch(() => {}); else lock = l; })
      .catch(() => { /* refused (battery saver, not allowed): carry on */ });
  };
  const onVisible = () => { if (!stopped && document.visibilityState === 'visible') take(); };

  take();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
