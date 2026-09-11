import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Youtube, Trash2, Loader2, LogIn, Play, Video, Upload, Clock } from 'lucide-react';
import type { QrFill } from './types';
import { QR_CORNERS, type QrCorner } from './pageTemplates';
import { mintCode, memoryUrl, generateQrPngDataUrl, validateDestination, videoEmbedInfo } from '../../lib/qrMemory';
import { tryCreateMemory, updateMemoryDestination } from '../../lib/qrMemories';
import {
  hostedMemoriesEnabled, validateClipFile, stageClip, getStagedClip, removeStagedClip, publicClipUrl,
  listStagedCodes, currentClipQuality, setClipQuality, QUALITY_TARGETS,
  MAX_CLIP_SECONDS, type ClipExt, type ClipQuality,
} from '../../lib/memoryClips';
import { useAuth } from '../../lib/authContext';
import { useAuthModal } from '../../components/AuthModalProvider';
import { FREE_QR_MEMORIES, EXTRA_QR_RATE, includedHostingYears, hdMemoriesPriceOf } from '../../lib/pricing';
import { getPriceSchedule } from '../../lib/storeSettings';

const CORNER_LABELS: Record<QrCorner, string> = {
  tl: 'Top-left', tr: 'Top-right', bl: 'Bottom-left', br: 'Bottom-right',
};
const CORNER_POS: Record<QrCorner, React.CSSProperties> = {
  tl: { top: 5, left: 5 }, tr: { top: 5, right: 5 },
  bl: { bottom: 5, left: 5 }, br: { bottom: 5, right: 5 },
};

export interface AddQrModalProps {
  /** The fill currently in this box, if any — enables Replace/Remove wording. */
  initial: QrFill | null;
  onSave: (fill: QrFill) => void;
  onRemove: () => void;
  onClose: () => void;
  corner?: QrCorner | null;
  onCorner?: (corner: QrCorner | null) => void;
  allowAuto?: boolean;
}

/* Add / edit a QR "living memory".
   HOSTED (the product since 2026-09-09): the customer PICKS A VIDEO from their
   phone. It is validated (≤60 s, ≤100 MB), previewed, staged locally under a
   freshly minted code, and the QR is placed immediately — no link, no sign-in.
   The clip uploads at checkout (where sign-in already lives) and the memory row
   is created with the paid hosting term. Edit keeps the SAME code + printed QR:
   replacing the video never needs a reprint.
   LEGACY (only until migration 0030 is applied — hostedMemoriesEnabled() is
   false): the previous paste-a-link flow, unchanged. */
export default function AddQrModal(props: AddQrModalProps) {
  return hostedMemoriesEnabled() ? <ClipModal {...props} /> : <LegacyLinkModal {...props} />;
}

/* ══════════════════════════════════════════════════════════════════════════
   HOSTED CLIP
   ══════════════════════════════════════════════════════════════════════════ */
