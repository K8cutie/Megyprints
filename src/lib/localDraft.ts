/* ══════════════════════════════════════════════════════════════════════════
   localDraft — the album in progress, as saved on THIS device.

   The builder (useBuilderState) writes it; the "resume where you left off?"
   prompt reads it. It lives here, not in the builder, so the prompt can check
   it from any page without pulling the builder chunk (face-api + tfjs) into
   the main bundle.
   ══════════════════════════════════════════════════════════════════════════ */

export const DRAFT_STORAGE_KEY = 'megy-album-v5';

interface DraftPageLike {
  photos?: unknown[];
  slotFills?: (number | null)[];
  textElements?: unknown[];
}

interface DraftLike {
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

export interface LocalDraftSummary {
  title: string;
  albumId?: string;
  accountId: string | null;
  photoCount: number;
  /** When the album was last changed on this device (ms), 0 if unknown. */
  editedAt: number;
  hasContent: boolean;
}

/** The draft on this device, or null when there is none worth resuming. */
export function readLocalDraftSummary(): LocalDraftSummary | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftLike & {
      title?: string; albumId?: string; accountId?: string | null; editedAt?: number;
    };
    const hasContent = draftHasContent(d);
    const title = typeof d.title === 'string' ? d.title : '';
    if (!hasContent && !title.trim()) return null;
    return {
      title,
      albumId: typeof d.albumId === 'string' ? d.albumId : undefined,
      accountId: typeof d.accountId === 'string' ? d.accountId : null,
      photoCount: d.uploadedPhotos?.length ?? 0,
      editedAt: typeof d.editedAt === 'number' ? d.editedAt : 0,
      hasContent,
    };
  } catch {
    return null;
  }
}
