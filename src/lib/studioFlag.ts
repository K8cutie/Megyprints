/* Studio (the customer-leads editing mode) is OFF for customers until the
   owner flips it. On with `?studio=1` (remembered) or `?studio=0` to forget.
   Mirrors the theme flag: URL wins, then localStorage, then off. */
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
  if (q === '0' || q === 'off') { try { localStorage.removeItem(KEY); } catch { /* memory-only */ } return false; }
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
