/* The caption fonts every text editor offers — the page text boxes
   (MobileTextEditor), the cover title (CoverEditor) and the desktop text
   panels (PropertiesPanel, Megy's text tab). ONE list, so the pickers can
   never drift apart. Shown by FontList, each name in its own face.

   74 fonts (owner, 2026-10-08, after a customer comment about the "lack of
   font and color choices": "I ask you to add more fonts"). Until then the
   phone and cover had 27 and desktop had its own 31, so no screen showed
   more than 31. Every face here is loaded by index.html (the caption-font
   links) or index.css; fontList.spec checks that. Fonts download only when
   text uses them, and FontList rows only render (and so download) as they
   scroll into view. */

export type FontGroup = 'serif' | 'script' | 'hand' | 'clean' | 'fun' | 'bold' | 'type';

/** The list's sections, in order, with the heading FontList shows. */
export const FONT_GROUPS: { id: FontGroup; label: string }[] = [
  { id: 'serif', label: 'Elegant serif' },
  { id: 'script', label: 'Script' },
  { id: 'hand', label: 'Handwriting' },
  { id: 'clean', label: 'Clean & modern' },
  { id: 'fun', label: 'Fun & kids' },
  { id: 'bold', label: 'Bold headline' },
  { id: 'type', label: 'Typewriter' },
];

const SERIF = 'Georgia, serif', SANS = 'system-ui, sans-serif', SCRIPT = 'cursive', MONO = '"Courier New", monospace';
const f = (name: string, face: string, group: FontGroup, fallback: string) => ({ name, family: `"${face}", ${fallback}`, group });

