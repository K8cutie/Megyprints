import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { THEMES, DEFAULT_THEME, isTheme, currentTheme, applyTheme, setTheme } from './theme';

/* ══════════════════════════════════════════════════════════════════════════
   UI THEMES — selection contract. The CSS layer keys off data-theme on
   <html>; these lock which theme wins (URL → saved → classic) and that
   'classic' means NO attribute (the shipped, pixel-identical look).
   ══════════════════════════════════════════════════════════════════════════ */

const g = globalThis as unknown as { window?: unknown; document?: unknown; localStorage?: unknown };
let store: Record<string, string>;

beforeEach(() => {
  store = {};
  const attrs: Record<string, string> = {};
  g.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  g.document = { documentElement: {
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    removeAttribute: (k: string) => { delete attrs[k]; },
    getAttribute: (k: string) => attrs[k] ?? null,
  } };
  g.window = { location: { search: '' } };
});
afterEach(() => { delete g.window; delete g.document; delete g.localStorage; });

describe('theme selection', () => {
  it('ships three themes and classic is the default', () => {
    expect(THEMES).toEqual(['classic', 'soft', 'soft-glass']);
    expect(DEFAULT_THEME).toBe('classic');
    expect(isTheme('soft')).toBe(true);
    expect(isTheme('neon')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
  it('falls back to classic with nothing saved and nothing on the URL', () => {
    expect(currentTheme()).toBe('classic');
  });
  it('a saved theme is used', () => {
    store['megy-ui-theme'] = 'soft';
    expect(currentTheme()).toBe('soft');
  });
  it('?theme= on the URL wins over the saved one and is remembered; junk is ignored', () => {
    store['megy-ui-theme'] = 'soft';
    (g.window as { location: { search: string } }).location.search = '?theme=soft-glass';
    expect(currentTheme()).toBe('soft-glass');
    expect(store['megy-ui-theme']).toBe('soft-glass');
    (g.window as { location: { search: string } }).location.search = '?theme=neon';
    expect(currentTheme()).toBe('soft-glass'); // junk param → saved value still wins
  });
  it('classic removes the attribute; any other theme sets it', () => {
    const el = (g.document as { documentElement: { getAttribute: (k: string) => string | null } }).documentElement;
    applyTheme('soft');
    expect(el.getAttribute('data-theme')).toBe('soft');
    applyTheme('classic');
    expect(el.getAttribute('data-theme')).toBeNull();
    setTheme('soft-glass');
    expect(el.getAttribute('data-theme')).toBe('soft-glass');
    expect(store['megy-ui-theme']).toBe('soft-glass');
  });
});
