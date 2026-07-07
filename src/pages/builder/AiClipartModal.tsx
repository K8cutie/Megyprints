import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Trash2, Loader2, Search } from 'lucide-react';
import type { OrnamentFill } from './types';
import { ornamentDataUri, rasterizeOrnamentPng } from './ornaments';
import { fetchThemeClipart, type ClipartItem } from '../../lib/clipart';

const THEME_KEY = 'megy-album-theme';

/* AI-themed graphic picker for a combo-box slot. Reads the album's theme (asked
   at setup, stored locally), asks the /api/theme-keywords proxy for search words
   (Haiku when a key is set, dumb-split otherwise), pulls matching vectors from the
   open Iconify library, and on tap rasterizes the chosen one to a crisp PNG —
   reusing the ornament fill + 3-renderer pipeline. Editable theme so the user can
   steer the results. */
export default function AiClipartModal({ initial, onSave, onRemove, onClose }: {
  initial: OrnamentFill | null;
  onSave: (fill: OrnamentFill) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState('');
  const [items, setItems] = useState<ClipartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (t: string) => {
    const q = t.trim();
    if (!q) return;
    try { localStorage.setItem(THEME_KEY, q); } catch { /* ignore */ }
    setLoading(true); setError(''); setSearched(true);
    try {
      const found = await fetchThemeClipart(q, 24);
      setItems(found);
      if (!found.length) setError('No matches — try simpler words (e.g. “beach”, “birthday”).');
    } catch {
      setError('Couldn’t load graphics just now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // On open: seed the theme from setup + auto-search if we already have one.
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch { /* ignore */ }
    setTheme(saved);
    if (saved.trim()) void runSearch(saved);
  }, [runSearch]);

  const pick = async (item: ClipartItem) => {
    if (busyId) return;
    setError(''); setBusyId(item.id);
    try {
      const pngDataUrl = await rasterizeOrnamentPng(item.svg);
      onSave({ pack: 'ai', id: item.id, pngDataUrl, appliedAt: Date.now() });
    } catch {
      setError('Couldn’t add that graphic. Please try another.');
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8] shrink-0">
          <span className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
            <Sparkles size={18} className="text-[#E8A598]" /> {initial ? 'Change graphic' : 'Add a graphic'}
          </span>
          <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
        </div>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <label className="text-[11px] text-[#9B8B7A] mb-1 block">Graphics that match your album’s theme</label>
          <div className="flex gap-2">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(theme); }}
              placeholder="e.g. beach trip, 1st birthday, wedding"
              className="flex-1 border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={() => void runSearch(theme)} disabled={loading || !theme.trim()}
              className="px-3 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 overflow-y-auto">
          {loading && (
            <div className="py-10 flex flex-col items-center gap-2 text-[#9B9B9B]">
              <Loader2 size={22} className="animate-spin text-[#E8A598]" />
              <span className="text-xs">Finding graphics for “{theme.trim()}”…</span>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {items.map((it) => (
                <button key={it.id} onClick={() => pick(it)} disabled={!!busyId} title={it.id.split(':')[1]}
                  className="relative aspect-square rounded-xl border border-[#EDE7E0] bg-white hover:bg-[#FFF8F0] p-2.5 flex items-center justify-center transition active:scale-[0.97] disabled:opacity-60">
                  <img src={ornamentDataUri(it.svg)} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
                  {busyId === it.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                      <Loader2 size={20} className="animate-spin text-[#E8A598]" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {!loading && searched && items.length === 0 && (
            <p className="py-8 text-center text-xs text-[#9B9B9B]">{error || 'No graphics found.'}</p>
          )}
          {!loading && !searched && (
            <p className="py-8 text-center text-xs text-[#9B9B9B]">Type what your album’s about, then tap search.</p>
          )}
          {error && items.length > 0 && <p className="text-xs text-red-500 mt-3 text-center">{error}</p>}
        </div>

        {initial && (
          <div className="px-5 py-3 border-t border-[#E8E8E8] shrink-0">
            <button onClick={onRemove} className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} /> Remove graphic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
