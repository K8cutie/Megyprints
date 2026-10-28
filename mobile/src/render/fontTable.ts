/* ══════════════════════════════════════════════════════════════════════════
   THE FONTS THE APP DRAWS PAGE WORDS WITH (for now: four of the website's
   74), as TTF files from the @expo-google-fonts packages (SIL Open Font
   License). The golden check (tools/golden) gives the website render these
   very files too, so the two are compared on equal fonts.

   Each family has a real file for every style a page can ask for (regular,
   bold, italic, bold italic), the faces the website loads from Google Fonts
   (src/index.css: Playfair Display and DM Sans with their italics, 400 to
   900). Two exceptions: Dancing Script and Cinzel have no italic anywhere
   (Google has none, so the browser slants the upright itself); a page in
   either one italic is listed in PagePlan.notDrawn, like a missing font.

   A page in a font that is not here draws in the phone's own font for that
   family list (its generic serif / sans-serif included, as Chrome on
   Android does) and the page plan says so (PagePlan.notDrawn). The rest of
   the 74, and a stand-in for Georgia (a Microsoft font that Android phones
   don't have: Gelasio has the same letter widths), are still to do.
   ══════════════════════════════════════════════════════════════════════════ */

export interface BundledFont {
  /** The family name a page stores, without quotes: 'Playfair Display'. */
  face: string;
  weight: 400 | 700;
  italic: boolean;
  /** The TTF file, as a package path (Metro asset / Node require.resolve). */
  file: string;
}

const PF = '@expo-google-fonts/playfair-display';
const DM = '@expo-google-fonts/dm-sans';
const DS = '@expo-google-fonts/dancing-script';
const CZ = '@expo-google-fonts/cinzel';

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { face: 'Playfair Display', weight: 400, italic: false, file: `${PF}/400Regular/PlayfairDisplay_400Regular.ttf` },
  { face: 'Playfair Display', weight: 700, italic: false, file: `${PF}/700Bold/PlayfairDisplay_700Bold.ttf` },
  { face: 'Playfair Display', weight: 400, italic: true, file: `${PF}/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf` },
  { face: 'Playfair Display', weight: 700, italic: true, file: `${PF}/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf` },
  { face: 'DM Sans', weight: 400, italic: false, file: `${DM}/400Regular/DMSans_400Regular.ttf` },
  { face: 'DM Sans', weight: 700, italic: false, file: `${DM}/700Bold/DMSans_700Bold.ttf` },
  { face: 'DM Sans', weight: 400, italic: true, file: `${DM}/400Regular_Italic/DMSans_400Regular_Italic.ttf` },
  { face: 'DM Sans', weight: 700, italic: true, file: `${DM}/700Bold_Italic/DMSans_700Bold_Italic.ttf` },
  { face: 'Dancing Script', weight: 400, italic: false, file: `${DS}/400Regular/DancingScript_400Regular.ttf` },
  { face: 'Dancing Script', weight: 700, italic: false, file: `${DS}/700Bold/DancingScript_700Bold.ttf` },
  // Cinzel: the cover's title font (fonts.ts DEFAULT_TITLE_FONT) and the Megy
  // Prints mark on the back (coverSpine deriveBrandedBack). Capitals only, no
  // italic anywhere (the website loads wght 400 and 700).
  { face: 'Cinzel', weight: 400, italic: false, file: `${CZ}/400Regular/Cinzel_400Regular.ttf` },
  { face: 'Cinzel', weight: 700, italic: false, file: `${CZ}/700Bold/Cinzel_700Bold.ttf` },
];

const GENERIC = /^(serif|sans-serif|cursive|monospace|fantasy|system-ui)$/i;

/** Every name in a stored family string, in order, without quotes:
 *  'Georgia, "Times New Roman", serif' → ['Georgia', 'Times New Roman', 'serif']. */
export function familyList(family: string | undefined): string[] {
  return String(family ?? '')
    .split(',')
    .map((f) => f.replace(/["']/g, '').trim())
    .filter((f) => !!f);
}

/** The faces a stored family string asks for, without the generic fallbacks:
 *  '"Playfair Display", Georgia, serif' → ['Playfair Display', 'Georgia']. */
export function familyFaces(family: string | undefined): string[] {
  return familyList(family).filter((f) => !GENERIC.test(f));
}

/** The first face of `family` the app has, the way a browser walks a CSS
 *  font-family list, or null when it has none of them. */
export function bundledFace(family: string | undefined): string | null {
  const have = new Set(BUNDLED_FONTS.map((f) => f.face.toLowerCase()));
  return familyFaces(family).find((f) => have.has(f.toLowerCase())) ?? null;
}

/** What a text asks for: its family string, bold, italic. */
export interface FontAsk { family?: string; bold?: boolean; italic?: boolean }

/** The font file a text draws with, the CSS font matching kept simple: the
 *  family's face with the same style (italic or not), nearest weight; a face
 *  with no file of that style takes the other style (Skia then slants or
 *  thickens it). Null when the app has none of the family's faces. */
export function fontFileFor(ask: FontAsk): BundledFont | null {
  const face = bundledFace(ask.family);
  if (!face) return null;
  const same = BUNDLED_FONTS.filter((f) => f.face.toLowerCase() === face.toLowerCase());
  const want = ask.bold ? 700 : 400;
  const byStyle = same.filter((f) => f.italic === !!ask.italic);
  const pool = byStyle.length ? byStyle : same;
  return pool.slice().sort((a, b) => Math.abs(a.weight - want) - Math.abs(b.weight - want))[0] ?? null;
}

/** Whether the app has the exact file a text asks for (same face, weight and
 *  style). When not, the words are drawn, but not the way the website draws
 *  them: the page plan lists it. */
export function hasExactFont(ask: FontAsk): boolean {
  const f = fontFileFor(ask);
  return !!f && f.weight === (ask.bold ? 700 : 400) && f.italic === !!ask.italic;
}

/** The font families to hand Skia's paragraph for a text: the bundled face
 *  when the app has it, otherwise the whole stored list, generic last, so the
 *  phone's font manager picks its own serif or sans-serif the way Chrome on
 *  Android walks the CSS list (never Skia's single default family). */
export function paragraphFamilies(family: string | undefined): string[] {
  const face = bundledFace(family);
  if (face) return [face];
  const all = familyList(family);
  return all.length ? all : ['serif'];
}

/** How a page names a text's font that is not drawn the website's way, or
 *  null when it is: 'font Georgia, serif (drawn in the phone's own font)',
 *  'font "Dancing Script", cursive italic (no italic file: slanted by the app)'. */
export function fontNotDrawn(ask: FontAsk): string | null {
  if (hasExactFont(ask)) return null;
  const family = String(ask.family ?? 'serif');
  if (!bundledFace(ask.family)) return `font ${family} (drawn in the phone's own font)`;
  const style = [ask.bold ? 'bold' : '', ask.italic ? 'italic' : ''].filter(Boolean).join(' ');
  return `font ${family} ${style} (no ${style} file: faked by the app)`;
}
