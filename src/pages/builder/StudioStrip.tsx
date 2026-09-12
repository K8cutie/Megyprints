import { Sparkles } from 'lucide-react';
import { MASKS, isTextureMask, TEXTURE_BITE, type MaskId } from './masks';
import { LOOKS, type LookId } from './looks';
import type { AlbumPage } from './types';

/* The STUDIO strip under the desktop toolbar: masks + looks for the selected
   photo, the Worn preset, "Add sticker" for the page. A real component (not
   an inline function in BuilderEdit's render) so the hooks linter can see
   it never touches refs during render. */
export default function StudioStrip({ page, selectedSlotIndex, onMask, onLook, onGuard, onAddSticker }: {
  page: AlbumPage | undefined;
  selectedSlotIndex: number | null;
  onMask: (slotIndex: number, mask: MaskId | null) => void;
  onLook: (slotIndex: number, look: LookId | null) => void;
  onGuard: (msg: string) => void;
  onAddSticker: () => void;
}) {
  const slotIdx = selectedSlotIndex;
  const hasPhoto = slotIdx != null && page?.slotFills?.[slotIdx] != null;
  const current = (slotIdx != null ? page?.slotMasks?.[slotIdx] : null) ?? 'none';
  const currentLook = (slotIdx != null ? page?.slotLooks?.[slotIdx] : null) ?? 'none';
  const pickMask = (id: MaskId | 'none') => {
    onMask(slotIdx as number, id === 'none' ? null : id);
    if (isTextureMask(id)) onGuard(`A textured edge bites up to ${Math.round(TEXTURE_BITE * 100)}% in from each side — keep faces away from the edge.`);
  };
  const chip = (active: boolean, label: string, onClick: () => void, testid: string) => (
    <button key={testid} type="button" aria-pressed={active} onClick={onClick} data-testid={testid}
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${active ? 'bg-blush-pink text-white' : 'bg-paper text-cocoa hover:bg-blush'}`}>
      {label}
    </button>
  );
  return (
    <div className="bg-warm-white border-b border-line shrink-0" data-testid="studio-strip">
      <div className="h-9 flex items-center gap-2 px-3 overflow-x-auto">
        <span className="text-[10px] font-bold tracking-widest uppercase text-medium">Studio</span>
        <div className="w-px h-4 bg-line" />
        {hasPhoto ? (
          <>
            <span className="text-[11px] text-medium">Mask</span>
            {MASKS.map((m) => chip(current === m.id, m.label, () => pickMask(m.id), `mask-${m.id}`))}
          </>
        ) : (
          <span className="text-[11px] text-light">Select a photo to mask it or change its look · drag a frame to move it</span>
        )}
        <div className="ml-auto" />
        <button type="button" onClick={onAddSticker} data-testid="studio-add-sticker"
          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blush-pink text-white hover:brightness-105 flex items-center gap-1 whitespace-nowrap">
          <Sparkles size={11} /> Add sticker
        </button>
      </div>
      {hasPhoto && (
        <div className="h-8 flex items-center gap-2 px-3 overflow-x-auto border-t border-line-soft">
          <span className="text-[11px] text-medium">Look</span>
          {chip(currentLook === 'none', 'As shot', () => onLook(slotIdx as number, null), 'look-none')}
          {LOOKS.map((l) => chip(currentLook === l.id, l.label, () => onLook(slotIdx as number, l.id as LookId), `look-${l.id}`))}
          <div className="w-px h-4 bg-line" />
          <span className="text-[11px] text-medium">Preset</span>
          {chip(current === 'brushed' && currentLook === 'faded', 'Worn', () => { onMask(slotIdx as number, 'brushed'); onLook(slotIdx as number, 'faded'); onGuard('Worn: brushed edge + faded look. Keep faces away from the edge.'); }, 'preset-worn')}
        </div>
      )}
    </div>
  );
}
