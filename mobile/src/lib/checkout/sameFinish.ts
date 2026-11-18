/* ══════════════════════════════════════════════════════════════════════════
   A SECOND COPY STARTS FROM THE FIRST: the album's last order's paper and
   cover (1-star testers round 2, RC-1: a second copy opened on Matte +
   Softcover, a different book from the one being copied). The website's
   rule (src/pages/Order.tsx, lastOrderForAlbum + prefillPlan): only when
   checkout had no form of its own to bring back, only into a finish still
   untouched (the defaults), and only a paper and cover still sold. Its words
   are the website's; test/sameFinish.test.ts holds them to its source.
   ══════════════════════════════════════════════════════════════════════════ */
import type { LastFinish } from '@web/lib/myOrdersCloud';
import { COVERS, MATERIALS, type CoverType, type MaterialType } from '@web/pages/builder/types';

export interface CopiedFinish { material: MaterialType; cover: CoverType; from: string }

/** The finish to start this checkout on, or null (keep what is there). */
export function finishToCopy(
  last: LastFinish | null,
  now: { material: string; cover: string },
  defaults: { material: string; cover: string },
): CopiedFinish | null {
  if (!last) return null;
  if (now.material !== defaults.material || now.cover !== defaults.cover) return null;
  const material = MATERIALS.find((m) => m.type === last.material)?.type;
  const cover = COVERS.find((c) => c.type === last.cover)?.type;
  if (!material || !cover) return null;
  return { material, cover, from: last.order_number };
}

/** Said above the paper while the finish is still the copied one. */
export function sameFinishNote(orderNumber: string): string {
  return `Same paper and cover as your last order of this album (${orderNumber}). Change them below if you like.`;
}
