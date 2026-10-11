/* ══════════════════════════════════════════════════════════════════════════
   textColors — THE text colours, the one list every text editor offers: the
   cover title, text on a phone, and desktop (the font list's rule, fonts.ts).

   A customer said there were too few font and colour choices (2026-10-08).
   The fonts grew to 74 then (#127); the colours stayed at 7 on the phone and
   the cover. Owner, 2026-10-11: "color selection on the cover page ... is
   very limited". These are the 28 from the colour sheet shown that day (C1–
   C28), in its six families, plus "Any color" for anything else
   (TextColorPicker). The 7 the app had are all here, so a saved album's
   colour still shows as chosen.
   ══════════════════════════════════════════════════════════════════════════ */

export interface TextColor {
  name: string;
  hex: string;
}

export const TEXT_COLOR_GROUPS: { group: string; colors: TextColor[] }[] = [
  { group: 'Neutrals', colors: [
    { name: 'Black', hex: '#1A1A1A' }, { name: 'Charcoal', hex: '#2D2D2D' }, { name: 'Gray', hex: '#6B6B6B' },
    { name: 'Warm gray', hex: '#8C7B6B' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Cream', hex: '#F3E9DC' },
  ] },
  { group: 'Browns & golds', colors: [
    { name: 'Cocoa', hex: '#5C4033' }, { name: 'Tan', hex: '#A67B5B' }, { name: 'Gold', hex: '#C9A24B' }, { name: 'Mustard', hex: '#D4A017' },
  ] },
  { group: 'Reds & pinks', colors: [
    { name: 'Terracotta', hex: '#B85C38' }, { name: 'Brick', hex: '#A63D2F' }, { name: 'Red', hex: '#C62828' },
    { name: 'Rose', hex: '#C2185B' }, { name: 'Blush', hex: '#E8A598' }, { name: 'Pink', hex: '#F48FB1' },
  ] },
  { group: 'Oranges', colors: [
    { name: 'Coral', hex: '#F07F5F' }, { name: 'Orange', hex: '#E8772E' },
  ] },
  { group: 'Greens', colors: [
    { name: 'Forest', hex: '#2E7D4A' }, { name: 'Sage', hex: '#8A9A7A' }, { name: 'Olive', hex: '#6B7B3A' }, { name: 'Teal', hex: '#1F7A7A' },
  ] },
  { group: 'Blues & purples', colors: [
    { name: 'Navy', hex: '#1F3A5F' }, { name: 'Blue', hex: '#3A6EA5' }, { name: 'Sky', hex: '#6FA8DC' },
    { name: 'Lavender', hex: '#B39DDB' }, { name: 'Purple', hex: '#9B5DE5' }, { name: 'Plum', hex: '#6A2C70' },
  ] },
];

/** Every swatch, in the families' order. */
export const TEXT_COLORS: readonly TextColor[] = TEXT_COLOR_GROUPS.flatMap((g) => g.colors);
/** Just the hex values (desktop's preset row). */
export const TEXT_COLOR_HEXES: readonly string[] = TEXT_COLORS.map((c) => c.hex);

/** The same colour however it was written (#fff, #FFFFFF, #ffffff). */
export function sameColor(a: string | undefined | null, b: string | undefined | null): boolean {
  const norm = (c: string | undefined | null) => {
    const s = (c ?? '').trim().toLowerCase();
    return /^#[0-9a-f]{3}$/.test(s) ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
  };
  return !!a && !!b && norm(a) === norm(b);
}

/** The swatch's name, or null for a colour that isn't one of them. */
export function textColorName(hex: string | undefined | null): string | null {
  return TEXT_COLORS.find((c) => sameColor(c.hex, hex))?.name ?? null;
}

/** A 6-digit hex for <input type="color"> (it accepts nothing else). */
export function toColorInputValue(c: string | undefined | null): string {
  const s = (c ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return '#2d2d2d';
}
