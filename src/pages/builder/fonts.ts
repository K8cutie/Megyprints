/* The caption fonts every text editor offers — the page text boxes
   (MobileTextEditor) and the cover title (CoverEditor). One list, so the two
   pickers can never drift apart. Shown by FontList, each name in its own face. */

// 27 caption fonts (loaded in index.html, display=swap). A mix of serif, sans,
// script and display so any mood — elegant, playful, bold — has a fit.
export const FONTS = [
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { name: 'Playfair', family: '"Playfair Display", Georgia, serif' },
  { name: 'Lora', family: '"Lora", Georgia, serif' },
  { name: 'Merriweather', family: '"Merriweather", Georgia, serif' },
  { name: 'Cormorant', family: '"Cormorant Garamond", Georgia, serif' },
  { name: 'Baskerville', family: '"Libre Baskerville", Georgia, serif' },
  { name: 'Cinzel', family: '"Cinzel", Georgia, serif' },
  { name: 'Yeseva One', family: '"Yeseva One", Georgia, serif' },
  { name: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { name: 'DM Sans', family: '"DM Sans", system-ui, sans-serif' },
  { name: 'Montserrat', family: '"Montserrat", system-ui, sans-serif' },
  { name: 'Poppins', family: '"Poppins", system-ui, sans-serif' },
  { name: 'Raleway', family: '"Raleway", system-ui, sans-serif' },
  { name: 'Nunito', family: '"Nunito", system-ui, sans-serif' },
  { name: 'Quicksand', family: '"Quicksand", system-ui, sans-serif' },
  { name: 'Work Sans', family: '"Work Sans", system-ui, sans-serif' },
  { name: 'Fredoka', family: '"Fredoka", system-ui, sans-serif' },
  { name: 'Dancing Script', family: '"Dancing Script", cursive' },
  { name: 'Pacifico', family: '"Pacifico", cursive' },
  { name: 'Caveat', family: '"Caveat", cursive' },
  { name: 'Great Vibes', family: '"Great Vibes", cursive' },
  { name: 'Sacramento', family: '"Sacramento", cursive' },
  { name: 'Parisienne', family: '"Parisienne", cursive' },
  { name: 'Pinyon Script', family: '"Pinyon Script", cursive' },
  { name: 'Lobster', family: '"Lobster", cursive' },
  { name: 'Shrikhand', family: '"Shrikhand", cursive' },
  { name: 'Bebas Neue', family: '"Bebas Neue", system-ui, sans-serif' },
];

/** The face a family asks for first: '"Playfair Display", serif' → playfair display. */
const firstFace = (family: string) => family.split(',')[0].replace(/["']/g, '').trim();

/** Same font? Stored families don't always match the list's string exactly —
 *  the cover/page defaults are '"Playfair Display", serif' while the list says
 *  '"Playfair Display", Georgia, serif'. Compare the face, not the fallbacks. */
export function isSameFont(a: string, b: string): boolean {
  return a === b || firstFace(a).toLowerCase() === firstFace(b).toLowerCase();
}

/** The name to show for a stored family: its list name, else the face itself
 *  (never a different font's name). */
export function fontName(family: string): string {
  return FONTS.find((f) => isSameFont(f.family, family))?.name ?? (firstFace(family) || FONTS[0].name);
}
