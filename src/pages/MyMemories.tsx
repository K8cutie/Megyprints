import { useEffect, useState } from 'react';
import { QrCode, Copy, Check, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { listMemories, updateMemoryDestination, removeMemory, type QrMemoryRow } from '../lib/qrMemories';
import { memoryUrl, generateQrPngDataUrl, validateDestination } from '../lib/qrMemory';

/* "My Memories" — manage the QR living-memories tied to your printed albums.
   The printed QR never changes; here you re-point where it goes (relink) —
   the same physical code, a new destination. Owner-scoped via RLS. */
export default function MyMemories() {
  const [rows, setRows] = useState<QrMemoryRow[] | null>(null);
  const [err, setErr] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

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
        <QrCode className="text-[#E8A598]" size={22} />
        <h1 className="font-display text-2xl font-semibold text-[#2D2D2D]">My Memories</h1>
      </div>
      <p className="text-sm text-[#6B6B6B] mb-6">
        Each QR printed in your album points here. Re-point it anytime — <span className="font-medium text-[#8B6F47]">the printed code stays the same</span>, the video updates. No reprint.
      </p>

      {err && <p className="text-sm text-red-500 mb-4">{err}</p>}
      {rows === null && !err && (
        <div className="flex items-center gap-2 text-sm text-[#9B9B9B] py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-center py-16 text-[#9B9B9B]">
          <QrCode size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No QR memories yet. Add one to any album page in the builder.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows?.map((row) => (
          <MemoryRow
            key={row.code} row={row} thumb={thumbs[row.code]}
            onRemoved={() => setRows((rs) => rs?.filter((r) => r.code !== row.code) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

function MemoryRow({ row, thumb, onRemoved }: { row: QrMemoryRow; thumb?: string; onRemoved: () => void }) {
  const url = memoryUrl(row.code);
  const [dest, setDest] = useState(row.destination);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = dest.trim() !== row.destination;

  const save = async () => {
    const v = validateDestination(dest);
    if ('error' in v) { setMsg({ text: v.error, ok: false }); return; }
    setSaving(true); setMsg(null);
    const ok = await updateMemoryDestination(row.code, v.url);
    setSaving(false);
    if (ok) { setDest(v.url); row.destination = v.url; setMsg({ text: 'Re-pointed ✓ — same QR, new video', ok: true }); }
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
    <div className="flex gap-4 bg-white rounded-2xl border border-[#F0F0F0] p-4">
      <div className="shrink-0 w-20 h-20 rounded-lg border border-[#E8E8E8] bg-white flex items-center justify-center overflow-hidden">
        {thumb ? <img src={thumb} alt="QR" className="w-full h-full object-contain" /> : <QrCode size={28} className="text-[#D4D4D4]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <code className="text-[11px] text-[#9B9B9B] truncate">{url}</code>
          <button onClick={copy} className="shrink-0 text-[#9B9B9B] hover:text-[#E8A598] p-1" title="Copy link">
            {copied ? <Check size={14} className="text-[#2E7D4A]" /> : <Copy size={14} />}
          </button>
        </div>
        <label className="text-[11px] text-[#6B6B6B] block mb-1">Points to</label>
        <div className="flex gap-2">
          <input
            value={dest}
            onChange={(e) => { setDest(e.target.value); if (msg) setMsg(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
            inputMode="url" placeholder="https://youtu.be/…"
            className="flex-1 min-w-0 border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm"
          />
          <a href={row.destination} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center px-2 text-[#9B9B9B] hover:text-[#E8A598]" title="Open current"><ExternalLink size={16} /></a>
          <button onClick={save} disabled={!dirty || saving}
            className="shrink-0 px-3 py-2 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        {msg && <p className={`text-xs mt-1 ${msg.ok ? 'text-[#2E7D4A]' : 'text-red-500'}`}>{msg.text}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-[#9B9B9B]">{row.scan_count} scan{row.scan_count === 1 ? '' : 's'}</span>
          <button onClick={del} onBlur={() => setConfirmDel(false)}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg ${confirmDel ? 'bg-red-50 text-red-600 font-semibold' : 'text-[#B4B4B4] hover:text-red-500'}`}>
            <Trash2 size={13} /> {confirmDel ? 'Tap again to delete' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