function ClipModal({ initial, onSave, onRemove, onClose, corner, onCorner, allowAuto }: AddQrModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<{ ext: ClipExt; durationSec: number | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null); // local blob of a not-yet-uploaded clip
  const inputRef = useRef<HTMLInputElement>(null);
  const schedule = getPriceSchedule();
  const includedYears = includedHostingYears(schedule ?? {});
  const hdPrice = hdMemoriesPriceOf(schedule ?? {});

  // Quality tier: offered with the album's FIRST memory, then locked — each
  // clip is encoded straight to its target, so there is no stored original to
  // re-encode from once one is staged. null = still counting.
  const [quality, setQuality] = useState<ClipQuality>(() => currentClipQuality());
  const [tierLocked, setTierLocked] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void listStagedCodes().then((codes) => { if (alive) setTierLocked(codes.length > 0); });
    return () => { alive = false; };
  }, []);
  const offerTier = !initial && tierLocked === false && hdPrice > 0;

  // Preview the PICKED file (object URL), revoked on change/unmount.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Existing clip: staged locally (not yet uploaded) → play the local blob;
  // otherwise it is in the bucket → play the public URL. Legacy link → none.
  useEffect(() => {
    if (!initial || initial.kind !== 'clip') return;
    let alive = true;
    let objUrl: string | null = null;
    void getStagedClip(initial.code).then((c) => {
      if (!alive || !c) return;
      objUrl = URL.createObjectURL(c.blob);
      setStagedUrl(objUrl);
    });
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [initial]);
  const currentUrl = initial?.kind === 'clip' ? (stagedUrl ?? initial.destination) : null;

  const pick = async (f: File | null) => {
    setError('');
    setMeta(null);
    setFile(null);
    if (!f) return;
    setChecking(true);
    try {
      const v = await validateClipFile(f);
      if (!v.ok) { setError(v.error); return; }
      setFile(f);
      setMeta({ ext: v.ext, durationSec: v.durationSec });
    } finally {
      setChecking(false);
    }
  };

  const confirm = async () => {
    if (!file || !meta) { setError('Choose a video first.'); return; }
    setError('');
    setBusy(true);
    try {
      if (initial) {
        // REPLACE: same code, same printed QR. If the old clip already reached
        // the bucket (a past checkout), the next checkout overwrites it.
        const prior = await getStagedClip(initial.code);
        await stageClip({
          code: initial.code, ext: meta.ext, blob: file, size: file.size,
          durationSec: meta.durationSec, name: file.name,
          quality: prior?.quality ?? currentClipQuality(),
          replace: initial.kind !== 'clip' || !!prior?.uploaded || !prior,
        });
        onSave({ ...initial, kind: 'clip', clipExt: meta.ext, destination: publicClipUrl(initial.code, meta.ext) });
        return;
      }
      // NEW: mint a code (re-mint on the astronomically rare local collision),
      // stage the clip under it, generate the print-crisp QR, place it NOW.
      let code = mintCode();
      for (let i = 0; i < 5 && (await getStagedClip(code)); i++) code = mintCode();
      const memUrl = memoryUrl(code);
      const qrPngDataUrl = await generateQrPngDataUrl(memUrl);
      // Lock the album's tier with its first memory (a no-op afterwards).
      if (offerTier) setClipQuality(quality);
      await stageClip({
        code, ext: meta.ext, blob: file, size: file.size, durationSec: meta.durationSec, name: file.name,
        quality: offerTier ? quality : currentClipQuality(),
      });
      onSave({
        code, destination: publicClipUrl(code, meta.ext), qrPngDataUrl, memoryUrl: memUrl,
        createdAt: Date.now(), kind: 'clip', clipExt: meta.ext,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the video. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (initial) await removeStagedClip(initial.code);
    onRemove();
  };

  const legacyLink = initial && initial.kind !== 'clip' ? initial.destination : null;
  const mb = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
          <span className="text-sm font-semibold text-dark flex items-center gap-2">
            <Video size={18} className="text-blush-pink" /> {initial ? 'Change this memory' : 'Add a video memory'}
          </span>
          <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {!initial && (
            <div className="rounded-xl bg-gradient-to-br from-[#FFF3EC] to-[#FDF6F1] border border-peach/50 px-4 py-3">
              <p className="text-sm font-bold text-dark">Pick a video of this moment 🎬</p>
              <p className="text-xs text-medium mt-1 leading-snug">
                It plays the instant anyone scans the QR printed on this page — no app, no account.
                Up to {Math.round(MAX_CLIP_SECONDS / 60)} minutes — we shrink it for you, so any phone video works.
              </p>
              <p className="text-[11px] text-stone mt-1.5 flex items-center gap-1">
                <Clock size={11} className="shrink-0" />
                {FREE_QR_MEMORIES} memories included · ₱{EXTRA_QR_RATE} each after
                {includedYears ? ` · live for ${includedYears} years, longer at checkout` : ''}
              </p>
            </div>
          )}

          {/* What's in the box now (edit mode) */}
          {initial && !file && (
            currentUrl ? (
              <div className="rounded-xl border border-line bg-[#FAFAFA] p-2">
                <video src={currentUrl} controls muted playsInline preload="metadata" className="w-full max-h-64 rounded-lg bg-black" />
                <p className="text-[11px] text-medium mt-2 text-center">This is what plays when someone scans this page.</p>
              </div>
            ) : legacyLink ? (
              <div className="rounded-xl border border-line bg-[#FAFAFA] px-3 py-2.5 text-xs text-medium">
                This memory currently points to a link on{' '}
                <span className="font-semibold text-cocoa break-all">{safeHost(legacyLink)}</span>.
                Replace it with a video and it will play right on the page — same QR, no reprint.
              </div>
            ) : null
          )}

          {/* Quality tier - first memory only, then locked for the album */}
          {offerTier && (
            <div>
              <label className="text-xs text-medium mb-1.5 block">Video quality for this album</label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Memory video quality">
                {(['standard', 'hd'] as ClipQuality[]).map((q) => {
                  const active = quality === q;
                  return (
                    <button key={q} type="button" role="radio" aria-checked={active}
                      onClick={() => setQuality(q)}
                      className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-blush-pink bg-[#FFF3EC]' : 'border-line hover:border-peach'}`}>
                      <div className="text-sm font-semibold text-dark">
                        {q === 'hd' ? 'HD' : 'Standard'} {QUALITY_TARGETS[q].label}
                      </div>
                      <div className="text-[11px] text-cocoa">{q === 'hd' ? `+PHP ${hdPrice} once` : 'Included'}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-light mt-1">Applies to every memory in this album, for its whole hosting term.</p>
            </div>
          )}
          {!initial && tierLocked === true && hdPrice > 0 && (
            <p className="text-[11px] text-stone">
              Quality: <b className="text-cocoa">{quality === 'hd' ? `HD ${QUALITY_TARGETS.hd.label}` : `Standard ${QUALITY_TARGETS.standard.label}`}</b> - set with your first memory.
            </p>
          )}

          {/* Picker */}
          <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" className="hidden"
            onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={checking || busy}
            className="w-full rounded-xl border-2 border-dashed border-peach bg-cream px-4 py-4 text-sm font-semibold text-cocoa flex items-center justify-center gap-2 disabled:opacity-60">
            {checking ? <><Loader2 size={16} className="animate-spin" /> Checking your video…</>
              : <><Upload size={16} /> {file ? 'Choose a different video' : initial ? 'Replace with a new video' : 'Choose a video'}</>}
          </button>
          {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

          {/* Preview of the picked file — the live proof, before anything is saved */}
          {file && previewUrl && (
            <div className="rounded-xl border border-line bg-[#FAFAFA] p-2">
              <video key={previewUrl} src={previewUrl} controls autoPlay muted playsInline preload="metadata" className="w-full max-h-64 rounded-lg bg-black" />
              <p className="text-[11px] text-medium mt-2 flex items-center gap-1 justify-center text-center">
                <Play size={11} className="text-blush-pink shrink-0" fill="currentColor" />
                {file.name} · {mb} MB{meta?.durationSec != null ? ` · ${Math.round(meta.durationSec)} s` : ''}
              </p>
            </div>
          )}

          {onCorner && (
            <div>
              <label className="text-xs text-medium mb-1.5 block">Which corner should the QR sit in?</label>
              <div className="flex items-center gap-3">
                {allowAuto && (
                  <button type="button" onClick={() => onCorner(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition ${corner == null ? 'bg-peach text-white' : 'bg-cream text-cocoa hover:bg-blush'}`}
                    title="Auto — tuck it into the corner away from the face">
                    ✨ Auto
                  </button>
                )}
                <div className="relative rounded-lg border-2 border-dashed border-[#E8D9CC] bg-[#FBF6F1] shrink-0" style={{ width: 92, height: 68 }}>
                  {QR_CORNERS.map((c) => {
                    const active = corner === c;
                    return (
                      <button key={c} type="button" onClick={() => onCorner(c)}
                        aria-label={CORNER_LABELS[c]} title={CORNER_LABELS[c]}
                        className={`absolute w-6 h-6 rounded-[5px] flex items-center justify-center transition ${active ? 'bg-blush-pink ring-2 ring-peach' : 'bg-white border border-[#E0D3C6] hover:bg-blush'}`}
                        style={CORNER_POS[c]}>
                        {active && <span className="w-2.5 h-2.5 rounded-[2px] bg-white" />}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-light leading-snug">
                  {corner == null ? 'Auto places it away from the face.' : `Placed in the ${CORNER_LABELS[corner].toLowerCase()} corner.`}
                </span>
              </div>
            </div>
          )}

          {initial && (
            <div className="flex items-center gap-3 rounded-lg bg-[#FAFAFA] p-2">
              <img src={initial.qrPngDataUrl} alt="QR preview" className="w-12 h-12 shrink-0" />
              <span className="text-[11px] text-light break-all">{initial.memoryUrl}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line shrink-0">
          {initial ? (
            <button onClick={() => void remove()} className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} /> Remove
            </button>
          ) : <span />}
          <button onClick={() => void confirm()} disabled={busy || !file}
            className="px-5 py-2 rounded-lg bg-peach text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60 flex items-center gap-2">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (initial ? 'Use this video' : 'Place QR')}
          </button>
        </div>
      </div>
    </div>
  );
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'a link'; }
}

/* ══════════════════════════════════════════════════════════════════════════
   LEGACY LINK FLOW — retired once 0030 is live. Kept verbatim so a client that
   deploys ahead of the migration behaves exactly as before.
   ══════════════════════════════════════════════════════════════════════════ */
function LegacyLinkModal({ initial, onSave, onRemove, onClose, corner, onCorner, allowAuto }: AddQrModalProps) {
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const [url, setUrl] = useState(initial?.destination ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (!user) {
      setError('Please sign in first — a QR memory is saved to your Megyprints account so it opens for anyone who scans it (no app needed) and you can re-point it later.');
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        const ok = await updateMemoryDestination(initial.code, v.url);
        if (!ok) { setError('Couldn’t save the new link. Please try again.'); return; }
        onSave({ ...initial, destination: v.url });
        return;
      }
      let fill: QrFill | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = mintCode();
        const memUrl = memoryUrl(code);
        const qrPngDataUrl = await generateQrPngDataUrl(memUrl);
        const candidate: QrFill = { code, destination: v.url, qrPngDataUrl, memoryUrl: memUrl, createdAt: Date.now(), kind: 'link' };
        const res = await tryCreateMemory(candidate);
        if (res === 'conflict') continue;
        if (res === 'skip') { setError('Please sign in first to save the QR memory.'); return; }
        if (res === 'error') { setError('Couldn’t save the QR just now. Please try again.'); return; }
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <span className="text-sm font-semibold text-dark flex items-center gap-2">
            <Youtube size={18} className="text-blush-pink" /> {initial ? 'Edit YouTube Memory' : 'Add a YouTube Memory'}
          </span>
          <button onClick={onClose} className="text-light p-1"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {!user && (
            <div className="text-[11px] leading-snug text-cocoa bg-[#FFF3EC] border border-peach/60 rounded-lg px-3 py-2">
              <span className="font-semibold">Sign in to add a QR.</span> The link is saved to your account so it opens for anyone who scans it — no app needed — and you can re-point it anytime.
            </div>
          )}
          <div>
            <label className="text-xs text-medium mb-1 block">YouTube link</label>
            <input value={url} onChange={(e) => { setUrl(e.target.value); if (error) setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              inputMode="url" autoComplete="off" placeholder="https://youtu.be/…" aria-invalid={!!error}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-line'}`} />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          {embed && (
            <div className="rounded-xl border border-line bg-[#FAFAFA] p-2">
              <div className={`relative overflow-hidden rounded-lg bg-black mx-auto ${embed.portrait ? 'w-[200px] aspect-[9/16]' : 'w-full aspect-video'}`}>
                <iframe key={embed.src} src={previewSrc} title="Memory video preview" className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              </div>
            </div>
          )}
          {onCorner && (
            <div className="flex items-center gap-3">
              {allowAuto && (
                <button type="button" onClick={() => onCorner(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${corner == null ? 'bg-peach text-white' : 'bg-cream text-cocoa'}`}>✨ Auto</button>
              )}
              <div className="relative rounded-lg border-2 border-dashed border-[#E8D9CC] bg-[#FBF6F1] shrink-0" style={{ width: 92, height: 68 }}>
                {QR_CORNERS.map((c) => (
                  <button key={c} type="button" onClick={() => onCorner(c)} aria-label={CORNER_LABELS[c]}
                    className={`absolute w-6 h-6 rounded-[5px] ${corner === c ? 'bg-blush-pink ring-2 ring-peach' : 'bg-white border border-[#E0D3C6]'}`}
                    style={CORNER_POS[c]} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line">
          {initial ? (
            <button onClick={onRemove} className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg"><Trash2 size={14} /> Remove</button>
          ) : <span />}
          {!user ? (
            <button onClick={openLogin} className="px-5 py-2 rounded-lg bg-peach text-white text-sm font-semibold flex items-center gap-2"><LogIn size={15} /> Log In to continue</button>
          ) : (
            <button onClick={confirm} disabled={busy} className="px-5 py-2 rounded-lg bg-peach text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : (initial ? 'Save' : 'Generate QR')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
