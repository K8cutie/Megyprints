import { useMemo, useState } from 'react';
import { X, Youtube, Trash2, Loader2, LogIn, Play } from 'lucide-react';
import type { QrFill } from './types';
import { mintCode, memoryUrl, generateQrPngDataUrl, validateDestination, videoEmbedInfo } from '../../lib/qrMemory';
import { tryCreateMemory, updateMemoryDestination } from '../../lib/qrMemories';
import { useAuth } from '../../lib/authContext';
import { useAuthModal } from '../../components/AuthModalProvider';

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
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const [url, setUrl] = useState(initial?.destination ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Live proof: the moment a valid YouTube/Vimeo link is entered, embed the real
  // player so the user WATCHES the exact video their QR will open — no printing,
  // no scanning needed to confirm it's attached. Autoplays muted (no surprise).
  const embed = useMemo(() => videoEmbedInfo(url), [url]);
  const previewSrc = embed
    ? (embed.src.includes('player.vimeo.com')
        ? `${embed.src}?autoplay=1&muted=1&title=0&byline=0&portrait=0`
        : `${embed.src}?rel=0&playsinline=1&modestbranding=1&autoplay=1&mute=1`)
    : '';

  const confirm = async () => {
    setError('');
    const v = validateDestination(url);
    if ('error' in v) { setError(v.error); return; }
    // A QR memory lives in qr_memories, keyed to the owner (RLS). Without a signed-in
    // account we CANNOT save a row — and a QR with no row resolves to "Memory not
    // found" when anyone scans it. So require sign-in and never place a dead QR.
    if (!user) {
      setError('Please sign in first — a QR memory is saved to your Megyprints account so it opens for anyone who scans it (no app needed) and you can re-point it later.');
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        // Relink: keep the SAME code + printed QR image; re-point the destination.
        // Await it so we only update the local fill once the DB actually persisted.
        const ok = await updateMemoryDestination(initial.code, v.url);
        if (!ok) { setError('Couldn’t save the new link. Please try again.'); return; }
        onSave({ ...initial, destination: v.url });
        return;
      }
      // New: mint a code, generate the QR encoding /m/:code, and persist. Only place
      // the QR once the row is CONFIRMED created — otherwise a scan hits a dead code.
      let fill: QrFill | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = mintCode();
        const memUrl = memoryUrl(code);
        const qrPngDataUrl = await generateQrPngDataUrl(memUrl);
        const candidate: QrFill = { code, destination: v.url, qrPngDataUrl, memoryUrl: memUrl, createdAt: Date.now() };
        const res = await tryCreateMemory(candidate);
        if (res === 'conflict') continue; // re-mint and try again
        if (res === 'skip') { setError('Please sign in first to save the QR memory.'); return; }
        if (res === 'error') { setError('Couldn’t save the QR just now. Please try again.'); return; }
        fill = candidate; // res === 'ok' — row created
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
            <Youtube size={18} className="text-[#E8A598]" /> {initial ? 'Edit YouTube Memory' : 'Add a YouTube Memory'}
          </span>
          <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          {!user && (
            <div className="text-[11px] leading-snug text-[#8B6F47] bg-[#FFF3EC] border border-[#F4C2A1]/60 rounded-lg px-3 py-2">
              <span className="font-semibold">Sign in to add a QR.</span> The link is saved to your account so it opens for anyone who scans it — no app needed — and you can re-point it anytime.
            </div>
          )}
          <div className="rounded-xl bg-gradient-to-br from-[#FFF3EC] to-[#FDF6F1] border border-[#F4C2A1]/50 px-4 py-3">
            <p className="text-sm font-bold text-[#2D2D2D]">Add a memory of this event 🎬</p>
            <p className="text-xs text-[#6B6B6B] mt-1 leading-snug">
              Paste a YouTube link — it plays the moment anyone scans the QR printed on this page. Your album stops being just photos and starts <span className="font-medium text-[#8B6F47]">reliving the day</span>.
            </p>
          </div>
          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">YouTube link</label>
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
          {embed && (
            <div className="rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] p-2">
              <div className={`relative overflow-hidden rounded-lg bg-black mx-auto ${embed.portrait ? 'w-[200px] aspect-[9/16]' : 'w-full aspect-video'}`}>
                <iframe
                  key={embed.src}
                  src={previewSrc}
                  title="Memory video preview"
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
              <p className="text-[11px] text-[#6B6B6B] mt-2 flex items-center gap-1 justify-center text-center">
                <Play size={11} className="text-[#E8A598] shrink-0" fill="currentColor" />
                This is exactly what plays when someone scans your QR.
              </p>
            </div>
          )}
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
          {!user ? (
            <button
              onClick={openLogin}
              className="px-5 py-2 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold hover:brightness-105 flex items-center gap-2"
            >
              <LogIn size={15} /> Log In to continue
            </button>
          ) : (
            <button
              onClick={confirm} disabled={busy}
              className="px-5 py-2 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60 flex items-center gap-2"
            >
              {busy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : (initial ? 'Save' : 'Generate QR')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
