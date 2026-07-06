// ──────────────────────────────────────────────────────────────────────────
// Page normalization — the SINGLE source of truth for coalescing a stored
// page object (Supabase JSONB, which may persist camelCase fields as
// snake_case) back into the builder's AlbumPage shape.
//
// Both the live builder (useBuilderState.normalizePage) and the durable
// print-job rebuild (printJobRebuild.normalizeStoredPage) need the exact same
// coalescing so a rebuilt page carries the identical fills/QR/text the
// renderers expect. Keep it here, in one place, so the two can never drift.
// ──────────────────────────────────────────────────────────────────────────

/** Coalesce snake_case / camelCase JSONB fields of a stored page into the
 *  builder AlbumPage field shape. Returns a plain object spread over the
 *  original `p` — callers apply their own trivial defaults (e.g. templateId
 *  null vs undefined) and cast to AlbumPage. Non-object input is returned
 *  untouched so callers can early-return it. */
export function normalizeStoredPageFields(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const get = (camel: string, snake: string) => {
    if (p[camel] !== undefined) return p[camel];
    if (p[snake] !== undefined) return p[snake];
    return undefined;
  };
  // Ornaments (photo-slot AND caption-box) carry a rendered PNG data-URL. This is
  // the UNTRUSTED cloud boundary, so drop any entry whose pngDataUrl isn't a local
  // `data:image/…` URI — a tampered row can't turn an ornament into an external
  // beacon or a foreign image load.
  const sanitizeOrn = (raw: any) => (Array.isArray(raw)
    ? raw.map((o: any) => (o && typeof o.pngDataUrl === 'string' && o.pngDataUrl.startsWith('data:image/') ? o : null))
    : []);
  const ornamentFills = sanitizeOrn(get('ornamentFills', 'ornament_fills') ?? []);
  const textSlotOrnament = sanitizeOrn(get('textSlotOrnament', 'text_slot_ornament') ?? []);
  return {
    ...p,
    slotFills: get('slotFills', 'slot_fills') ?? [],
    slotScales: get('slotScales', 'slot_scales') ?? [],
    slotOffsetsX: get('slotOffsetsX', 'slot_offsets_x') ?? [],
    slotOffsetsY: get('slotOffsetsY', 'slot_offsets_y') ?? [],
    slotGeometries: get('slotGeometries', 'slot_geometries') ?? [],
    qrFills: get('qrFills', 'qr_fills') ?? [],
    slotTexts: get('slotTexts', 'slot_texts') ?? [],
    ornamentFills,
    textSlotFills: get('textSlotFills', 'text_slot_fills') ?? [],
    textSlotQr: get('textSlotQr', 'text_slot_qr') ?? [],
    textSlotOrnament,
    textElements: get('textElements', 'text_elements') ?? [],
    photos: p.photos ?? [],
    background: p.background ?? { type: 'solid', solid: '#FFFBF7' },
    layout: p.layout ?? 'freeform',
  };
}
