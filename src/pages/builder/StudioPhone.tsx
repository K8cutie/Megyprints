import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { AlbumPage, UploadedPhoto, TemplateSlot, OrnamentTransform } from './types';
import type { GuardReason } from './slotGeometry';
import { slotRectPx } from './studioPhoneGeom';
import { applyMask, MASKS, TEXTURE_BITE, type MaskId } from './masks';
import { LOOKS, lookCss, type LookId } from './looks';
import { slotShapeStyle } from './slotShapeStyle';
import { pageInches } from './stickers';

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO ON THE PHONE (owner, 2026-09-13: "I want to see the mobile version").
   Not a squeezed desktop: the page stays the hero, tools live on the thing
   you tap. Tap a photo → a pill (Mask · Filter); each opens a bottom sheet
   of THUMBNAILS of that very photo, so you pick by eye. (Owner, 2026-10-07:
   "Look" became Filter — the code still calls a filter a look, see looks.ts
   — and the one-tap "Worn" preset was removed: brushed edge is in Mask,
   Faded is in Filter.) Stickers
   are retired (owner, 2026-10-01) — none can be added — but a placed one
   still shows and prints: tap it → a pill with 1 mm nudge arrows and Remove;
   drag it with a finger, pinch to resize. Every change goes through the same
   setters the desktop uses, so the same guardrails and three renderers apply.
   ══════════════════════════════════════════════════════════════════════════ */

const THUMB = 84;

/* ── The pill above a tapped photo ───────────────────────────────────────── */
const PILL_GAP = 4; // px the pill keeps from the page's left and right edges
function Pill({ left, top, W, children, onClose, testid }: { left: number; top: number; W: number; children: ReactNode; onClose: () => void; testid: string }) {
  // Centred on `left`, but never past either page edge: translate percentages
  // are the pill's OWN width, so CSS clamps it without measuring — a guessed
  // half-width clipped "Mask" once the words got longer (2026-10-07).
  return (
    <div data-testid={testid} className="absolute z-30 flex items-center gap-1 rounded-full bg-dark text-warm-white shadow-xl px-1.5 py-1"
      style={{ left, top, transform: `translateX(clamp(${PILL_GAP - left}px, -50%, calc(${W - PILL_GAP - left}px - 100%)))` }}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {children}
      <button type="button" aria-label="Close" onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-warm-white/70"><X size={14} /></button>
    </div>
  );
}
const pillBtn = 'px-2.5 h-7 rounded-full text-[11px] font-bold whitespace-nowrap active:bg-white/15';

