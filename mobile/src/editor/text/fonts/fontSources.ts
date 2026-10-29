/* ══════════════════════════════════════════════════════════════════════════
   WHERE EACH OF THE 74 CAPTION FONTS COMES FROM IN THE APP.

   The website offers 74 fonts (fontCatalog.ts, shared) and the browser
   downloads each one from Google Fonts the first time a page uses it. The
   app does the same, so a caption prints in the very font the customer
   picked, without making the app 7 MB bigger:

     • bundled: the theme fonts, inside the app (render/fontTable.ts
       BUNDLED_FONTS: Playfair Display, DM Sans, Dancing Script, and Cinzel,
       the cover title's face). Megy's own text uses only these.
     • google: every other font, downloaded from Google Fonts the first time
       it is picked (or a page on screen uses it), then kept on the phone for
       good (fontStore.ts). About 40–400 KB a font; all 70 of them together
       are about 7 MB, which nobody needs at once.
     • phone: Georgia, a Microsoft font that is not on Google Fonts and not
       on Android phones. The website on an Android phone draws it in the
       phone's own serif, and so does the app (render/fontTable.ts).

   The styles fetched for a font are the ones the website loads for it
   (index.html's caption-font links and src/index.css): regular and bold,
   upright and italic, wherever the website asks for them. A style the
   website does not load is faked by the browser there and by Skia here.
   test/editorTextFonts.test.ts works that list out of those two website
   files again and fails if WEBSITE_STYLES stops matching.
   ══════════════════════════════════════════════════════════════════════════ */
import { FONTS, fontFace } from '@web/pages/builder/fontCatalog';
import { BUNDLED_FONTS } from '../../../render/fontTable';

/** A style: weight 400 or 700, upright or italic ('i'). */
export type StyleKey = '400' | '700' | '400i' | '700i';
export const STYLE_KEYS: readonly StyleKey[] = ['400', '700', '400i', '700i'];

export const styleOf = (bold: boolean | undefined, italic: boolean | undefined): StyleKey =>
  `${bold ? '700' : '400'}${italic ? 'i' : ''}` as StyleKey;
export const weightOf = (s: StyleKey): 400 | 700 => (s.startsWith('7') ? 700 : 400);
export const isItalic = (s: StyleKey): boolean => s.endsWith('i');

/** The styles the website loads for each caption font (by face), from
 *  index.html and src/index.css. Georgia is not loaded: it is not a web font. */
export const WEBSITE_STYLES: Readonly<Record<string, readonly StyleKey[]>> = {
  'Playfair Display': ['400', '700', '400i', '700i'],
  'Lora': ['400', '700', '400i', '700i'],
  'Merriweather': ['400', '700', '400i', '700i'],
  'Cormorant Garamond': ['400', '700', '400i', '700i'],
  'Libre Baskerville': ['400', '700', '400i', '700i'],
  'Cinzel': ['400', '700'],
  'Yeseva One': ['400'],
  'Crimson Text': ['400', '700', '400i', '700i'],
  'DM Serif Display': ['400', '700'],
  'Bodoni Moda': ['400', '700'],
  'Prata': ['400', '700'],
  'Marcellus': ['400', '700'],
  'Italiana': ['400', '700'],
  'Gloock': ['400', '700'],
  'Fraunces': ['400', '700'],
  'Dancing Script': ['400', '700'],
  'Great Vibes': ['400'],
  'Sacramento': ['400'],
  'Parisienne': ['400'],
  'Pinyon Script': ['400'],
  'Satisfy': ['400'],
  'Allura': ['400', '700'],
  'Alex Brush': ['400', '700'],
  'Tangerine': ['400', '700'],
  'Italianno': ['400', '700'],
  'Mrs Saint Delafield': ['400', '700'],
  'Birthstone': ['400', '700'],
  'WindSong': ['400', '700'],
  'Caveat': ['400', '700'],
  'Amatic SC': ['400', '700'],
  'Shadows Into Light': ['400', '700'],
  'Indie Flower': ['400', '700'],
  'Patrick Hand': ['400', '700'],
  'Kalam': ['400', '700'],
  'Homemade Apple': ['400', '700'],
  'Nothing You Could Do': ['400', '700'],
  'DM Sans': ['400', '700', '400i', '700i'],
  'Montserrat': ['400', '700', '400i', '700i'],
  'Poppins': ['400', '700', '400i', '700i'],
  'Raleway': ['400', '700', '400i', '700i'],
  'Nunito': ['400', '700', '400i', '700i'],
  'Quicksand': ['400', '700'],
  'Work Sans': ['400', '700', '400i', '700i'],
  'Inter': ['400', '700'],
  'Open Sans': ['400', '700', '400i', '700i'],
  'Lato': ['400', '700', '400i', '700i'],
  'Source Sans 3': ['400', '700', '400i', '700i'],
  'Outfit': ['400', '700'],
  'Bricolage Grotesque': ['400', '700'],
  'Josefin Sans': ['400', '700'],
  'Jost': ['400', '700'],
  'Manrope': ['400', '700'],
  'Urbanist': ['400', '700'],
  'Fredoka': ['400', '700'],
  'Pacifico': ['400'],
  'Lobster': ['400'],
  'Shrikhand': ['400'],
  'Righteous': ['400'],
  'Baloo 2': ['400', '700'],
  'Chewy': ['400', '700'],
  'Bubblegum Sans': ['400', '700'],
  'Luckiest Guy': ['400', '700'],
  'Comfortaa': ['400', '700'],
  'Sniglet': ['400', '700'],
  'Bebas Neue': ['400'],
  'Abril Fatface': ['400'],
  'Anton': ['400', '700'],
  'Oswald': ['400', '700'],
  'Alfa Slab One': ['400', '700'],
  'Archivo Black': ['400', '700'],
  'Special Elite': ['400', '700'],
  'Courier Prime': ['400', '700'],
  'Cutive Mono': ['400', '700'],
};

