import type { AlbumSizePreset } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   SIZES WE NO LONGER MAKE — 9×9 removed (owner, 2026-10-24).

   An album saved at 9×9 opens as 8×8. It is the same square page, and both
   sizes draw on the same 750-px design canvas (getCanvasDimensions), so every
   text box, photo pan and studio frame carries across unchanged — only the
   layout ids name the size. Every 9×9 layout has an 8×8 twin with the same
   photos and boxes (retiredSizes.spec walks all 136 that existed), so a page
   keeps its layout and its photos.

   Applied wherever a saved album comes back in: the device draft, the cloud
   row (deserializeAlbum), checkout's draft and print-job rebuild. The
   database moved its 9x9 rows to 8x8 in 0053 and refuses a new 9x9 order.
   ══════════════════════════════════════════════════════════════════════════ */

/** A size we no longer make → the size its albums open as. 0053 refuses an
 *  order at each of these (retiredSizes.spec holds the two in step). */
export const RETIRED_SIZES: Record<string, AlbumSizePreset> = { '9x9': '8x8' };

/** Old hand-made 9×9 layouts whose 8×8 number belongs to another layout. */
const ODD_TWINS: Record<string, string> = {
  't9x9-21': 't8x8-22',              // the same 2×3 grid
  't9x9-22': 't88-fb-sq-box-br-gap', // three photos + a box (wide trio, long retired)
};

/** The size a saved album opens as: its own, or the stand-in for a size we
 *  no longer make. */
export function liveAlbumSize<S extends string | null | undefined>(size: S): S | AlbumSizePreset {
  return (size && RETIRED_SIZES[size]) || size;
}

/** The 8×8 twin of a 9×9 layout id; any other id comes back as it is. */
export function liveTemplateId(id: string): string {
  return ODD_TWINS[id] ?? id
    .replace(/^t99-/, 't88-')
    .replace(/^tqr-99$/, 'tqr-88')
    .replace(/^t9x9-/, 't8x8-')
    .replace(/^(gap|qr-badge)-9x9-/, '$1-8x8-')
    .replace(/^(tile-.+)-9x9$/, '$1-8x8');
}

type StoredPage = { templateId?: string | null; template_id?: string | null; size?: string };

/** A saved page moved off a size we no longer make (its size and layout id).
 *  The SAME object when nothing changed. */
export function liftRetiredPage<T>(page: T): T {
  if (!page || typeof page !== 'object') return page;
  const p = page as T & StoredPage;
  const next: StoredPage = {};
  if (typeof p.size === 'string' && RETIRED_SIZES[p.size]) next.size = RETIRED_SIZES[p.size];
  if (typeof p.templateId === 'string' && liveTemplateId(p.templateId) !== p.templateId) next.templateId = liveTemplateId(p.templateId);
  if (typeof p.template_id === 'string' && liveTemplateId(p.template_id) !== p.template_id) next.template_id = liveTemplateId(p.template_id);
  return Object.keys(next).length ? { ...p, ...next } : page;
}

/** liftRetiredPage over an album's pages. The SAME array when nothing
 *  changed, so callers can skip a state update. */
export function liftRetiredPages<T>(pages: T[]): T[] {
  let changed = false;
  const out = pages.map((p) => {
    const n = liftRetiredPage(p);
    if (n !== p) changed = true;
    return n;
  });
  return changed ? out : pages;
}