export const FONTS: { name: string; family: string; group: FontGroup }[] = [
  // Elegant serif
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif', group: 'serif' },
  f('Playfair', 'Playfair Display', 'serif', SERIF),
  f('Lora', 'Lora', 'serif', SERIF),
  f('Merriweather', 'Merriweather', 'serif', SERIF),
  f('Cormorant', 'Cormorant Garamond', 'serif', SERIF),
  f('Baskerville', 'Libre Baskerville', 'serif', SERIF),
  f('Cinzel', 'Cinzel', 'serif', SERIF),
  f('Yeseva One', 'Yeseva One', 'serif', SERIF),
  f('Crimson Text', 'Crimson Text', 'serif', SERIF),
  f('DM Serif Display', 'DM Serif Display', 'serif', SERIF),
  f('Bodoni Moda', 'Bodoni Moda', 'serif', SERIF),
  f('Prata', 'Prata', 'serif', SERIF),
  f('Marcellus', 'Marcellus', 'serif', SERIF),
  f('Italiana', 'Italiana', 'serif', SERIF),
  f('Gloock', 'Gloock', 'serif', SERIF),
  f('Fraunces', 'Fraunces', 'serif', SERIF),
  // Script
  f('Dancing Script', 'Dancing Script', 'script', SCRIPT),
  f('Great Vibes', 'Great Vibes', 'script', SCRIPT),
  f('Sacramento', 'Sacramento', 'script', SCRIPT),
  f('Parisienne', 'Parisienne', 'script', SCRIPT),
  f('Pinyon Script', 'Pinyon Script', 'script', SCRIPT),
  f('Satisfy', 'Satisfy', 'script', SCRIPT),
  f('Allura', 'Allura', 'script', SCRIPT),
  f('Alex Brush', 'Alex Brush', 'script', SCRIPT),
  f('Tangerine', 'Tangerine', 'script', SCRIPT),
  f('Italianno', 'Italianno', 'script', SCRIPT),
  f('Mrs Saint Delafield', 'Mrs Saint Delafield', 'script', SCRIPT),
  f('Birthstone', 'Birthstone', 'script', SCRIPT),
  f('WindSong', 'WindSong', 'script', SCRIPT),
  // Handwriting
  f('Caveat', 'Caveat', 'hand', SCRIPT),
  f('Amatic SC', 'Amatic SC', 'hand', SCRIPT),
  f('Shadows Into Light', 'Shadows Into Light', 'hand', SCRIPT),
  f('Indie Flower', 'Indie Flower', 'hand', SCRIPT),
  f('Patrick Hand', 'Patrick Hand', 'hand', SCRIPT),
  f('Kalam', 'Kalam', 'hand', SCRIPT),
  f('Homemade Apple', 'Homemade Apple', 'hand', SCRIPT),
  f('Nothing You Could Do', 'Nothing You Could Do', 'hand', SCRIPT),
  // Clean & modern
  f('DM Sans', 'DM Sans', 'clean', SANS),
  f('Montserrat', 'Montserrat', 'clean', SANS),
  f('Poppins', 'Poppins', 'clean', SANS),
  f('Raleway', 'Raleway', 'clean', SANS),
  f('Nunito', 'Nunito', 'clean', SANS),
  f('Quicksand', 'Quicksand', 'clean', SANS),
  f('Work Sans', 'Work Sans', 'clean', SANS),
  f('Inter', 'Inter', 'clean', SANS),
  f('Open Sans', 'Open Sans', 'clean', SANS),
  f('Lato', 'Lato', 'clean', SANS),
  f('Source Sans', 'Source Sans 3', 'clean', SANS),
  f('Outfit', 'Outfit', 'clean', SANS),
  f('Bricolage Grotesque', 'Bricolage Grotesque', 'clean', SANS),
  f('Josefin Sans', 'Josefin Sans', 'clean', SANS),
  f('Jost', 'Jost', 'clean', SANS),
  f('Manrope', 'Manrope', 'clean', SANS),
  f('Urbanist', 'Urbanist', 'clean', SANS),
  // Fun & kids
  f('Fredoka', 'Fredoka', 'fun', SANS),
  f('Pacifico', 'Pacifico', 'fun', SCRIPT),
  f('Lobster', 'Lobster', 'fun', SCRIPT),
  f('Shrikhand', 'Shrikhand', 'fun', SCRIPT),
  f('Righteous', 'Righteous', 'fun', SANS),
  f('Baloo', 'Baloo 2', 'fun', SANS),
  f('Chewy', 'Chewy', 'fun', SANS),
  f('Bubblegum Sans', 'Bubblegum Sans', 'fun', SANS),
  f('Luckiest Guy', 'Luckiest Guy', 'fun', SANS),
  f('Comfortaa', 'Comfortaa', 'fun', SANS),
  f('Sniglet', 'Sniglet', 'fun', SANS),
  // Bold headline
  f('Bebas Neue', 'Bebas Neue', 'bold', SANS),
  f('Abril Fatface', 'Abril Fatface', 'bold', SERIF),
  f('Anton', 'Anton', 'bold', SANS),
  f('Oswald', 'Oswald', 'bold', SANS),
  f('Alfa Slab One', 'Alfa Slab One', 'bold', SERIF),
  f('Archivo Black', 'Archivo Black', 'bold', SANS),
  // Typewriter
  f('Special Elite', 'Special Elite', 'type', MONO),
  f('Courier Prime', 'Courier Prime', 'type', MONO),
  f('Cutive Mono', 'Cutive Mono', 'type', MONO),
];

/** The face a family asks for first: '"Playfair Display", serif' → Playfair Display. */
export const fontFace = (family: string) => family.split(',')[0].replace(/["']/g, '').trim();

/** A font from the list by its name (throws on a typo, so a default can't silently vanish). */
export function fontNamed(name: string): { name: string; family: string; group: FontGroup } {
  const hit = FONTS.find((x) => x.name === name);
  if (!hit) throw new Error(`no font named ${name}`);
  return hit;
}
/** New page text starts in Georgia; a new cover title in Cinzel (unchanged
 *  since the list was 27 long — picked by name now, not by position). */
export const DEFAULT_TEXT_FONT = fontNamed('Georgia').family;
export const DEFAULT_TITLE_FONT = fontNamed('Cinzel').family;

/** Same font? Stored families don't always match the list's string exactly —
 *  the cover/page defaults are '"Playfair Display", serif' while the list says
 *  '"Playfair Display", Georgia, serif'. Compare the face, not the fallbacks. */
export function isSameFont(a: string, b: string): boolean {
  return a === b || fontFace(a).toLowerCase() === fontFace(b).toLowerCase();
}

/** The name to show for a stored family: its list name, else the face itself
 *  (never a different font's name). */
export function fontName(family: string): string {
  return FONTS.find((x) => isSameFont(x.family, family))?.name ?? (fontFace(family) || FONTS[0].name);
}

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