/** Not on Google Fonts (and not on Android phones): the phone's own serif. */
const PHONE_ONLY = new Set(['georgia']);

export type FontSource = 'bundled' | 'google' | 'phone';

/** The face a stored family asks for first, if it is one of the 74. */
export function catalogFace(family: string | undefined): string | null {
  if (!family) return null;
  const face = fontFace(family).toLowerCase();
  const hit = FONTS.find((f) => fontFace(f.family).toLowerCase() === face);
  return hit ? fontFace(hit.family) : null;
}

/** Where the app gets a face: inside the app, from Google Fonts, or the phone. */
export function fontSource(face: string): FontSource {
  const f = face.toLowerCase();
  if (BUNDLED_FONTS.some((b) => b.face.toLowerCase() === f)) return 'bundled';
  if (PHONE_ONLY.has(f)) return 'phone';
  return 'google';
}

/** Every font of the 74 by where it comes from (for the PR and the docs). */
export function fontsBySource(): Record<FontSource, string[]> {
  const out: Record<FontSource, string[]> = { bundled: [], google: [], phone: [] };
  for (const f of FONTS) out[fontSource(fontFace(f.family))].push(f.name);
  return out;
}

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';
/** Where Google Fonts serves the files (anything else in an answer is refused). */
export const GOOGLE_FILES = 'https://fonts.gstatic.com/';

const familyParam = (face: string) => encodeURIComponent(face).replace(/%20/g, '+');

/** Google Fonts' css2 address for a face in the website's styles. Asked by
 *  the app (not a browser), Google answers with whole TrueType files. */
export function googleCssUrl(face: string, styles: readonly StyleKey[] = WEBSITE_STYLES[face] ?? ['400']): string {
  const list = styles.length ? styles : (['400'] as const);
  const italic = list.some(isItalic);
  const onlyRegular = list.length === 1 && list[0] === '400';
  let axes = '';
  if (italic) {
    const tuples = list.map((s) => [isItalic(s) ? 1 : 0, weightOf(s)] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([i, w]) => `${i},${w}`);
    axes = `:ital,wght@${tuples.join(';')}`;
  } else if (!onlyRegular) {
    axes = `:wght@${[...new Set(list.map(weightOf))].sort((a, b) => a - b).join(';')}`;
  }
  return `${GOOGLE_CSS}?family=${familyParam(face)}${axes}`;
}

/** A tiny copy of a face holding only the letters of its own name (Google
 *  Fonts' text=), about 4 KB: the font list shows each name in its face. */
export function googlePreviewUrl(face: string, name: string): string {
  return `${GOOGLE_CSS}?family=${familyParam(face)}&text=${encodeURIComponent(name)}`;
}

export interface FontFileRef { style: StyleKey; url: string }

/** The font files in a css2 answer: one per @font-face, its style and its
 *  address on fonts.gstatic.com (an address anywhere else is left out). */
export function parseFontCss(css: string): FontFileRef[] {
  const out: FontFileRef[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const style = /font-style:\s*(normal|italic)/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const url = /src:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/.exec(block)?.[1];
    if (!style || !weight || !url || !url.startsWith(GOOGLE_FILES)) continue;
    const w = Number(weight);
    if (w !== 400 && w !== 700) continue;
    const key = `${w}${style === 'italic' ? 'i' : ''}` as StyleKey;
    if (!out.some((o) => o.style === key)) out.push({ style: key, url });
  }
  return out;
}

/** A file name on the phone for a face's style ('Lora' 700i → lora-700i.ttf). */
export function fontFileName(face: string, style: StyleKey | 'preview'): string {
  return `${face.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${style}.ttf`;
}

/** The name the phone's text views know a downloaded or bundled file by. */
export function uiAlias(face: string, style: StyleKey | 'preview'): string {
  return `megy-${fontFileName(face, style).replace(/\.ttf$/, '')}`;
}

/** The biggest font file taken (Google's caption fonts are 20–400 KB a file):
 *  anything larger is not a caption font, and is not parsed. */
export const MAX_FONT_BYTES = 3 * 1024 * 1024;

/** Does it look like a font file (TrueType or OpenType)? A captive portal's
 *  web page, a cut-off download or something far too big is not saved or used. */
export function looksLikeFont(bytes: Uint8Array): boolean {
  if (bytes.length < 1024 || bytes.length > MAX_FONT_BYTES) return false;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === 'true' || tag === 'OTTO';
}

/** The generic family at the end of a stored family list, for the phone's
 *  own text views ('serif', 'sans-serif', 'cursive', 'monospace'). */
export function genericOf(family: string | undefined): 'serif' | 'sans-serif' | 'cursive' | 'monospace' {
  const parts = String(family ?? '').split(',').map((p) => p.replace(/["']/g, '').trim().toLowerCase());
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p === 'serif') return 'serif';
    if (p === 'sans-serif' || p === 'system-ui') return 'sans-serif';
    if (p === 'cursive') return 'cursive';
    if (p === 'monospace') return 'monospace';
  }
  return 'serif';
}
