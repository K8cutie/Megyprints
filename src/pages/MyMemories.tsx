import { useEffect, useRef, useState } from 'react';
import { QrCode, Copy, Check, Trash2, Loader2, ExternalLink, Upload, Clock } from 'lucide-react';
import { listMemories, updateMemoryDestination, removeMemory, type QrMemoryRow } from '../lib/qrMemories';
import { memoryUrl, generateQrPngDataUrl, validateDestination } from '../lib/qrMemory';
import { validateClipFile, uploadClip, publicClipUrl, isHostedClipUrl } from '../lib/memoryClips';

const fmtMonth = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
};
const renewCodeFromHash = (): string | null => {
  try {
    const q = window.location.hash.split('?')[1] || '';
    const c = new URLSearchParams(q).get('renew') || '';
    return /^[a-z2-9]{4,32}$/.test(c) ? c : null;
  } catch { return null; }
};

/* "My Memories" — manage the QR living-memories tied to your printed albums.
   The printed QR never changes; here you re-point where it goes (relink) —
   the same physical code, a new destination. Owner-scoped via RLS. */
export default function MyMemories() {
  const [rows, setRows] = useState<QrMemoryRow[] | null>(null);
  const [err, setErr] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [renewCode] = useState<string | null>(() => renewCodeFromHash());

  useEffect(() => {
    let alive = true;
    listMemories()
      .then((r) => {
        if (!alive) return;
        setRows(r);
        r.forEach(async (row) => {
          try {
            const png = await generateQrPngDataUrl(memoryUrl(row.code), 180);
            if (alive) setThumbs((t) => ({ ...t, [row.code]: png }));
          } catch { /* thumbnail is cosmetic */ }
        });
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 mb-1">
        <QrCode className="text-blush-pink" size={22} />
        <h1 className="font-display text-2xl font-semibold text-dark">My Memories</h1>
      </div>
      <p className="text-sm text-medium mb-6">
        Each QR printed in your album points here. Re-point it anytime — <span className="font-medium text-cocoa">the printed code stays the same</span>, the video updates. No reprint.
      </p>

      {renewCode && (
        <div className="mb-4 rounded-xl border border-peach bg-[#FFF3EC] px-4 py-3 text-sm text-cocoa">
          <b className="text-dark">Renew memory {renewCode}.</b> Renewals are handled by the Megy Prints team for now —
          <a href="#/contact" className="underline font-semibold ml-1">message us</a> with this code and the term you want, and we'll extend it. Your video is kept safe meanwhile.
        </div>
      )}
      {err && <p className="text-sm text-red-500 mb-4">{err}</p>}
      {rows === null && !err && (
        <div className="flex items-center gap-2 text-sm text-light py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-center py-16 text-light">
          <QrCode size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No QR memories yet. Add one to any album page in the builder.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows?.map((row) => (
          <MemoryRow
            key={row.code} row={row} thumb={thumbs[row.code]} highlight={row.code === renewCode}
            onRemoved={() => setRows((rs) => rs?.filter((r) => r.code !== row.code) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

function MemoryRow({ row, thumb, highlight, onRemoved }: { row: QrMemoryRow; thumb?: string; highlight?: boolean; onRemoved: () => void }) {
  const url = memoryUrl(row.code);
  const [dest, setDest] = useState(row.destination);
  /** What the row points at NOW (updates after a relink/replace without
   *  mutating the prop). */
  const [saved, setSaved] = useState(row.destination);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [now] = useState(() => Date.now());
  const dirty = dest.trim() !== saved;
  const isClip = row.kind === 'clip' || isHostedClipUrl(saved);
  const expired = !!row.expires_at && new Date(row.expires_at).getTime() < now;
  const fileRef = useRef<HTMLInputElement>(null);

  // Hosted clip: REPLACE the video in place — same code, same printed QR.
  const replaceClip = async (f: File | null) => {
    if (!f) return;
    setSaving(true); setMsg(null);
    try {
      const v = await validateClipFile(f);
      if (!v.ok) { setMsg({ text: v.error, ok: false }); return; }
      await uploadClip(row.code, v.ext, f, { replace: true });
      const next = publicClipUrl(row.code, v.ext);
      if (next !== saved) {
        const ok = await updateMemoryDestination(row.code, next);
        if (!ok) { setMsg({ text: 'Uploaded, but could not re-point the QR. Try again.', ok: false }); return; }
        setSaved(next); setDest(next);
      }
      setMsg({ text: 'Video replaced ✓ — same QR, new memory', ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not replace the video.', ok: false });
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    const v = validateDestination(dest);
    if ('error' in v) { setMsg({ text: v.error, ok: false }); return; }
    setSaving(true); setMsg(null);
    const ok = await updateMemoryDestination(row.code, v.url);
    setSaving(false);
    if (ok) { setDest(v.url); setSaved(v.url); setMsg({ text: 'Re-pointed ✓ — same QR, new video', ok: true }); }
    else setMsg({ text: 'Could not save. Try again.', ok: false });
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (await removeMemory(row.code)) onRemoved();
  };

  return (
    <div className={`flex gap-4 bg-white rounded-2xl border p-4 ${highlight ? 'border-blush-pink ring-2 ring-peach/50' : 'border-line-soft'}`}>
      <div className="shrink-0 w-20 h-20 rounded-lg border border-line bg-white flex items-center justify-center overflow-hidden">
        {thumb ? <img src={thumb} alt="QR" className="w-full h-full object-contain" /> : <QrCode size={28} className="text-[#D4D4D4]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <code className="text-[11px] text-light truncate">{url}</code>
          <button onClick={copy} className="shrink-0 text-light hover:text-blush-pink p-1" title="Copy link">
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>
        {row.expires_at && (
          <p className={`text-[11px] mb-1.5 flex items-center gap-1 ${expired ? 'text-red-600 font-semibold' : 'text-cocoa'}`}>
            <Clock size={11} /> {expired ? `Hosting ended ${fmtMonth(row.expires_at)} — renew to bring it back` : `Live until ${fmtMonth(row.expires_at)}`}
          </p>
        )}
        {isClip ? (
          <div>
            <video src={saved} controls muted playsInline preload="metadata" className="w-full max-h-48 rounded-lg bg-black mb-2" />
            <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" className="hidden" onChange={(e) => void replaceClip(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileRef.current?.click()} disabled={saving}
              className="px-3 py-2 rounded-lg bg-peach text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Replace video
            </button>
          </div>
        ) : (<>
        <label className="text-[11px] text-medium block mb-1">Points to</label>
        <div className="flex gap-2">
          <input
            value={dest}
            onChange={(e) => { setDest(e.target.value); if (msg) setMsg(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
            inputMode="url" placeholder="https://youtu.be/…"
            className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm"
          />
          <a href={saved} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center px-2 text-light hover:text-blush-pink" title="Open current"><ExternalLink size={16} /></a>
          <button onClick={save} disabled={!dirty || saving}
            className="shrink-0 px-3 py-2 rounded-lg bg-peach text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        </>)}
        {msg && <p className={`text-xs mt-1 ${msg.ok ? 'text-success' : 'text-red-500'}`}>{msg.text}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-light">{row.scan_count} scan{row.scan_count === 1 ? '' : 's'}</span>
          <button onClick={del} onBlur={() => setConfirmDel(false)}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg ${confirmDel ? 'bg-red-50 text-red-600 font-semibold' : 'text-[#B4B4B4] hover:text-red-500'}`}>
            <Trash2 size={13} /> {confirmDel ? 'Tap again to delete' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
