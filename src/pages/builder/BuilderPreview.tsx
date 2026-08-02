import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ShoppingCart, Plus, Trash2, RotateCw } from 'lucide-react';
import { useIsMobile, useIsPortrait } from '../../hooks/use-mobile';
import type { UploadedPhoto, AlbumPage, AlbumSizePreset, OrnamentTransform } from './types';
import { CORNER_POSITIONS, cornerImageUrl, resolveBgImageSrc, frameStyleToCss } from './types';
import { dedupeSlotFills } from './slotUtils';
import { setPendingPrintJob } from '../../lib/printQueue';
import { getCanvasDimensions } from './layouts';
import { getTemplateById } from './pageTemplates';
import { slotShapeStyle } from './slotShapeStyle';
import { PREVIEW_DIMS } from './PreviewSizeConstants';
import { bindingMarginFraction, bindingEdge, marginForTemplate } from './binding';
import { useBuilderContext } from './BuilderContext';
import MobileTextEditor, { type BoxTextContent } from './MobileTextEditor';
import AddQrModal from './AddQrModal';
import CoverEditor from './CoverEditor';
import type { QrFill } from './types';
import { qrRect } from '../../lib/qrMemory';
import { ornamentFit } from './ornaments';
import { wordArtDomStyle } from './wordArt';
import { textureDataUri, TEXTURE_TILE_PX } from './textures';

/* ══════════════════════════════════════════════════════════════════════════
   BuilderPreview — Spread-only view with side arrows
   ══════════════════════════════════════════════════════════════════════════ */

interface BuilderPreviewProps {
  pages: AlbumPage[];
  currentIndex: number;
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  getPageSnapshot: (pageId: string) => string | undefined;
  onGoToPage: (index: number) => void;
  onBack: () => void;
  onOrder: () => void;
}

