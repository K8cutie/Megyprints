/* ── v2 feature flag ────────────────────────────────────────────────────────
   ON by default on this branch so the preview URL exercises the new engine.
   Flip it OFF in the console to A/B the same photo pool through the v1 path:
       localStorage.setItem('megy-v2-fit', '0'); location.reload();
   The flag only decides whether subject boxes are gathered and handed to
   generateAlbum — with no boxes, the engine runs exactly as it did before. */

const KEY = 'megy-v2-fit';

export function v2FitEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setV2Fit(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* memory-only this session */ }
}
