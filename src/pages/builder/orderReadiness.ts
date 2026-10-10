/* ══════════════════════════════════════════════════════════════════════════
   BEFORE YOU ORDER — what would print as blank (1-star testers, 2026-10-04).
   An album went through checkout with empty photo frames (big blank areas),
   a text box still reading "Double-tap to edit" (Megy's new-text default,
   printed as is), and blank pages — no warning anywhere, on a paid print
   that can't be recalled. This counts them, so Order can say so first:
   "Show me" goes to the first one, "Order anyway" goes on.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, PageTemplate } from './types';
import { getTemplateById } from './pageTemplates';

/** The text a new text element starts with (useBuilderState.addTextElement). */
export const PLACEHOLDER_TEXT = 'Double-tap to edit';

export interface OrderReadiness {
  /** Photo frames with nothing in them. */
  emptyFrames: number;
  /** Combo / caption boxes with nothing in them (what "let Megy finish" fills). */
  emptyBoxes: number;
  /** Text still reading the new-text placeholder. */
  placeholderTexts: number;
  /** Pages with nothing on them at all. */
  blankPages: number;
  /** The first page with any of the above (0-based), or null. */
  firstPage: number | null;
}

const has = <T>(a: (T | null | undefined)[] | undefined, i: number) => a?.[i] != null && a[i] !== undefined;

export function checkOrderReadiness(
  pages: readonly AlbumPage[],
  templateOf: (id: string) => PageTemplate | undefined = getTemplateById,
): OrderReadiness {
  const r: OrderReadiness = { emptyFrames: 0, emptyBoxes: 0, placeholderTexts: 0, blankPages: 0, firstPage: null };
  pages.forEach((page, idx) => {
    const t = page.templateId ? templateOf(page.templateId) : undefined;
    let issues = 0;
    // Photo frames: a slot shows nothing when no photo, QR, text or ornament claims it.
    const slots = t?.slots ?? (page.slotFills ?? []).map(() => ({ kind: 'photo' as const }));
    let shown = 0;
    slots.forEach((slot, i) => {
      const claimed = has(page.slotFills, i) || has(page.qrFills, i) || has(page.slotTexts, i) || has(page.ornamentFills, i);
      if (claimed) { shown++; return; }
      if (!slot.kind || slot.kind === 'photo') { r.emptyFrames++; issues++; }
    });
    // Combo / caption boxes.
    const boxes = t?.textSlots?.length ?? 0;
    for (let j = 0; j < boxes; j++) {
      const occupied = page.textElements?.some((x) => x.boxIndex === j)
        || has(page.textSlotFills, j) || !!page.textSlotQr?.[j] || !!page.textSlotOrnament?.[j];
      if (occupied) shown++;
      else { r.emptyBoxes++; issues++; }
    }
    // Free text still saying the placeholder.
    for (const el of page.textElements ?? []) {
      if ((el.text ?? '').trim() === PLACEHOLDER_TEXT) { r.placeholderTexts++; issues++; }
      else if ((el.text ?? '').trim() && el.boxIndex == null) shown++;
    }
    if ((page.photos?.length ?? 0) > 0 || (page.stickers?.length ?? 0) > 0) shown++;
    if (shown === 0) { r.blankPages++; issues++; }
    if (issues > 0 && r.firstPage == null) r.firstPage = idx;
  });
  return r;
}

/** A front cover with nothing on it: no photo, no title or other text, no
 *  graphic — it prints as a plain sheet (1-star testers round 2: "Album goes to
 *  print with a totally blank white cover (no title) and no warning"). */
export function coverIsBlank(cover: AlbumPage | null | undefined): boolean {
  if (!cover) return false;
  if (cover.background?.type === 'image' && cover.background.image) return false;
  if ((cover.slotFills ?? []).some((f) => f != null) || (cover.textSlotFills ?? []).some((f) => f != null)) return false;
  if ((cover.textElements ?? []).some((t) => (t.text ?? '').trim() && (t.text ?? '').trim() !== PLACEHOLDER_TEXT)) return false;
  if ((cover.stickers?.length ?? 0) > 0 || (cover.photos?.length ?? 0) > 0) return false;
  if ((cover.ornamentFills ?? []).some(Boolean) || (cover.textSlotOrnament ?? []).some(Boolean)) return false;
  return true;
}

export const BLANK_COVER_MESSAGE = 'Your front cover is blank: no title or photo on it.';

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The warning, or null when everything on the pages will print as shown. */
export function readinessMessage(r: OrderReadiness): string | null {
  const parts: string[] = [];
  if (r.blankPages) parts.push(n(r.blankPages, 'blank page', 'blank pages'));
  if (r.emptyFrames) parts.push(n(r.emptyFrames, 'empty photo frame', 'empty photo frames'));
  // Empty caption boxes are NOT listed: an empty box prints as open space by
  // design (the quote cadence keeps about half of them empty), so warning on
  // them would flag nearly every album with something nobody needs to fix.
  if (r.placeholderTexts) parts.push(n(r.placeholderTexts, `text still saying "${PLACEHOLDER_TEXT}"`, `texts still saying "${PLACEHOLDER_TEXT}"`));
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Before you order: your album has ${list}. They print exactly as they look.`;
}
