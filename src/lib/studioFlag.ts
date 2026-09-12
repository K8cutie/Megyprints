/* Studio (the customer-leads editing mode). ON by default since 2026-09-13
   (the owner could not reach a URL flag from the installed app); the switch
   itself still defaults to Simple, so nothing changes for a customer who
   never taps Studio. `?studio=0` (or five taps on the phone's page counter)
   hides it on that device; `?studio=1` brings it back. */
const KEY = 'megy-studio';

function query(): string | null {
  try {
    const search = new URLSearchParams(window.location.search).get('studio');
    if (search != null) return search;
    const hashQ = window.location.hash.split('?')[1];
    return hashQ ? new URLSearchParams(hashQ).get('studio') : null;
  } catch { return null; }
}

export function studioEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const q = query();
  if (q === '1' || q === 'on') { try { localStorage.setItem(KEY, '1'); } catch { /* memory-only */ } return true; }
  if (q === '0' || q === 'off') { try { localStorage.setItem(KEY, '0'); } catch { /* memory-only */ } return false; }
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

/** Turn the flag on or off from inside the app (the phone has no URL bar in
 *  the installed app; the owner taps the page counter five times). */
export function setStudioFlag(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* memory-only */ }
}
