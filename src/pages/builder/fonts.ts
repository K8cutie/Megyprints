/* The caption fonts: the list itself (which fonts, their groups, the
   defaults) lives in fontCatalog.ts, which the 2.0 app shares. Everything is
   re-exported here, so the website imports this file as before. This file
   adds loadFontFaces, which waits for the browser to download a face. */

import { fontFace } from './fontCatalog';

export * from './fontCatalog';

const GENERIC = /^(serif|sans-serif|cursive|monospace|fantasy|system-ui)$/i;
/** Wait (up to `timeoutMs`) for the fonts some text needs, so a canvas never
 *  draws a caption in the fallback font. Fonts download on demand, and a
 *  canvas only draws a face the browser already has. Works for any stored
 *  family string — quoted, single-quoted or bare. Never throws. */
export async function loadFontFaces(texts: { fontFamily?: string; bold?: boolean; italic?: boolean }[], timeoutMs = 4000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const wanted = new Set<string>();
  for (const t of texts) {
    const face = t.fontFamily ? fontFace(t.fontFamily) : '';
    if (!face || GENERIC.test(face)) continue;
    wanted.add(`${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}32px "${face}"`);
  }
  if (!wanted.size) return;
  const all = Promise.all([...wanted].map((spec) => document.fonts.load(spec).catch(() => [])));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