/* ── Bottom sheet of thumbnails: masks or looks for one photo ────────────── */
export function StudioSheet({ kind, photo, currentMask, currentLook, onPickMask, onPickLook, onClose }: {
  kind: 'mask' | 'look';
  photo: UploadedPhoto | undefined;
  currentMask: MaskId | 'none';
  currentLook: LookId | 'none';
  onPickMask: (id: MaskId | 'none') => void;
  onPickLook: (id: LookId | 'none') => void;
  onClose: () => void;
}) {
  const baseSlot = { id: 'thumb', x: 0, y: 0, width: 1, height: 1, ratio: '1:1' } as unknown as TemplateSlot;
  const thumb = (mask: MaskId | 'none', look: LookId | 'none') => {
    const applied = applyMask(baseSlot, mask === 'none' ? null : mask);
    const sh = slotShapeStyle(applied, THUMB, THUMB);
    return (
      <div style={{ width: THUMB, height: THUMB, position: 'relative' }}>
        <div style={{ position: 'absolute', left: sh.leftOffset, top: sh.topOffset, width: sh.width, height: sh.height, overflow: 'hidden', background: '#EFE4D2', ...sh.style } as CSSProperties}>
          {photo && <img src={photo.previewUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: look === 'none' ? undefined : lookCss(look) }} />}
        </div>
      </div>
    );
  };
  const items: { id: string; label: string; node: ReactNode; active: boolean; onPick: () => void }[] = kind === 'mask'
    ? MASKS.map((m) => ({ id: m.id, label: m.label, node: thumb(m.id, currentLook), active: currentMask === m.id, onPick: () => onPickMask(m.id) }))
    : [{ id: 'none', label: 'Original', node: thumb(currentMask, 'none'), active: currentLook === 'none', onPick: () => onPickLook('none') },
       ...LOOKS.map((l) => ({ id: l.id, label: l.label, node: thumb(currentMask, l.id), active: currentLook === l.id, onPick: () => onPickLook(l.id) }))];
  return (
    <AnimatePresence>
      <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-black/30 flex items-end" onClick={onClose} data-testid={`studio-sheet-${kind}`}>
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="w-full bg-white rounded-t-2xl pb-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="text-sm font-semibold text-dark">{kind === 'mask' ? 'Mask' : 'Filter'}</span>
            <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
            {items.map((it) => (
              <button key={it.id} type="button" onClick={it.onPick} data-testid={`${kind}-${it.id}`} aria-pressed={it.active}
                className="shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <div className={`rounded-xl p-1 ${it.active ? 'ring-2 ring-blush-pink bg-blush' : 'ring-1 ring-line'}`}>{it.node}</div>
                <span className={`text-[11px] font-semibold ${it.active ? 'text-blush-pink' : 'text-cocoa'}`}>{it.label}</span>
              </button>
            ))}
          </div>
          {kind === 'mask' && (
            <p className="px-4 pt-2 text-[11px] text-light">Brushed, Deckle and Frost bite up to {Math.round(TEXTURE_BITE * 100)}% in from each side — keep faces away from the edge.</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── The layer over the page: the photo pill, the sticker hit areas + pill ── */
export function StudioLayer({ page, pageIndex, W, H, albumSize, selectedSlot, onSelectSlot, selectedSticker, onSelectSticker, onOpenSheet, onStickerGeom, onStickerRemove }: {
  page: AlbumPage;
  pageIndex: number;
  W: number; H: number;
  albumSize: string;
  selectedSlot: number | null;
  onSelectSlot: (i: number | null) => void;
  selectedSticker: string | null;
  onSelectSticker: (uid: string | null) => void;
  onOpenSheet: (kind: 'mask' | 'look') => void;
  onStickerGeom: (uid: string, geom: OrnamentTransform) => GuardReason[];
  onStickerRemove: (uid: string) => void;
}) {
  const rect = selectedSlot != null ? slotRectPx(page, pageIndex, selectedSlot, W, H, albumSize) : null;
  const pillTop = rect ? (rect.top > 48 ? rect.top - 44 : rect.top + 8) : 0;
  const pillLeft = rect ? rect.left + rect.width / 2 : 0;

  /* sticker drag / pinch — live geometry while the finger is down, committed on release */
  const [live, setLive] = useState<{ uid: string; geom: OrnamentTransform } | null>(null);
  const gesture = useRef<{ uid: string; start: OrnamentTransform; pointers: Map<number, { x: number; y: number }>; startDist: number; moved: boolean } | null>(null);
  const inch = pageInches(albumSize);
  const mm = { x: (1 / 25.4) / inch.w, y: (1 / 25.4) / inch.h }; // one millimetre, as page fractions

  const onDown = (e: ReactPointerEvent, uid: string, geom: OrnamentTransform) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const g = gesture.current && gesture.current.uid === uid ? gesture.current : { uid, start: geom, pointers: new Map(), startDist: 0, moved: false };
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.start = live && live.uid === uid ? live.geom : geom;
    }
    gesture.current = g;
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    e.stopPropagation();
    const before = g.pointers.get(e.pointerId)!;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size >= 2 && g.startDist > 0) {
      const [a, b] = [...g.pointers.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / g.startDist;
      g.moved = true;
      setLive({ uid: g.uid, geom: { ...g.start, w: g.start.w * k, h: g.start.h * k } });
    } else {
      const dx = (e.clientX - before.x) / W, dy = (e.clientY - before.y) / H;
      if (Math.abs(dx) + Math.abs(dy) > 0.002) g.moved = true;
      const cur = live && live.uid === g.uid ? live.geom : g.start;
      setLive({ uid: g.uid, geom: { ...cur, cx: cur.cx + dx, cy: cur.cy + dy } });
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    e.stopPropagation();
    g.pointers.delete(e.pointerId);
    if (g.pointers.size > 0) return;
    gesture.current = null;
    if (g.moved && live && live.uid === g.uid) onStickerGeom(g.uid, live.geom);
    else if (!g.moved) { onSelectSticker(g.uid); onSelectSlot(null); }
    setLive(null);
  };
  useEffect(() => { if (selectedSticker && !page.stickers?.some((k) => k.uid === selectedSticker)) onSelectSticker(null); }, [page.stickers, selectedSticker, onSelectSticker]);

  const nudge = (uid: string, dx: number, dy: number) => {
    const k = page.stickers?.find((s) => s.uid === uid);
    if (k) onStickerGeom(uid, { ...k.geom, cx: k.geom.cx + dx, cy: k.geom.cy + dy });
  };
  const selSticker = selectedSticker ? page.stickers?.find((k) => k.uid === selectedSticker) : null;

  return (
    <>
      {/* sticker hit areas (the graphics themselves are drawn by PageView) */}
      {page.stickers?.map((k) => {
        const g = live && live.uid === k.uid ? live.geom : k.geom;
        const w = g.w * W, h = g.h * H;
        return (
          <div key={k.uid} data-testid={`sticker-${k.uid}`} className="absolute z-20"
            style={{ left: g.cx * W - w / 2, top: g.cy * H - h / 2, width: w, height: h, transform: g.rot ? `rotate(${g.rot}deg)` : undefined, touchAction: 'none',
              outline: selectedSticker === k.uid ? '2px solid #1F6F8B' : undefined, outlineOffset: 2, cursor: 'grab' }}
            onPointerDown={(e) => onDown(e, k.uid, k.geom)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        );
      })}
      {live && (
        <div className="absolute z-20 pointer-events-none" style={{ left: live.geom.cx * W - (live.geom.w * W) / 2, top: live.geom.cy * H - (live.geom.h * H) / 2, width: live.geom.w * W, height: live.geom.h * H, transform: live.geom.rot ? `rotate(${live.geom.rot}deg)` : undefined, outline: '2px dashed #1F6F8B' }} />
      )}

      {/* the photo pill */}
      {rect && selectedSlot != null && (
        <Pill left={pillLeft} top={pillTop} W={W} onClose={() => onSelectSlot(null)} testid="studio-pill">
          <button type="button" className={pillBtn} onClick={() => onOpenSheet('mask')} data-testid="pill-mask">Mask</button>
          <button type="button" className={pillBtn} onClick={() => onOpenSheet('look')} data-testid="pill-filter">Filter</button>        </Pill>
      )}

      {/* the sticker pill */}
      {selSticker && (
        <Pill left={selSticker.geom.cx * W} W={W} top={Math.max(8, selSticker.geom.cy * H - (selSticker.geom.h * H) / 2 - 44)} onClose={() => onSelectSticker(null)} testid="sticker-pill">
          <button type="button" aria-label="Nudge left" className="w-7 h-7 rounded-full flex items-center justify-center active:bg-white/15" onClick={() => nudge(selSticker.uid, -mm.x, 0)}><ChevronLeft size={14} /></button>
          <button type="button" aria-label="Nudge up" className="w-7 h-7 rounded-full flex items-center justify-center active:bg-white/15" onClick={() => nudge(selSticker.uid, 0, -mm.y)}><ChevronUp size={14} /></button>
          <button type="button" aria-label="Nudge down" className="w-7 h-7 rounded-full flex items-center justify-center active:bg-white/15" onClick={() => nudge(selSticker.uid, 0, mm.y)}><ChevronDown size={14} /></button>
          <button type="button" aria-label="Nudge right" className="w-7 h-7 rounded-full flex items-center justify-center active:bg-white/15" onClick={() => nudge(selSticker.uid, mm.x, 0)}><ChevronRight size={14} /></button>
          <button type="button" className={pillBtn + ' flex items-center gap-1 text-red-300'} onClick={() => onStickerRemove(selSticker.uid)} data-testid="sticker-remove"><Trash2 size={12} /></button>
        </Pill>
      )}
    </>
  );
}
