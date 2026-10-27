/* ══════════════════════════════════════════════════════════════════════════
   THE FONTS THE APP DRAWS PAGE WORDS WITH (for now: three of the website's
   74). The same families, weights and styles the website asks Google Fonts
   for (index.html, index.css), as TTF files from the @expo-google-fonts
   packages (SIL Open Font License). The golden check (tools/golden) gives
   the website render these very files too, so the two are compared on equal
   fonts.

   A page in a font that is not here draws in the fallback and the page plan
   says so (PagePlan.notDrawn). The rest of the 74, and a stand-in for
   Georgia (a Microsoft font that Android phones don't have: Gelasio has the
   same letter widths), are listed in the PR as still to do.
   ══════════════════════════════════════════════════════════════════════════ */

export interface BundledFont {
  /** The family name a page stores, without quotes: 'Playfair Display'. */
  face: string;
  weight: 400 | 700;
  italic: boolean;
  /** The TTF file, as a package path (Metro asset / Node require.resolve). */
  file: string;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { face: 'Playfair Display', weight: 400, italic: false, file: '@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf' },
  { face: 'Playfair Display', weight: 700, italic: false, file: '@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf' },
  { face: 'Playfair Display', weight: 400, italic: true, file: '@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf' },
  { face: 'DM Sans', weight: 400, italic: false, file: '@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf' },
  { face: 'DM Sans', weight: 700, italic: false, file: '@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf' },
  { face: 'Dancing Script', weight: 400, italic: false, file: '@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf' },
  { face: 'Dancing Script', weight: 700, italic: false, file: '@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf' },
];

const GENERIC = /^(serif|sans-serif|cursive|monospace|fantasy|system-ui)$/i;

/** The faces a stored family string asks for, in order, without quotes and
 *  without the generic fallbacks: '"Playfair Display", Georgia, serif' →
 *  ['Playfair Display', 'Georgia']. */
export function familyFaces(family: string | undefined): string[] {
  return String(family ?? '')
    .split(',')
    .map((f) => f.replace(/["']/g, '').trim())
    .filter((f) => !!f && !GENERIC.test(f));
}

/** The first face of `family` the app has, the way a browser walks a CSS
 *  font-family list, or null when it has none of them. */
export function bundledFace(family: string | undefined): string | null {
  const have = new Set(BUNDLED_FONTS.map((f) => f.face.toLowerCase()));
  return familyFaces(family).find((f) => have.has(f.toLowerCase())) ?? null;
}
