/* ══════════════════════════════════════════════════════════════════════════
   OrderedAlbumNote — this album was already ordered, and that order prints it
   as it was then. A returning customer reopened an ordered album, added 4
   photos, and nothing said "this album is in order MP-…" or whether the edits
   would change the book being printed (1-star testers round 2, the returning
   customer). Said once per visit; "Got it" puts it away.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import type { BuilderContextValue } from './BuilderContext';
import { lastOrderForAlbum, type LastFinish } from '../../lib/myOrders';

const seenKey = (albumId: string) => `megy-ordered-note-${albumId}`;

export default function OrderedAlbumNote({ actions }: { actions: BuilderContextValue }) {
  const userId = actions.user?.id;
  const albumId = actions.getAlbumId();
  const [order, setOrder] = useState<(LastFinish & { albumId: string }) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void (userId && albumId ? lastOrderForAlbum(userId, albumId) : Promise.resolve(null))
      .then((o) => { if (alive) setOrder(o && albumId ? { ...o, albumId } : null); });
    return () => { alive = false; };
    // The album on screen can change without a new id prop: its name follows it.
  }, [userId, albumId, actions.albumTitle]);

  if (!order || order.albumId !== albumId) return null;
  let seen = false;
  try { seen = sessionStorage.getItem(seenKey(order.albumId)) === '1'; } catch { /* private mode */ }
  if (seen) return null;
  const gotIt = () => {
    try { sessionStorage.setItem(seenKey(order.albumId), '1'); } catch { /* private mode */ }
    setTick((n) => n + 1);
  };
  return (
    <div role="status" data-testid="ordered-album-note"
      className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#EEF3FA] border-b border-[#CCDAEE] text-xs text-[#2E4A6B]">
      <span className="flex-1 min-w-[14rem]">
        You ordered this album (<span className="font-mono">{order.order_number}</span>). That order prints the album as it was when you ordered it, so changes you make now go into a new order.
      </span>
      <button type="button" onClick={gotIt} data-testid="ordered-album-note-ok"
        className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#CCDAEE] font-semibold hover:bg-[#E2EBF7]">
        Got it
      </button>
    </div>
  );
}
