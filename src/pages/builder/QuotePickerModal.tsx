import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Quote, Loader2, RefreshCw, Trash2, Pencil, Sparkles } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';
import { fetchThemeQuotes, moreThemeQuotes, curatedQuotesFor, MAX_QUOTE_CHARS } from '../../lib/quotes';
import { readAlbumTheme, writeAlbumTheme, cleanAlbumTheme, MAX_THEME_LENGTH } from '../../lib/albumTheme';
import { writeLinesForPhotos, type QuoteBox } from '../../lib/photoQuotes';
import { quoteRoom, captionFits } from './textFit';
import { useAuth } from '../../lib/authContext';
import { useAuthModal } from '../../components/AuthModalProvider';

/** What the picker says when "Write a line for this photo" can't give lines.
 *  Every way it ends gets words, and the lines below always stay. */
export const PHOTO_QUOTE_MESSAGES: Record<'limit_user' | 'limit_all' | 'refused' | 'failed' | 'no_fit', string> = {
  limit_user: 'You have used today’s lines for photos. Try again tomorrow, or pick a line below.',
  limit_all: 'Lines for photos are busy today. Try again tomorrow, or pick a line below.',
  refused: 'Megy couldn’t write lines for this photo. Pick a line below.',
  failed: 'Couldn’t write lines just now. Tap to try again.',
  no_fit: 'Megy’s lines were too long for this box. Tap to try again, or pick a line below.',
};

/* Themed quote picker for a caption box. Reads the album's free-text theme
   (asked at setup, stored locally), asks the /api/theme-quotes proxy for short
   ORIGINAL lines written for that exact theme, and falls back to the curated
   corpus when there's no key or no network — so it always offers something.

   The chosen line is written through the caller's setBoxText/setSlotText, which
   already evicts whatever else occupies the box: one box, one thing. */
