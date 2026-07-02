import { useState } from 'react';
import { X, QrCode, Trash2, Loader2 } from 'lucide-react';
import type { QrFill } from './types';
import { mintCode, memoryUrl, generateQrPngDataUrl, validateDestination } from '../../lib/qrMemory';
import { tryCreateMemory, updateMemoryDestination } from '../../lib/qrMemories';

/* Add / edit a QR "living memory" for a template QR slot. New: mints a stable
   code, generates a print-crisp QR encoding /m/:code, and returns the fill.
   Edit: keeps the SAME code + printed QR image and only re-points the
   destination — so the physical album never needs a reprint. */
export default function AddQrModal({ initial, onSave, onRemove, onClose }: {
  initial: QrFill | null;
  onSave: (fill: QrFill) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initial?.destination ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setError('');
    const v = validateDestination(url);
    if ('error' in v) { setError(v.error); return; }
    setBusy(true);
    try {
      if (initial) {
        // Relink: keep the SAME code + printed QR image; re-point the destination
        // locally + in the DB (best-effort — local qrFill is the render source).
        void updateMemoryDestination(initial.code, v.url);
        onSave({ ...initial, destination: v.url });
        return;
      }
      // New: mint a code, generate the QR encoding /m/:code, and persist. Retry on
      // the astronomically-rare code clash (re-mint). If not signed in, we still
      // keep the local fill — the row is created at checkout (ensureMemoriesForFills).
      let fill: QrFill | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = mintCode();
        const memUrl = memoryUrl(code);
        const qrPngDataUrl = await generateQrPngDataUrl(memUrl);
        const candidate: QrFill = { code, destination: v.url, qrPngDataUrl, memoryUrl: memUrl, createdAt: Date.now() };
        const res = await tryCreateMemory(candidate);
        if (res === 'conflict') continue; // re-mint and try again
        fill = candidate;
        break;
      }
      if (!fill) { setError('Could not generate a unique code. Please try again.'); return; }
      onSave(fill);
    } catch {
      setError('Could not save the QR code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8]">
          <span className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
            <QrCode size={18} className="text-[#E8A598]" /> {initial ? 'Edit QR memory' : 'Add QR memory'}
          </span>
          <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-[#6B6B6B]">
            Paste a video or media link. We turn it into a QR on the printed page — and you can re-point it later
            <span className="font-medium text-[#8B6F47]"> without reprinting</span>.
          </p>
          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">Link</label>
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              inputMode="url" autoComplete="off" placeholder="https://youtu.be/…"
              aria-invalid={!!error}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-[#E8E8E8]'}`}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          {initial && (
            <div className="flex items-center gap-3 rounded-lg bg-[#FAFAFA] p-2">
              <img src={initial.qrPngDataUrl} alt="QR preview" className="w-12 h-12 shrink-0" />
              <span className="text-[11px] text-[#9B9B9B] break-all">{initial.memoryUrl}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#E8E8E8]">
          {initial ? (
            <button onClick={onRemove} className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} /> Remove
            </button>
          ) : <span />}
          <button
            onClick={confirm} disabled={busy}
            className="px-5 py-2 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60 flex items-center gap-2"
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : (initial ? 'Save' : 'Generate QR')}
          </button>
        </div>
      </div>
    </div>
  );
}
