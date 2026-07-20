import { useState, useEffect, useCallback } from 'react';
import { X, Quote, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { fetchThemeQuotes, forgetThemeQuotes, curatedQuotesFor, MAX_QUOTE_CHARS } from '../../lib/quotes';

const THEME_KEY = 'megy-album-theme';

/* Themed quote picker for a caption box. Reads the album's free-text theme
   (asked at setup, stored locally), asks the /api/theme-quotes proxy for short
   ORIGINAL lines written for that exact theme, and falls back to the curated
   corpus when there's no key or no network — so it always offers something.

   The chosen line is written through the caller's setBoxText/setSlotText, which
   already evicts whatever else occupies the box: one box, one thing. */
export default function QuotePickerModal({ initial, onPick, onRemove, onClose, mobile }: {
  /** The line currently in this box, if any — enables Change/Remove wording. */
  initial?: string | null;
  onPick: (quote: string) => void;
  onRemove?: () => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  // Seeded from the theme picked at setup, so the first render already has it —
  // no setState inside the mount effect.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch { return ''; }
  });
  const [quotes, setQuotes] = useState<string[]>([]);
  const [source, setSource] = useState<'ai' | 'curated'>('curated');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (t: string, fresh = false) => {
    const q = t.trim();
    try { if (q) localStorage.setItem(THEME_KEY, q); } catch { /* ignore */ }
    setLoading(true);
    try {
      if (fresh && q) forgetThemeQuotes(q);   // "More lines" → regenerate, don't serve the cache
      const set = await fetchThemeQuotes(q);
      setQuotes(set.quotes);
      setSource(set.source);
    } catch {
      setQuotes(curatedQuotesFor(q));
      setSource('curated');
    } finally {
      setLoading(false);
    }
  }, []);

  // On open: load lines straight away — the point of this picker is to offer
  // lines, not to ask the user to search first. Deferred a microtask so the
  // effect body itself doesn't set state.
  useEffect(() => {
    void Promise.resolve().then(() => load(theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Body = (
    <>
      <div className="px-4 pt-3 pb-2 shrink-0">
        <label className="text-[11px] text-[#9B8B7A] mb-1 block">Lines written for your album’s theme</label>
        <div className="flex gap-2">
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(theme, true); }}
            placeholder="e.g. Marriage, 1st birthday, Palawan trip"
            className="flex-1 border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => void load(theme, true)}
            disabled={loading}
            title="More lines"
            className="px-3 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 overflow-y-auto">
        {loading && (
          <div className="py-10 flex flex-col items-center gap-2 text-[#9B9B9B]">
            <Loader2 size={22} className="animate-spin text-[#E8A598]" />
            <span className="text-xs">Writing lines for “{theme.trim() || 'your album'}”…</span>
          </div>
        )}

        {!loading && quotes.length > 0 && (
          <div className="flex flex-col gap-2">
            {quotes.map((q) => (
              <button
                key={q}
                onClick={() => { onPick(q); onClose(); }}
                className={`text-left px-3.5 py-3 rounded-xl border transition active:scale-[0.99] ${
                  q === initial
                    ? 'border-[#E8A598] bg-[#FDE8E4]'
                    : 'border-[#EDE7E0] bg-[#FFF8F0] hover:bg-[#FDE8E4]'
                }`}
              >
                <span className="text-sm text-[#2D2D2D] font-serif italic leading-snug">{q}</span>
              </button>
            ))}
          </div>
        )}

        {!loading && quotes.length === 0 && (
          <p className="py-8 text-center text-xs text-[#9B9B9B]">
            Type what your album’s about, then tap refresh.
          </p>
        )}

        {!loading && quotes.length > 0 && (
          <p className="text-[10px] text-[#B5A99B] mt-3 text-center">
            {source === 'ai'
              ? `Written for “${theme.trim()}”. Tap refresh for a different set.`
              : theme.trim()
                ? `Our curated lines for “${theme.trim()}”.`
                : 'Our curated lines — add an album theme above for lines written for it.'}
            {' '}Max {MAX_QUOTE_CHARS} characters so it prints cleanly.
          </p>
        )}
      </div>
    </>
  );

  const Header = (
    <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8] shrink-0">
      <span className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
        <Quote size={18} className="text-[#E8A598]" /> {initial ? 'Change quote' : 'Add a quote'}
      </span>
      <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={18} /></button>
    </div>
  );

  const Footer = initial && onRemove ? (
    <div className="px-5 py-3 border-t border-[#E8E8E8] shrink-0">
      <button onClick={() => { onRemove(); onClose(); }}
        className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
        <Trash2 size={14} /> Remove quote
      </button>
    </div>
  ) : null;

  if (mobile) {
    return (
      <div className="absolute inset-0 z-[120] bg-black/40 flex items-end" onClick={onClose}>
        <div className="w-full bg-white rounded-t-2xl flex flex-col max-h-[80%]" onClick={(e) => e.stopPropagation()}>
          {Header}{Body}{Footer}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        {Header}{Body}{Footer}
      </div>
    </div>
  );
}