export default function QuotePickerModal({ initial, onPick, onRemove, onEdit, onClose, mobile, photoUrls = [], quoteBox = null, autoWrite = false }: {
  /** Opened from an EMPTY quote box ("Let AI write a quote"): start writing
   *  lines for the page's photos right away — one tap, not two. */
  autoWrite?: boolean;
  /** The line currently in this box, if any — enables Change/Remove wording. */
  initial?: string | null;
  /** The photos on this box's page (photoQuotes.pagePhotoUrls). With any,
   *  "Write a line for this photo" offers lines written for them. */
  photoUrls?: string[];
  /** The quote box (photoQuotes.quoteBoxFor): lines are written for the room
   *  it has and offered only if they fit. Without it: the caption cap. */
  quoteBox?: QuoteBox | null;
  onPick: (quote: string) => void;
  onRemove?: () => void;
  /** Tapping a quote that is already on the page opens THIS pool (owner,
   *  2026-10-20: "I thought clicking a quote gives a pool to select from").
   *  Changing its words or font is one tap away: this hands the box to the
   *  typing editor. */
  onEdit?: () => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  // Keyboard (KB-2): focus in, Tab kept inside, Escape closes.
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);
  // Seeded from the theme picked at setup, so the first render already has it —
  // no setState inside the mount effect.
  const [theme, setTheme] = useState(readAlbumTheme);
  const [quotes, setQuotes] = useState<string[]>([]);
  const [source, setSource] = useState<'ai' | 'curated'>('curated');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (t: string, fresh = false) => {
    // The album's occasion, held to the same length as Step 1 (albumTheme):
    // an uncapped one broke albums_occasion_chk and every save after it.
    const q = cleanAlbumTheme(t);
    if (q) writeAlbumTheme(q);
    setLoading(true);
    try {
      // "More lines" → GROW the theme's pool (the album deals from it, so the
      // held lines are kept — never thrown away and regenerated).
      const set = fresh && q ? await moreThemeQuotes(q) : await fetchThemeQuotes(q);
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

  // ── "Write a line for this photo" ── Signed in only (it costs per tap); a
  // signed-out tap is answered with the sign-in step, never a greyed button,
  // and carries on by itself once they're in.
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const [photoLines, setPhotoLines] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  /** A signed-out tap, waiting for the sign-in to finish: carry on ONCE. */
  const resumeRef = useRef(false);
  const many = photoUrls.length > 1;

  const writeForPhoto = useCallback(async () => {
    if (!user) { resumeRef.current = true; setNeedSignIn(true); return; }
    setNeedSignIn(false);
    setPhotoNote(null);
    setPhotoBusy(true);
    // As long as the box takes (a full sentence in a big box, a short line in
    // a thin band); without a box or a way to measure, the server's caption cap.
    const room = quoteBox ? quoteRoom(quoteBox.box, quoteBox.style) : null;
    const r = await writeLinesForPhotos(photoUrls, cleanAlbumTheme(theme), photoLines, room ?? undefined);
    setPhotoBusy(false);
    if ('lines' in r) {
      // Offered only if it prints whole in this box, checked the way print wraps.
      const fit = quoteBox ? r.lines.filter((l) => captionFits(l, quoteBox.style, quoteBox.box)?.fits ?? true) : r.lines;
      if (fit.length) { setPhotoLines(fit); return; }
      setPhotoNote(PHOTO_QUOTE_MESSAGES.no_fit);
      return;
    }
    // Signed in here but the session ran out on the server: sign in again.
    if (r.error === 'sign_in') { setNeedSignIn(true); return; }
    setPhotoNote(PHOTO_QUOTE_MESSAGES[r.error]);
  }, [user, photoUrls, theme, photoLines, quoteBox]);

  useEffect(() => {
    if (!resumeRef.current || !user) return;
    resumeRef.current = false;
    void Promise.resolve().then(writeForPhoto);
  }, [user, writeForPhoto]);

  // "Let AI write a quote" on an empty box: start at once, ONCE (signed out,
  // that's the sign-in step, which carries on by itself after).
  const autoRef = useRef(autoWrite);
  useEffect(() => {
    if (!autoRef.current || photoUrls.length === 0) return;
    autoRef.current = false;
    void Promise.resolve().then(writeForPhoto);
  }, [photoUrls.length, writeForPhoto]);

  const PhotoSection = photoUrls.length === 0 ? null : (
    <div className="px-4 pt-3 shrink-0" data-testid="photo-quote">
      {photoBusy ? (
        <div className="py-4 flex items-center justify-center gap-2 text-light">
          <Loader2 size={18} className="animate-spin text-blush-pink" />
          <span className="text-xs">Looking at the photo{many ? 's' : ''}…</span>
        </div>
      ) : photoLines.length > 0 ? (
        <>
          <p className="text-[11px] text-stone mb-1" data-testid="photo-quote-heading">Written for {many ? 'these photos' : 'this photo'}</p>
          <div className="flex flex-col gap-2">
            {photoLines.map((q) => (
              <button key={q} data-testid="photo-quote-line" onClick={() => { onPick(q); onClose(); }}
                className="text-left px-3.5 py-3 rounded-xl border border-peach bg-blush hover:bg-cream transition active:scale-[0.99]">
                <span className="text-sm text-dark font-serif italic leading-snug">{q}</span>
              </button>
            ))}
          </div>
          <button onClick={() => void writeForPhoto()} data-testid="photo-quote-more"
            className="mt-2 text-xs font-semibold text-blush-pink flex items-center gap-1 px-1 py-1">
            <Sparkles size={13} /> Write 3 more
          </button>
        </>
      ) : (
        <>
          <button onClick={() => void writeForPhoto()} data-testid="photo-quote-write"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-peach text-blush-pink text-sm font-semibold active:scale-[0.99] transition">
            <Sparkles size={16} /> Write a line for {many ? 'these photos' : 'this photo'}
          </button>
          <p className="text-[10px] text-[#B5A99B] mt-1 text-center">
            A small copy of {many ? 'each photo' : 'the photo'} on this page goes to Claude AI (Anthropic) to write 3 lines. We don’t keep it.
          </p>
        </>
      )}
      {needSignIn && (
        <div className="mt-2 text-[11px] leading-snug text-cocoa bg-blush border border-peach/60 rounded-lg px-3 py-2 flex items-center justify-between gap-2" data-testid="photo-quote-sign-in">
          <span><span className="font-semibold">Sign in first</span> to have Megy write lines for {many ? 'these photos' : 'this photo'}.</span>
          <button onClick={openLogin} className="shrink-0 px-3 py-1.5 rounded-lg bg-peach text-white text-xs font-semibold">Sign in</button>
        </div>
      )}
      {photoNote && <p className="mt-2 text-[11px] text-cocoa" data-testid="photo-quote-note">{photoNote}</p>}
    </div>
  );

  const Body = (
    <>
      {PhotoSection}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <label className="text-[11px] text-stone mb-1 block">Lines written for your album’s theme</label>
        <div className="flex gap-2">
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={MAX_THEME_LENGTH}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(theme, true); }}
            placeholder="e.g. Marriage, 1st birthday, Palawan trip"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => void load(theme, true)}
            disabled={loading}
            title="More lines"
            className="px-3 rounded-lg bg-peach text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 overflow-y-auto">
        {loading && (
          <div className="py-10 flex flex-col items-center gap-2 text-light">
            <Loader2 size={22} className="animate-spin text-blush-pink" />
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
                    ? 'border-blush-pink bg-blush'
                    : 'border-line-soft bg-cream hover:bg-blush'
                }`}
              >
                <span className="text-sm text-dark font-serif italic leading-snug">{q}</span>
              </button>
            ))}
          </div>
        )}

        {!loading && quotes.length === 0 && (
          <p className="py-8 text-center text-xs text-light">
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
    <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
      <span className="text-sm font-semibold text-dark flex items-center gap-2">
        <Quote size={18} className="text-blush-pink" /> {initial ? 'Change quote' : 'Add a quote'}
      </span>
      <button onClick={onClose} className="text-light p-1" aria-label="Close"><X size={18} /></button>
    </div>
  );

  const Footer = initial && (onRemove || onEdit) ? (
    <div className="px-5 py-3 border-t border-line shrink-0 flex items-center justify-between gap-2">
      {onEdit ? (
        <button onClick={() => { onClose(); onEdit(); }} data-testid="quote-edit-words"
          className="text-xs font-medium text-dark flex items-center gap-1 px-2 py-2 hover:bg-cream rounded-lg">
          <Pencil size={14} /> Edit the words
        </button>
      ) : <span />}
      {onRemove && (
        <button onClick={() => { onRemove(); onClose(); }}
          className="text-xs font-medium text-red-500 flex items-center gap-1 px-2 py-2 hover:bg-red-50 rounded-lg">
          <Trash2 size={14} /> Remove quote
        </button>
      )}
    </div>
  ) : null;

  if (mobile) {
    return (
      <div className="absolute inset-0 z-[120] bg-black/40 flex items-end" onClick={onClose}>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label={'Choose a quote'} tabIndex={-1} className="w-full bg-white rounded-t-2xl flex flex-col max-h-[80%]" onClick={(e) => e.stopPropagation()}>
          {Header}{Body}{Footer}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={'Choose a quote'} tabIndex={-1} className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        {Header}{Body}{Footer}
      </div>
    </div>
  );
}
