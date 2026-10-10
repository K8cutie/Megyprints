/* ══════════════════════════════════════════════════════════════════════════
   UI THEMES (pass 2 of the theme system).

   A theme is a CSS-only layer in src/index.css keyed by `data-theme` on
   <html>: it redefines the colour tokens (`--t-*`) and overrides the shadow /
   radius / surface utilities. It never touches layout, so switching themes
   moves nothing. 'classic' is the shipped look (no attribute at all).

   Selection, in order: `?theme=` on the URL (persists — lets a preview link
   show a theme), then localStorage, then classic. No customer-facing toggle
   yet; the owner picks one and it becomes the default here.
   ══════════════════════════════════════════════════════════════════════════ */

export const THEMES = ['classic', 'soft', 'soft-glass'] as const;
export type Theme = typeof THEMES[number];
export const DEFAULT_THEME: Theme = 'classic';
const KEY = 'megy-ui-theme';

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

/** The theme to show right now (URL param wins and is remembered). */
export function currentTheme(): Theme {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (isTheme(q)) { try { localStorage.setItem(KEY, q); } catch { /* memory-only */ } return q; }
    const saved = localStorage.getItem(KEY);
    if (isTheme(saved)) return saved;
  } catch { /* no window / storage */ }
  return DEFAULT_THEME;
}

export function applyTheme(t: Theme): void {
  const el = document.documentElement;
  if (t === 'classic') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* memory-only */ }
  applyTheme(t);
}

/** Call once before the first render so there is no flash of the wrong theme. */
export function bootTheme(): void {
  if (typeof document === 'undefined') return;
  applyTheme(currentTheme());
}
