/* ══════════════════════════════════════════════════════════════════════════
   localDraftRules — the album in progress as saved on a device: the name it
   is saved under and whether it holds real work. The part of localDraft.ts
   that needs no browser, so the 2.0 app's album builder (useBuilderState)
   saves its draft the same way (src/shared/sharedModules.ts). Moved here
   unchanged; localDraft.ts re-exports it and keeps the readers of this
   browser's own draft (localStorage).
   ══════════════════════════════════════════════════════════════════════════ */

export const DRAFT_STORAGE_KEY = 'megy-album-v5';

interface DraftPageLike {
  photos?: unknown[];
  slotFills?: (number | null)[];
  textElements?: unknown[];
}

export interface DraftLike {
  uploadedPhotos?: unknown[];
  albumPages?: DraftPageLike[];
}

/** Whether a draft holds real work: photos, or anything placed on a page. */
export function draftHasContent(d: DraftLike | null | undefined): boolean {
  if (!d) return false;
  if ((d.uploadedPhotos?.length ?? 0) > 0) return true;
  return (d.albumPages ?? []).some((p) =>
    (p.photos?.length ?? 0) > 0
    || (p.slotFills?.some((f) => f !== null) ?? false)
    || (p.textElements?.length ?? 0) > 0,
  );
}