function backgroundToCss(bg: any, photos: UploadedPhoto[] = [], coverMode = false): React.CSSProperties {
  if (!bg) return {};
  switch (bg.type) {
    case 'solid': return { backgroundColor: bg.solid || '#FFFBF7' };
    case 'gradient': {
      const g = bg.gradient;
      if (!g) return { backgroundColor: '#FFFBF7' };
      // Handle both formats:
      // Sidebar: { colors: [{ color, position }], direction: 'radial' | 'to bottom' }
      // Wizard:  { type: 'linear', angle: 135, stops: [{ offset, color }] }
      if (g.stops) {
        // Wizard format — honor radial vs linear
        const stops = g.stops.map((s: any) => `${s.color} ${(s.offset ?? 0) * 100}%`).join(', ');
        return { background: g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 135}deg, ${stops})` };
      }
      if (g.colors) {
        // Sidebar format
        const dir = g.direction === 'radial' ? 'circle' : g.direction || 'to bottom';
        const stops = g.colors.map((c: any) => `${c.color} ${c.position}%`).join(', ');
        return { background: g.direction === 'radial' ? `radial-gradient(${stops})` : `linear-gradient(${dir}, ${stops})` };
      }
      return { backgroundColor: '#FFFBF7' };
    }
    case 'image': {
      // BackgroundDesigner stores the value in `bg.image` (a blob URL for
      // uploads, or a CSS gradient string for the built-in presets) — or, for a
      // user photo, a `photoId` we re-resolve to a live URL from the photos.
      const img = resolveBgImageSrc(bg, photos);
      if (!img) return { backgroundColor: '#FFFBF7' };
      if (String(img).includes('gradient(')) return { background: img };
      // COVER panels honour the focal point + zoom (a cover can't be ratio-matched
      // the way interior slots are, so the user picks what shows). `cover` +
      // `background-position: fx% fy%` is exactly bgCoverFit's math, and the zoom
      // scale is taken about the same focal point so print matches. Interior pages
      // keep the original centred crop, untouched.
      if (coverMode) {
        const fx = Math.max(0, Math.min(1, bg.focusX ?? 0.5));
        const fy = Math.max(0, Math.min(1, bg.focusY ?? 0.5));
        const z = Math.max(1, bg.zoom ?? 1);
        return {
          backgroundImage: `url("${img}")`,
          backgroundSize: 'cover',
          backgroundPosition: `${fx * 100}% ${fy * 100}%`,
          backgroundRepeat: 'no-repeat',
          ...(z > 1 ? { transform: `scale(${z})`, transformOrigin: `${fx * 100}% ${fy * 100}%` } : {}),
        };
      }
      return { backgroundImage: `url("${img}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    case 'texture': {
      // Material texture — a procedural, tileable SVG data URI (leather, linen,
      // …). Opacity is applied by the wrapping layer div (see PageView) so we do
      // NOT bake it in here → screen/print parity. Tiled at the shared px size.
      return {
        backgroundImage: `url("${textureDataUri(bg.texture, bg.textureColor)}")`,
        backgroundSize: `${TEXTURE_TILE_PX}px ${TEXTURE_TILE_PX}px`,
        backgroundRepeat: 'repeat',
      };
    }
    default: return { backgroundColor: '#FFFBF7' };
  }
}

/** Empty-slot "content chooser" affordance — the tappable dashed box that
 *  either spells out "Click to add: Photo/Text/QR" (when the 3-way chooser is
 *  wired and the cell is big enough) or falls back to a bare "+" bubble.
 *  ONE definition shared by photo slots AND caption boxes so the two never
 *  drift (previously copy-pasted, which the duplication gate flagged). */
function EmptyChooserBox({ rectKey, left, top, width, height, sx, showList, options, onTap, zIndex }: {
  rectKey: string; left: number; top: number; width: number; height: number;
  sx: number; showList: boolean; options: string[]; onTap: () => void; zIndex: number;
}) {
  const cell = Math.min(width, height);
  const fs = Math.max(12, Math.min(28, cell * 0.15));
  return (
    <div key={rectKey} className="absolute flex flex-col items-center justify-center text-center"
      onClick={(e) => { e.stopPropagation(); onTap(); }}
      style={{
        zIndex, left, top, width, height,
        border: '2px dashed rgba(232,165,152,0.9)', borderRadius: 10,
        background: 'rgba(253,232,228,0.5)', cursor: 'pointer', boxSizing: 'border-box',
        color: '#A0562F', padding: 6, gap: `${5 * sx}px`, overflow: 'hidden',
      }}>
      {showList ? (
        <>
          <span style={{ fontWeight: 800, fontSize: fs * 1.15, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>Click to add:</span>
          <div style={{ fontSize: fs, fontWeight: 700, lineHeight: 1.5, textAlign: 'left' }}>
            {options.map((o) => <div key={o}>•&nbsp; {o}</div>)}
          </div>
        </>
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: '#F4C2A1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(232,165,152,0.55)',
        }}>
          <Plus size={26} color="white" />
        </div>
      )}
    </div>
  );
}

/** QR living-memory square — white backing + the QR png, sized/positioned via
 *  qrRect() inside a cell. Shared by photo slots AND caption boxes. */
function QrSquare({ rectKey, cellLeft, cellTop, cellW, cellH, dataUrl, onTap, zIndex, transform, pageW, pageH }: {
  rectKey: string; cellLeft: number; cellTop: number; cellW: number; cellH: number;
  dataUrl: string; onTap?: () => void; zIndex: number;
  /** Free-transform for a dragged/resized/rotated caption-box QR (center-based
   *  page fractions, already clamped square + scannable by clampQrGeom). When
   *  present it overrides the in-box fit; needs pageW/pageH. */
  transform?: OrnamentTransform | null; pageW?: number; pageH?: number;
}) {
  // The white backing IS the quiet zone — it travels with the code at every size.
  if (transform && pageW && pageH) {
    const w = transform.w * pageW;
    const h = transform.h * pageH;
    return (
      <div key={rectKey} className="absolute"
        onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        style={{
          zIndex, left: transform.cx * pageW - w / 2, top: transform.cy * pageH - h / 2, width: w, height: h,
          transform: transform.rot ? `rotate(${transform.rot}deg)` : undefined, transformOrigin: 'center center',
          background: '#fff', cursor: onTap ? 'pointer' : undefined,
        }}>
        <img src={dataUrl} alt="QR memory" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    );
  }
  const { dx, dy, side } = qrRect(cellLeft, cellTop, cellW, cellH);
  return (
    <div key={rectKey} className="absolute"
      onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
      style={{ zIndex, left: dx, top: dy, width: side, height: side, background: '#fff', cursor: onTap ? 'pointer' : undefined }}>
      <img src={dataUrl} alt="QR memory" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}

/** Ornament square — the ornament PNG contained (with breathing-room padding)
 *  inside a cell, sized/positioned via ornamentFit(). Transparent (no backing) so
 *  it reads as a decorative accent on the page. Shares geometry with Fabric + print. */
function OrnamentSquare({ rectKey, cellLeft, cellTop, cellW, cellH, dataUrl, onTap, zIndex, transform, pageW, pageH }: {
  rectKey: string; cellLeft: number; cellTop: number; cellW: number; cellH: number;
  dataUrl: string; onTap?: () => void; zIndex: number;
  /** Free-transform for a dragged/resized/rotated graphic (center-based page
   *  fractions). When present it overrides the in-box fit; needs pageW/pageH. */
  transform?: OrnamentTransform | null; pageW?: number; pageH?: number;
}) {
  if (transform && pageW && pageH) {
    const w = transform.w * pageW;
    const h = transform.h * pageH;
    return (
      <div key={rectKey} className="absolute"
        onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        style={{
          zIndex, left: transform.cx * pageW - w / 2, top: transform.cy * pageH - h / 2, width: w, height: h,
          transform: transform.rot ? `rotate(${transform.rot}deg)` : undefined, transformOrigin: 'center center',
          cursor: onTap ? 'pointer' : undefined,
        }}>
        <img src={dataUrl} alt="Ornament" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    );
  }
  const { dx, dy, side } = ornamentFit(cellLeft, cellTop, cellW, cellH);
  return (
    <div key={rectKey} className="absolute"
      onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
      style={{ zIndex, left: dx, top: dy, width: side, height: side, cursor: onTap ? 'pointer' : undefined }}>
      <img src={dataUrl} alt="Ornament" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}

/** Page renderer — always renders from LIVE page data so Preview matches the
 *  real pages. (Cached canvas snapshots were unreliable: only captured for
 *  pages the user had visited, saved via a delayed callback that could attach
 *  to the wrong page during navigation, and kept stale across regeneration —
 *  which made two different pages show the same image.) */
export function PageView({ page, photos, singleW, H, pageIndex, onSlotTap, onTextSlotTap, onTextTap, onQrSlotTap, onOrnamentSlotTap, onSlotTextTap, onChooseSlot, editable, onAddToSlot, onRemoveFromSlot, onChooseTextSlot, onTextSlotPhotoTap, onTextSlotQrTap, onTextSlotOrnamentTap, coverMode }: {
  page: AlbumPage; photos: UploadedPhoto[]; singleW: number; H: number; pageIndex: number;
  onSlotTap?: (slotIndex: number) => void;
  onTextSlotTap?: (slotIndex: number) => void;
  /** Tap a FREE text element (e.g. the auto-placed theme title) to edit it by id. */
  onTextTap?: (id: string) => void;
  /** Tap a QR living-memory slot (empty → add; filled → edit). Present only in editable contexts. */
  onQrSlotTap?: (slotIndex: number) => void;
  /** Tap a filled ornament slot → re-open the ornament picker. Present only in editable contexts. */
  onOrnamentSlotTap?: (slotIndex: number) => void;
  /** Tap a filled per-slot TEXT to re-open its editor. Present only in editable contexts. */
  onSlotTextTap?: (slotIndex: number) => void;
  /** Tap an EMPTY slot's "+" → open the content chooser (photo / text / QR).
   *  When present, this SUPERSEDES onAddToSlot for empty slots. */
  onChooseSlot?: (slotIndex: number) => void;
  // Mobile edit mode: empty frames show a "+" to add a photo; filled frames show
  // a trashcan to remove it.
  editable?: boolean;
  onAddToSlot?: (slotIndex: number) => void;
  onRemoveFromSlot?: (slotIndex: number) => void;
  /** Tap an EMPTY caption box → open the content chooser (photo / text / QR). */
  onChooseTextSlot?: (slotIndex: number) => void;
  /** Tap a caption box FILLED with a photo → re-open the photo picker. */
  onTextSlotPhotoTap?: (slotIndex: number) => void;
  /** Tap a caption box FILLED with a QR → re-open the QR editor. */
  onTextSlotQrTap?: (slotIndex: number) => void;
  /** Tap a caption box FILLED with an ornament → re-open the ornament picker. */
  onTextSlotOrnamentTap?: (slotIndex: number) => void;
  /** COVER panel: no interior binding gutter (its inner edge is the spine) and no
   *  pink keep-out guide — see the cover-as-pages rework. */
  coverMode?: boolean;
}) {
  const sx = singleW / (getCanvasDimensions(page.size as any).width || singleW);
  const sy = H / (getCanvasDimensions(page.size as any).height || H);

  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const baseMargin = template?.margin ?? { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };
  // Reserve the binding keep-out on the inner edge so slots match the editor.
  // A cover panel skips it (noBinding) — its inner edge is the spine, not a gutter.
  const margin = marginForTemplate(template, baseMargin, page.size, pageIndex, { noBinding: coverMode });
  const safeX = margin.left * singleW;
  const safeY = margin.top * H;
  const safeW = singleW * (1 - margin.left - margin.right);
  const safeH = H * (1 - margin.top - margin.bottom);

  return (
    <>
      <div className="absolute inset-0" style={{ ...backgroundToCss(page.background, photos, coverMode), opacity: ((page.background as any)?.opacity ?? 100) / 100 }} />
      {template && template.slots.map((slot, idx) => {
        if (!slot) return null;
        // Content precedence is DRIVEN BY page data, not slot.kind:
        //   qrFills[i] → QR (drawn by the qrFills map below) → skip here.
        //   slotTexts[i] → text rendered in this slot's rect.
        //   slotFills[i] → photo.
        //   ornamentFills[i] → ornament (drawn by the ornamentFills map below) → skip here.
        //   else empty + editable → a "+" that opens the content chooser.
        if (page.qrFills?.[idx] || page.ornamentFills?.[idx]) return null;
        const slotLeft = safeX + slot.x * safeW;
        const slotTop = safeY + slot.y * safeH;
        const slotW = slot.width * safeW;
        const slotH = slot.height * safeH;

        // (b) Per-slot TEXT — mirrors the box-text span styling below.
        const st = page.slotTexts?.[idx] ?? null;
        if (st) {
          const align = st.alignment ?? 'center';
          return (
            <div key={`slot-${idx}`}
              className={`absolute flex items-center ${onSlotTextTap ? 'cursor-pointer' : ''}`}
              onClick={onSlotTextTap ? (e) => { e.stopPropagation(); onSlotTextTap(idx); } : undefined}
              style={{
                zIndex: 1, left: slotLeft, top: slotTop, width: slotW, height: slotH, overflow: 'hidden',
                justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
              }}>
              <span style={{
                width: '100%', textAlign: align as any,
                fontFamily: st.fontFamily || 'serif', fontSize: (st.fontSize || 24) * sx,
                fontWeight: st.bold ? 'bold' : 'normal', fontStyle: st.italic ? 'italic' : 'normal',
                textDecoration: st.underline ? 'underline' : 'none', color: st.color || '#2D2D2D',
                lineHeight: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                ...wordArtDomStyle(st, sx),
              }}>{st.text}</span>
            </div>
          );
        }

        const photoIdx = dedupeSlotFills(page.slotFills)[idx] ?? null;
        const uploaded = photoIdx != null ? photos[photoIdx] : undefined;

        // Empty frame → in edit mode, a tappable dashed frame with a "+".
        // The "+" opens the content chooser (onChooseSlot) when wired, else the
        // legacy add-photo picker (onAddToSlot).
        if (!uploaded) {
          const onEmptyTap = onChooseSlot ?? onAddToSlot;
          // Cover panels don't show the "Click to add: Photo/Text/Graphic" empty-slot
          // chooser box (the cover approach is being reworked).
          if (!editable || !onEmptyTap || coverMode) return null;
          // Where the 3-way chooser is wired (onChooseSlot) and the slot is big
          // enough, spell out what the box can hold ("Click to add: Photo/Text/QR")
          // instead of a bare "+"; otherwise fall back to the "+" bubble.
          const cell = Math.min(slotW, slotH);
          return (
            <EmptyChooserBox key={`slot-${idx}`} rectKey={`slot-${idx}`}
              left={slotLeft} top={slotTop} width={slotW} height={slotH} sx={sx} zIndex={1}
              showList={!!onChooseSlot && cell >= 84} options={['Photo', 'Quote', 'Text']}
              onTap={() => onEmptyTap(idx)} />
          );
        }

        const { style: shapeStyle, width, height, leftOffset, topOffset } =
          slotShapeStyle(slot, slot.width * safeW, slot.height * safeH);
        const left = safeX + slot.x * safeW + leftOffset;
        const top = safeY + slot.y * safeH + topOffset;
        const slotScale = page.slotScales?.[idx] ?? 1;
        const slotOffsetX = page.slotOffsetsX?.[idx] ?? 0;
        const slotOffsetY = page.slotOffsetsY?.[idx] ?? 0;
        const imgW = width * slotScale;
        const imgH = height * slotScale;
        const imgLeft = (width - imgW) / 2 + slotOffsetX * sx;
        const imgTop = (height - imgH) / 2 + slotOffsetY * sy;
        // Theme-baked frame overrides the per-slot template border when present.
        // Full-bleed (single-photo, no-textbox) pages get no frame at all.
        const frameWidth = template.fullBleed ? 0 : (page.photoBorderWidth ?? slot.borderWidth);
        const frameColor = page.photoBorderColor ?? slot.borderColor ?? '#FFFFFF';
        // Per-page border line-style (solid by default for back-compat).
        const borderLineStyle = page.photoBorderStyle ?? 'solid';
        // Decorative frame (single source of truth in types.ts). 'none'/absent → {}.
        const frameCss = template.fullBleed
          ? {}
          : frameStyleToCss(page.frameStyle, frameColor);
        // Outer drop shadows (polaroid / shadowbox) need overflow visible to show;
        // any other frame keeps the photo clipped to the slot/shape.
        const frameClips = !(page.frameStyle === 'polaroid' || page.frameStyle === 'shadowbox');

        return (
          <div key={`slot-${idx}`} className="absolute"
            onClick={onSlotTap ? (e) => { e.stopPropagation(); onSlotTap(idx); } : undefined}
            style={{
            zIndex: 1, left, top, width, height,
            transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            border: frameWidth ? `${frameWidth}px ${borderLineStyle} ${frameColor}` : undefined,
            boxSizing: 'border-box', overflow: frameClips ? 'hidden' : 'visible',
            cursor: onSlotTap ? 'pointer' : undefined, ...shapeStyle, ...frameCss.wrapper,
          }}>
            <img src={uploaded.previewUrl} alt="" draggable={false}
              className="absolute object-cover"
              style={{ left: imgLeft, top: imgTop, width: imgW, height: imgH, ...frameCss.inner }} />
            {editable && onRemoveFromSlot && (
              <button onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(idx); }} aria-label="Remove photo"
                style={{
                  position: 'absolute', top: 6, right: 6, zIndex: 6, width: 30, height: 30,
                  borderRadius: '50%', background: 'rgba(45,45,45,0.65)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Trash2 size={16} color="white" />
              </button>
            )}
          </div>
        );
      })}
      {/* QR living-memory content — content-driven by page.qrFills on ANY slot.
          Empty QR slots are no longer auto-shown; the chooser "+" owns the empty
          state. The QR is drawn on top (white backing) so it stays scannable. */}
      {template?.slots.map((slot, idx) => {
        const qr = page.qrFills?.[idx] ?? null;
        if (!qr) return null;
        return (
          <QrSquare key={`qr-${idx}`} rectKey={`qr-${idx}`} zIndex={2}
            cellLeft={safeX + slot.x * safeW} cellTop={safeY + slot.y * safeH}
            cellW={slot.width * safeW} cellH={slot.height * safeH}
            dataUrl={qr.qrPngDataUrl}
            onTap={onQrSlotTap ? () => onQrSlotTap(idx) : undefined} />
        );
      })}
      {/* Ornament content — content-driven by page.ornamentFills on ANY slot. */}
      {template?.slots.map((slot, idx) => {
        const ornament = page.ornamentFills?.[idx] ?? null;
        if (!ornament) return null;
        return (
          <OrnamentSquare key={`ornament-${idx}`} rectKey={`ornament-${idx}`} zIndex={2}
            cellLeft={safeX + slot.x * safeW} cellTop={safeY + slot.y * safeH}
            cellW={slot.width * safeW} cellH={slot.height * safeH}
            dataUrl={ornament.pngDataUrl}
            onTap={onOrnamentSlotTap ? () => onOrnamentSlotTap(idx) : undefined} />
        );
      })}
      {page.textElements?.filter((t) => t.boxIndex == null).map((t, i) => (
        <div key={`txt-${i}`}
          className={`absolute ${onTextTap ? 'cursor-pointer' : 'pointer-events-none'}`}
          onClick={onTextTap ? (e) => { e.stopPropagation(); onTextTap(t.id); } : undefined}
          style={{
          zIndex: 3, left: t.x * sx, top: t.y * sy,
          width: (t.width || t.text.length * (t.fontSize || 24) * 0.6) * sx,
          transform: `rotate(${t.rotation || 0}deg) scale(${t.scaleX ?? 1}, ${t.scaleY ?? 1})`,
          transformOrigin: 'top left', fontFamily: t.fontFamily || 'serif',
          fontSize: (t.fontSize || 24) * sx, fontWeight: t.bold ? 'bold' : 'normal',
          fontStyle: t.italic ? 'italic' : 'normal', color: t.color || '#2D2D2D',
          display: 'flex', alignItems: 'center', justifyContent: t.alignment || 'center',
          textAlign: (t.alignment || 'center') as any, opacity: (t.opacity ?? 100) / 100,
          ...wordArtDomStyle(t, sx),
        }}>{t.text}</div>
      ))}
      {/* Template text boxes. Filled → formatted text clipped to the box; empty →
          faint tap hint. Tapping opens the text editor (onTextSlotTap). */}
      {template?.textSlots?.map((ts, i) => {
        // Content precedence per caption box: qr → ornament → text → photo → empty.
        const boxLeft = safeX + ts.x * safeW;
        const boxTop = safeY + ts.y * safeH;
        const boxW = ts.width * safeW;
        const boxH = ts.height * safeH;

        // (1) QR — drawn as a qrRect square + white backing, like the photo-slot QR.
        const tqr = page.textSlotQr?.[i] ?? null;
        if (tqr) {
          return (
            <QrSquare key={`tslot-${i}`} rectKey={`tslot-${i}`} zIndex={5}
              cellLeft={boxLeft} cellTop={boxTop} cellW={boxW} cellH={boxH}
              dataUrl={tqr.qrPngDataUrl}
              transform={page.textSlotQrGeom?.[i] ?? undefined} pageW={singleW} pageH={H}
              onTap={onTextSlotQrTap ? () => onTextSlotQrTap(i) : undefined} />
          );
        }

        // (1b) ORNAMENT — the combo-box themed graphic (contained, transparent).
        const torn = page.textSlotOrnament?.[i] ?? null;
        if (torn) {
          return (
            <OrnamentSquare key={`tslot-${i}`} rectKey={`tslot-${i}`} zIndex={5}
              cellLeft={boxLeft} cellTop={boxTop} cellW={boxW} cellH={boxH}
              dataUrl={torn.pngDataUrl}
              transform={page.textSlotOrnamentGeom?.[i] ?? undefined} pageW={singleW} pageH={H}
              onTap={onTextSlotOrnamentTap ? () => onTextSlotOrnamentTap(i) : undefined} />
          );
        }

        const boxed = page.textElements?.find((t) => t.boxIndex === i);
        const align = boxed?.alignment ?? ts.align ?? 'center';

        // (2) TEXT — a bound caption. On a COVER the caption can be nudged off its
        // template slot (offsetX/offsetY, fractions of the panel) so the title can
        // be placed anywhere; the print applies the same fractions. Interior pages
        // ignore the offset.
        if (boxed) {
          const offL = coverMode ? (boxed.offsetX ?? 0) * singleW : 0;
          const offT = coverMode ? (boxed.offsetY ?? 0) * H : 0;
          return (
            <div key={`tslot-${i}`} className="absolute flex items-center"
              onClick={onTextSlotTap ? (e) => { e.stopPropagation(); onTextSlotTap(i); } : undefined}
              style={{
                zIndex: 5, left: boxLeft + offL, top: boxTop + offT, width: boxW, height: boxH, overflow: 'hidden',
                justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
                cursor: onTextSlotTap ? 'pointer' : undefined,
              }}>
              <span style={{
                width: '100%', textAlign: align as any,
                fontFamily: boxed.fontFamily || 'serif', fontSize: (boxed.fontSize || 24) * sx,
                fontWeight: boxed.bold ? 'bold' : 'normal', fontStyle: boxed.italic ? 'italic' : 'normal',
                textDecoration: boxed.underline ? 'underline' : 'none', color: boxed.color || '#2D2D2D',
                lineHeight: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                ...wordArtDomStyle(boxed, sx),
              }}>{boxed.text}</span>
            </div>
          );
        }

        // (3) PHOTO — object-cover fill of the caption box rect.
        const tPhotoIdx = page.textSlotFills?.[i] ?? null;
        const tPhoto = tPhotoIdx != null ? photos[tPhotoIdx] : undefined;
        if (tPhoto) {
          return (
            <div key={`tslot-${i}`} className="absolute"
              onClick={onTextSlotPhotoTap ? (e) => { e.stopPropagation(); onTextSlotPhotoTap(i); } : undefined}
              style={{
                zIndex: 5, left: boxLeft, top: boxTop, width: boxW, height: boxH, overflow: 'hidden',
                cursor: onTextSlotPhotoTap ? 'pointer' : undefined,
              }}>
              <img src={tPhoto.previewUrl} alt="" draggable={false}
                className="object-cover" style={{ width: '100%', height: '100%' }} />
            </div>
          );
        }

        // (4) EMPTY — tapping adds text/content.
        //
        // The full 3-way chooser ("Click to add: Photo/Text/QR") is an EDIT-mode
        // affordance and is gated on `editable && onChooseTextSlot`.
        //
        // But a plain tap-to-add-caption (onTextSlotTap) must NOT be gated on
        // `editable`: the BuilderPreview spread wires onTextSlotTap (to open the
        // MobileTextEditor) WITHOUT passing `editable`. Gating the tap on
        // `editable` made empty caption boxes dead on that surface — a regression.
        // So: chooser needs editable; the legacy tap-to-add only needs onTextSlotTap.
        // Cover panels are a DISPLAY preview (edited via the Step-3-style tabs), so
        // an empty caption box shows nothing at all — no chooser, no faint hint.
        if (coverMode) return null;
        if (editable && onChooseTextSlot) {
          return (
            <EmptyChooserBox key={`tslot-${i}`} rectKey={`tslot-${i}`}
              left={boxLeft} top={boxTop} width={boxW} height={boxH} sx={sx} zIndex={5}
              showList={!!onChooseTextSlot && Math.min(boxW, boxH) >= 84}
              options={['Quote', 'Text', 'QR']}
              onTap={() => onChooseTextSlot(i)} />
          );
        }
        // Fallback: faint tap hint. Interactive whenever a plain tap-to-add
        // handler is provided (onChooseTextSlot in non-editable contexts, or
        // onTextSlotTap on surfaces like the BuilderPreview spread); otherwise
        // read-only.
        const onEmptyTap = onChooseTextSlot ?? (onTextSlotTap ? () => onTextSlotTap(i) : undefined);
        return (
          <div key={`tslot-${i}`} className="absolute flex items-center"
            onClick={onEmptyTap ? (e) => { e.stopPropagation(); onEmptyTap(i); } : undefined}
            style={{
              zIndex: 5, left: boxLeft, top: boxTop, width: boxW, height: boxH, overflow: 'hidden',
              justifyContent: 'center', cursor: onEmptyTap ? 'pointer' : undefined,
            }}>
            <div style={{
              width: '100%', height: '100%', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${4 * sx}px`,
              border: `${Math.max(1, 1.25 * sx)}px dashed rgba(232,165,152,0.85)`, borderRadius: `${6 * sx}px`,
              background: 'rgba(253,232,228,0.45)',
              color: 'rgba(139,111,71,0.9)', fontSize: `${11 * sx}px`, fontWeight: 500,
            }}>
              <span style={{ fontSize: `${12 * sx}px` }}>✎</span>
              {ts.placeholder || 'Tap to add text'}
            </div>
          </div>
        );
      })}
      {/* Theme decorative corners — one set, all four corners, on top of photos */}
      {page.cornerBase && CORNER_POSITIONS.map((pos) => {
        const size = Math.min(singleW, H) * 0.25;
        const isTop = pos === 'tl' || pos === 'tr';
        const isLeft = pos === 'tl' || pos === 'bl';
        return (
          <img key={`corner-${pos}`} src={cornerImageUrl(page.cornerBase!, pos)} alt="" draggable={false}
            className="absolute pointer-events-none" style={{
              zIndex: 4, width: size, height: size, objectFit: 'contain',
              top: isTop ? 0 : undefined, bottom: isTop ? undefined : 0,
              left: isLeft ? 0 : undefined, right: isLeft ? undefined : 0,
            }} />
        );
      })}
      {/* Binding (gutter) keep-out guide — 0.5" reserve on the inner edge.
          Hidden on cover panels (they have no interior gutter). */}
      {!coverMode && (() => {
        const frac = bindingMarginFraction(page.size);
        const onLeft = bindingEdge(pageIndex) === 'left';
        return (
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{
            zIndex: 3,
            left: onLeft ? 0 : singleW * (1 - frac),
            width: singleW * frac,
            background: 'rgba(232,165,152,0.10)',
            borderRight: onLeft ? '1.5px dashed #E8A598' : undefined,
            borderLeft: onLeft ? undefined : '1.5px dashed #E8A598',
          }} />
        );
      })()}
    </>
  );
}

export default function BuilderPreview({ pages, currentIndex, photos, albumSize, onGoToPage, onBack, onOrder }: BuilderPreviewProps) {
  const total = pages.length;
  const { setBoxText, updateTextElement, setQrFill, coverDesign, coverFront, coverBack } = useBuilderContext();

  // The preview is a TWO-PAGE spread — wider than a phone screen, so it shrinks to
  // a stamp in portrait. Rather than ask the user to rotate (useless if their phone
  // rotation is locked), we AUTO-ROTATE the whole preview 90° in mobile-portrait:
  // the spread is laid out landscape and sized to the phone's LONG axis, so holding
  // the phone sideways shows the album upright + full-size — no rotation-unlock
  // needed. If the screen genuinely IS landscape (auto-rotate on), isPortrait is
  // false and we render normally. Desktop never rotates.
  const isMobile = useIsMobile();
  const isPortrait = useIsPortrait();
  const landscapeRotate = isMobile && isPortrait;

  // Tap a textbox in the preview → open the formatting editor for THAT page.
  // `slot` = a template caption box; `textId` = a free element (e.g. the theme title).
  const [edit, setEdit] = useState<{ pageIndex: number; slot?: number; textId?: string } | null>(null);
  const [qrEdit, setQrEdit] = useState<{ pageIndex: number; slot: number } | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const buildTextInitial = (pageIndex: number, textId: string): BoxTextContent => {
    const el = pages[pageIndex]?.textElements?.find((t) => t.id === textId);
    return {
      text: el?.text ?? '', fontSize: el?.fontSize ?? 28,
      fontFamily: el?.fontFamily ?? 'Georgia, "Times New Roman", serif',
      color: el?.color ?? '#2D2D2D', bold: el?.bold ?? false, italic: el?.italic ?? false,
      underline: el?.underline ?? false, alignment: el?.alignment ?? 'center',
      outlineColor: el?.outlineColor, outlineWidth: el?.outlineWidth, shadow: el?.shadow,
    };
  };
  const buildBoxInitial = (pageIndex: number, slot: number): BoxTextContent => {
    const page = pages[pageIndex];
    const existing = page?.textElements?.find((t) => t.boxIndex === slot);
    if (existing) {
      return {
        text: existing.text, fontSize: existing.fontSize, fontFamily: existing.fontFamily,
        color: existing.color, bold: existing.bold, italic: existing.italic,
        underline: existing.underline, alignment: existing.alignment,
        outlineColor: existing.outlineColor, outlineWidth: existing.outlineWidth, shadow: existing.shadow,
      };
    }
    const ts = (page?.templateId ? getTemplateById(page.templateId) : null)?.textSlots?.[slot];
    return {
      text: '', fontSize: 28, fontFamily: 'Georgia, "Times New Roman", serif',
      color: '#2D2D2D', bold: false, italic: false, underline: false,
      alignment: ts?.align ?? 'center',
    };
  };


  // Spread pairs: 0-1, 2-3, 4-5, etc.
  const spreadLeftIndex = Math.floor(currentIndex / 2) * 2;
  const spreadLeftPage = pages[spreadLeftIndex];
  const spreadRightPage = pages[spreadLeftIndex + 1];

  // Responsive sizing: the spread (two pages side by side) scales DOWN to fit the
  // available stage, so it shrinks with the window instead of overflowing or
  // hiding behind the Megy panel. Capped at 1x (never bigger than the design size).
  const base = PREVIEW_DIMS[albumSize] || { w: 500, h: 625 };
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = () => {
      // The builder root already reserves the Megy panel's width, so the stage
      // measures only the space available beside it.
      const chromeW = 2 * 56 + 48 + 48;            // nav arrows + gaps + horizontal padding
      const chromeH = 48 + 34;                     // vertical padding + page-number labels
      const availW = el.clientWidth - chromeW;
      const availH = el.clientHeight - chromeH;
      const fit = Math.min(availW / (base.w * 2), availH / base.h);
      setFitScale(Math.max(0.15, Math.min(1, fit)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [base.w, base.h]);
  const singleW = Math.round(base.w * fitScale);
  const H = Math.round(base.h * fitScale);

  // Navigate by 2 pages (one spread) at a time
  const navPrev = () => onGoToPage(Math.max(0, currentIndex - 2));
  const navNext = () => onGoToPage(Math.min(total - 1, currentIndex + 2));

  // SINGLE order entry point. Checkout (Order.tsx) reads the pending print job to
  // price the album and build the cover PDF; if we call onOrder() WITHOUT stashing
  // it first, checkout falls back to a stale/other job → wrong size, wrong price,
  // and a cover PDF that doesn't match the album. The toolbar button and the
  // end-of-album CTA must BOTH go through here so they can never drift apart.
  const handleOrder = () => {
    setPendingPrintJob({ pages, photos, albumSize, coverDesign, coverFront, coverBack });
    onOrder();
  };

  const hasPrev = spreadLeftIndex > 0;
  const hasNext = spreadLeftIndex + 2 < total;

  // Forced order CTA — auto-shows once they reach the last spread of the preview.
  const [showOrderCta, setShowOrderCta] = useState(false);
  useEffect(() => {
    if (!hasNext && total > 0) setShowOrderCta(true);
  }, [hasNext, total]);

  return (
    <div style={landscapeRotate
      ? { position: 'fixed', top: 0, left: 0, width: '100vh', height: '100vw', transformOrigin: 'top left', transform: 'translateX(100vw) rotate(90deg)', zIndex: 70, overflow: 'hidden' }
      : { height: '100%' }}>
    <div className="flex flex-col h-full bg-[#F5F5F5] relative">
      {landscapeRotate && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-1.5 text-[11px] font-medium text-[#8B6F47] bg-white/85 rounded-full px-3 py-1 shadow-sm pointer-events-none">
          <RotateCw size={12} /> Hold your phone sideways to view
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#E8E4E0] bg-white">
        <span className="text-xs text-[#6B6B6B] font-medium tabular-nums">
          {spreadLeftIndex + 1}-{Math.min(spreadLeftIndex + 2, total)} / {total}
        </span>
        <div className="flex items-center gap-2">
          {/* "Print PDF" intentionally NOT exposed to customers — the print-ready
              PDF is generated by Megyprints only AFTER an order is paid, so the
              album can't be downloaded and printed elsewhere. */}
          <button
            onClick={handleOrder}
            className="px-4 py-2 bg-[#E8A598] text-white text-xs font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5"
          >
            <ShoppingCart size={14} /> Order
          </button>
        </div>
      </div>

      {/* Page display with side arrows */}
      <div ref={stageRef} className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="flex items-center gap-6">
          {/* Prev Arrow — left side */}
          <button
            onClick={navPrev}
            disabled={!hasPrev}
            className="flex items-center justify-center rounded-full hover:bg-[#E8A598]/15 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            style={{ width: 56, height: 56 }}
          >
            <ChevronLeft size={40} className="text-[#E8A598]" />
          </button>

          {/* Pages */}
          <div className="flex flex-col items-center gap-2">
            {/* Page number labels */}
            <div className="flex items-center" style={{ width: singleW * 2 }}>
              <span className="text-xs font-medium text-[#6B6B6B]" style={{ width: singleW, textAlign: 'center' }}>
                Page {spreadLeftIndex + 1}
              </span>
              {spreadRightPage && (
                <span className="text-xs font-medium text-[#6B6B6B]" style={{ width: singleW, textAlign: 'center' }}>
                  Page {spreadLeftIndex + 2}
                </span>
              )}
            </div>

            {/* Spread container */}
            <div
              className="relative bg-white shadow-xl"
              style={{
                width: singleW * 2,
                height: H,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}
            >
              {/* Left Page */}
              <div className="absolute overflow-hidden" style={{ left: 0, top: 0, width: singleW, height: H }}>
                <PageView key={spreadLeftPage?.id} page={spreadLeftPage} photos={photos} singleW={singleW} H={H} pageIndex={spreadLeftIndex}
                  onTextSlotTap={(slot) => setEdit({ pageIndex: spreadLeftIndex, slot })}
                  onTextTap={(textId) => setEdit({ pageIndex: spreadLeftIndex, textId })}
                  onQrSlotTap={(slot) => setQrEdit({ pageIndex: spreadLeftIndex, slot })} />
              </div>

              {/* Right Page — flush against the left page (no center gap/spine;
                  the dashed binding guides already mark the gutter). */}
              {spreadRightPage && (
                <div className="absolute overflow-hidden" style={{ left: singleW, top: 0, width: singleW, height: H }}>
                  <PageView key={spreadRightPage?.id} page={spreadRightPage} photos={photos} singleW={singleW} H={H} pageIndex={spreadLeftIndex + 1}
                    onTextSlotTap={(slot) => setEdit({ pageIndex: spreadLeftIndex + 1, slot })}
                    onTextTap={(textId) => setEdit({ pageIndex: spreadLeftIndex + 1, textId })}
                    onQrSlotTap={(slot) => setQrEdit({ pageIndex: spreadLeftIndex + 1, slot })} />
                </div>
              )}
            </div>
          </div>

          {/* Next Arrow — right side */}
          <button
            onClick={navNext}
            disabled={!hasNext}
            className="flex items-center justify-center rounded-full hover:bg-[#E8A598]/15 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            style={{ width: 56, height: 56 }}
          >
            <ChevronRight size={40} className="text-[#E8A598]" />
          </button>
        </div>
      </div>

      {/* Forced order CTA — auto-shows on the last spread; no dismiss (must choose). */}
      {showOrderCta && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
            <div className="text-4xl mb-2">📦</div>
            <h3 className="font-display text-2xl font-semibold text-[#2D2D2D] mb-1">You've reached the end</h3>
            <p className="text-sm text-[#6B6B6B] mb-5">Your album looks beautiful. Give it a cover, then make it real.</p>
            <button
              onClick={() => setCoverOpen(true)}
              className="w-full py-3 mb-3 bg-white border-2 border-[#E8A598] text-[#C56B4E] text-base font-semibold rounded-xl hover:bg-[#FDF3EF] active:scale-[0.98] transition-all"
            >
              🎨 Design your cover
            </button>
            <button
              onClick={handleOrder}
              className="w-full py-4 bg-[#E8A598] text-white text-lg font-bold tracking-wide rounded-xl hover:brightness-105 active:scale-[0.98] transition-all shadow-md"
            >
              ORDER ALBUM
            </button>
            <button
              onClick={onBack}
              className="mt-4 text-xs text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors"
            >
              …or do you want to change anything?
            </button>
          </div>
        </div>
      )}

      {/* Tap-to-edit textbox — the floating-bar editor (works on desktop too).
          A caption box saves via setBoxText(slot); a free element (theme title)
          saves via updateTextElement(id) so its font/color/text actually stick. */}
      {edit && (
        <MobileTextEditor
          initial={edit.textId != null ? buildTextInitial(edit.pageIndex, edit.textId) : buildBoxInitial(edit.pageIndex, edit.slot!)}
          onSave={(content) => {
            if (edit.textId != null) updateTextElement(edit.textId, content);
            else setBoxText(edit.slot!, content, edit.pageIndex);
          }}
          onClose={() => setEdit(null)}
        />
      )}
      {qrEdit && (
        <AddQrModal
          initial={pages[qrEdit.pageIndex]?.qrFills?.[qrEdit.slot] ?? null}
          onSave={(fill: QrFill) => { setQrFill(qrEdit.slot, fill, qrEdit.pageIndex); setQrEdit(null); }}
          onRemove={() => { setQrFill(qrEdit.slot, null, qrEdit.pageIndex); setQrEdit(null); }}
          onClose={() => setQrEdit(null)}
        />
      )}
      {coverOpen && <CoverEditor mode="modal" onClose={() => setCoverOpen(false)} />}
    </div>
    </div>
  );
}
