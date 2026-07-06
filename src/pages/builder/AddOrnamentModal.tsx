import { useState } from 'react';
import { X, Sparkles, Trash2, Loader2 } from 'lucide-react';
import type { OrnamentFill } from './types';
import { ORNAMENT_PACKS, ornamentDataUri, rasterizeOrnamentPng, type OrnamentPackId } from './ornaments';

/* Themed-ornament picker for a combo-box slot. Tap a graphic → it's rasterized
   to a crisp print-ready PNG (once, at pick-time) and returned as an OrnamentFill.
   No account/DB needed — the packs are static client-side assets. Mirrors the
   AddQrModal shell so the two feel identical. */
export default function AddOrnamentModal({ initial, onSave, onRemove, onClose }: {
  initial: OrnamentFill | null;
  onSave: (fill: OrnamentFill) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [pack, setPack] = useState<OrnamentPackId>(
    (ORNAMENT_PACKS.find((p) => p.id === initial?.pack)?.id) ?? ORNAMENT_PACKS[0].id,
  );
  // The specific ornament currently being rasterized (its id) — disables the grid
  // and shows a spinner on the tapped tile until the PNG is ready.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const activePack = ORNAMENT_PACKS.find((p) => p.id === pack) ?? ORNAMENT_PACKS[0];

  const pick = async (id: string, svg: string) => {
    if (busyId) return;
    setError('');
    setBusyId(id);
    try {
      const pngDataUrl = await rasterizeOrnamentPng(svg);
      onSave({ pack, id, pngDataUrl, appliedAt: Date.now() });
    } catch {
      setError('Couldn’t add that ornament. Please try another.');
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8] shrink-0">
          <span className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
            <Sparkles size={18} className="text-[#E8A598]" /> {initial ? 'Change Ornament' : 'Add an Ornament'}
          </span>
          <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
        </div>

        {/* Pack tabs */}
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-[#F0F0F0] shrink-0">
          {ORNAMENT_PACKS.map((p) => (
            <button key={p.id} onClick={() => setPack(p.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                p.id === pack ? 'bg-[#F4C2A1] text-white' : 'bg-[#FFF8F0] text-[#8B6F47] hover:bg-[#FDE8E4]'
              }`}>
              <span className="mr-1">{p.emoji}</span>{p.label}
            </button>
          ))}
        </div>

        {/* Ornament grid */}
        <div className="p-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            {activePack.items.map((it) => {
              const isBusy = busyId === it.id;
              const isCurrent = initial?.pack === pack && initial?.id === it.id;
              return (
                <button key={it.id} onClick={() => pick(it.id, it.svg)} disabled={!!busyId}
                  title={it.label}
                  className={`relative aspect-square rounded-xl border p-2.5 flex items-center justify-center transition active:scale-[0.97] disabled:opacity-60 ${
                    isCurrent ? 'border-[#E8A598] ring-2 ring-[#F4C2A1]/50 bg-[#FFF8F0]' : 'border-[#EDE7E0] bg-white hover:bg-[#FFF8F0]'
                  }`}>
                  <img src={ornamentDataUri(it.svg)} alt={it.label} draggable={false}
                    className="w-full h-full object-contain pointer-events-none" />
                  {isBusy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                      <Loader2 size={20} className="animate-spin text-[#E8A598]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {error && <p className="text-xs text-red-500 mt-3 text-center">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#E8E8E8] shrink-0">
          {initial ? (
            <button onClick={onRemove} className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} /> Remove
            </button>
          ) : <span className="text-[11px] text-[#9B9B9B]">Tap a graphic to place it in this box.</span>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#FFF8F0] text-[#8B6F47] text-sm font-semibold hover:bg-[#FDE8E4]">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
