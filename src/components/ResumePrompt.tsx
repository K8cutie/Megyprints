import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, BookOpen, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { supabaseConfigured } from '../lib/supabase';
import { listAccountAlbums } from '../lib/useAlbumSync';
import { readLocalDraftSummary } from '../lib/localDraft';
import { chooseResumeOffers, type ResumeOffer, type SavedAlbumSummary } from '../lib/resumeOffer';
import { readResumeCache, writeResumeCache, hasStoredSession, rememberedNoAlbums } from '../lib/resumeCache';
import {
  wasResumeAsked, wasResumeAskedThisVisit, markResumeAsked, clearResumeAsked, startFreshAlbum, skipsResumePrompts,
} from '../lib/albumSession';
import { formatRelativeTime } from './UserProjectsSection';
import { useModalDialog } from '../lib/useModalDialog';
import { useRecoveryState } from '../lib/recoveryState';
import MegyMascot from './MegyMascot';
import { isNativeShell } from '../lib/nativeShell';
import { showSamplePhotos, sampleAlbumMadeAt, sampleAlbumIsFromAnEarlierDay, requestSampleAlbum } from '../lib/samplePhotos';

/* ══════════════════════════════════════════════════════════════════════════
   ResumePrompt — "Pick up where you left off?"

   Owner (2026-09-29): every time the customer logs back in, the app asks if
   they want to resume where they left off. "Logs back in" = the first page of
   a signed-in visit (a remembered session opening the app) or a fresh
   sign-in. Asked ONCE per visit per account; signing out resets it.

   Owner (2026-10-11): it popped up over Home a second after Home showed,
   with Home's moving cards behind it: "It becomes confusing." Now it is the
   FIRST screen a customer with albums sees, on a plain background, and it
   lists their last 3 albums (the newest one chosen; "Yes, resume" opens the
   chosen one). "Start a new album" goes to the homepage, to pick a new album
   or an event. Home only shows after a choice. While the app checks for
   albums it holds a plain screen instead of flashing Home; albums this
   device remembers (lib/resumeCache) show at once. If the check takes too
   long, Home shows and nothing pops up later.

   Not asked where it would interrupt or mean nothing: checkout, the operator
   console, a link to one specific album, a builder already showing an album,
   or an event's pages (a guest's camera from a table QR, the venue screen,
   the host's event). Which albums it offers: lib/resumeOffer.
   ══════════════════════════════════════════════════════════════════════════ */

/** The longest Home is held back while the albums load. */
export const RESUME_HOLD_MS = 4000;

function notHere(pathname: string, search: string): boolean {
  if (pathname.startsWith('/admin') || pathname.startsWith('/order')) return true;
  // An event's own pages: the guest camera, the venue screen, copies, the
  // host's event and its table cards. (/events and /events/book are Megyprints
  // pages like any other.)
  if (pathname.startsWith('/e/')) return true;
  if (pathname.startsWith('/events/') && pathname !== '/events/book') return true;
  if (pathname.startsWith('/builder')) {
    if (new URLSearchParams(search).get('album')) return true; // opening one already
    if (readLocalDraftSummary()) return true; // the builder is showing their album
  }
  return false;
}

function firstNameOf(user: ReturnType<typeof useAuth>['user']): string {
  const meta = user?.user_metadata;
  const name = (meta?.full_name as string) || (meta?.name as string) || '';
  if (name) return name.split(' ')[0];
  return (user?.email || '').split('@')[0] || '';
}

function detailOf(o: ResumeOffer): string {
  if (o.kind === 'device') return `${o.photoCount} photo${o.photoCount === 1 ? '' : 's'} · on this device`;
  return o.updatedAt ? `Last saved ${formatRelativeTime(new Date(o.updatedAt))}` : 'Saved in your account';
}

/* The Android app while testing (owner, 2026-10-29: "for now please disable
   resume from where you left off or open existing album feature on the
   onset"): not asked at all, and no plain screen held while albums load. The
   app opens on Home, where Start Creating and "Make today's sample album"
   start a new album; signed in, the album in progress is saved to the
   account first (useBuilderState reset()), so it stays in Your Projects.
   The website, or TESTING_PHASE off: asked as always. "Make today's sample
   album" here (#208) waits for the day the prompt comes back to the app. */
export function ResumePrompt() {
  const [off] = useState(() => skipsResumePrompts(isNativeShell()));
  return off ? null : <ResumePromptScreen />;
}

function ResumePromptScreen() {
  const { user, loading } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<ResumeOffer[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // Before the session is even checked: hold Home back if someone is signed
  // in on this device (unless this device knows they have no albums).
  const [holding, setHolding] = useState(() =>
    supabaseConfigured && !wasResumeAskedThisVisit() && !notHere(pathname, search)
    && hasStoredSession() && !(rememberedNoAlbums() && !readLocalDraftSummary()));
  const where = useRef({ pathname, search });
  where.current = { pathname, search };

  // The wait for the session itself has the same limit: a sign-in check that
  // hangs (an outage, a Wi-Fi that swallows the request) must not leave a
  // blank screen. Home shows, and nothing pops up over it when it ends.
  const tooLate = useRef(false);
  useEffect(() => {
    if (!loading || !holding) return;
    const t = window.setTimeout(() => { tooLate.current = true; setHolding(false); }, RESUME_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [loading, holding]);

  // Signing out (or into another account) ends the visit: ask again next time.
  const lastUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const id = user?.id ?? null;
    if (lastUserRef.current && lastUserRef.current !== id) {
      clearResumeAsked();
      setOffers(null);
    }
    lastUserRef.current = id;
  }, [user?.id, loading]);

  // Once per visit per account: what to offer, and when. Keyed on the account,
  // not the user object (a quiet token refresh makes a new one).
  const accountId = user?.id ?? null;
  useEffect(() => {
    if (loading) return;
    if (!accountId) { setHolding(false); return; }
    const userId = accountId;
    if (tooLate.current) { markResumeAsked(userId); setHolding(false); return; }
    const { pathname: p, search: s } = where.current;
    if (wasResumeAsked(userId) || notHere(p, s)) { setHolding(false); return; }

    let cancelled = false;
    let shown = false;
    let gaveUp = false;
    const show = (list: ResumeOffer[]) => {
      shown = true;
      markResumeAsked(userId);
      setOffers(list);
      setChosen(list[0].id);
      setHolding(false);
    };
    const local = readLocalDraftSummary();
    const remembered = readResumeCache(userId);
    const fromMemory = chooseResumeOffers(local, remembered ?? [], userId);
    if (fromMemory.length) show(fromMemory); // at once, from this device
    else if (remembered && !local) setHolding(false); // known: nothing to offer
    else setHolding(true);

    const giveUp = window.setTimeout(() => {
      if (cancelled || shown) return;
      gaveUp = true;
      markResumeAsked(userId); // nothing pops up later this visit
      setHolding(false);
    }, RESUME_HOLD_MS);

    void listAccountAlbums(userId).then((saved) => {
      const summaries: SavedAlbumSummary[] = saved.filter((a) => a.id).map((a) => ({
        id: a.id as string, title: a.title, updatedAt: a.updatedAt, photoCount: a.photos?.length, coverPhoto: a.coverPhoto,
        // A sample album's day: the list has its photos' names and when it was
        // first saved, not its pages (and a sample album is new each day).
        sampleMadeAt: sampleAlbumMadeAt(a.photos?.map((p) => p.name).filter((n): n is string => typeof n === 'string'), a.createdAt ? Date.parse(a.createdAt) : null),
      }));
      writeResumeCache(userId, summaries);
      if (cancelled) return;
      const list = chooseResumeOffers(readLocalDraftSummary(), summaries, userId);
      if (shown) {
        // Already on screen from this device's memory: bring it up to date
        // (pictures, names, an album changed on another phone), keeping the
        // customer's choice when it is still there.
        setOffers((prev) => (prev ? list : prev));
        setChosen((c) => (list.some((o) => o.id === c) ? c : list[0]?.id ?? null));
        if (!list.length) setOffers(null);
        return;
      }
      if (gaveUp || wasResumeAsked(userId)) return;
      window.clearTimeout(giveUp);
      if (list.length) show(list);
      else { markResumeAsked(userId); setHolding(false); }
    }).catch(() => {
      // Couldn't reach the account: what this device remembers stays up; with
      // nothing remembered, Home shows.
      if (cancelled || shown) return;
      window.clearTimeout(giveUp);
      setHolding(false);
    });

    return () => { cancelled = true; window.clearTimeout(giveUp); };
  }, [accountId, loading]);

  // A reset link signs the customer in, which counts as "logging back in" — and
  // this full-screen layer (z-210) covered "Make a new password" (live,
  // 2026-10-23). The password comes first; this waits and shows after Done.
  const recovery = useRecoveryState();

  // Keyboard (KB-2): focus on "Yes, resume", Tab kept inside, Escape = not now.
  const showing = recovery === 'none' && !!offers && offers.length > 0 && !!user;
  const panelRef = useModalDialog<HTMLDivElement>(showing, () => setOffers(null));
  // Testing phase, in the app: yesterday's sample album isn't today's test.
  const [inApp] = useState(isNativeShell);

  if (!showing) {
    if (!holding || recovery !== 'none') return null;
    // Checking for albums: a plain screen, not Home flashing first.
    return (
      <div className="fixed inset-0 z-[210] flex items-center justify-center bg-cream" aria-busy="true" data-testid="resume-holding">
        <MegyMascot size={64} alt="" className="object-contain opacity-90" />
      </div>
    );
  }

  const choice = offers.find((o) => o.id === chosen) ?? offers[0];
  const close = () => { setOffers(null); setHolding(false); };
  const resume = () => {
    close();
    navigate(choice.kind === 'saved' ? `/builder?album=${choice.albumId}` : '/builder');
  };
  // Owner (2026-10-11): "Start a new album goes to homepage", where they pick
  // a new album (Start Creating) or an event (Book your event). They already
  // said new, so Home's Start Creating won't ask about the album in progress.
  const startNew = () => {
    close();
    navigate('/', { state: { choseNew: true } });
  };
  // A sample album made on an earlier day (lib/samplePhotos): the big button
  // makes today's, a new album, the way Step 1's "Make a sample album" does.
  const todaysSample = showSamplePhotos(inApp) && sampleAlbumIsFromAnEarlierDay(choice.sampleMadeAt, new Date());
  const makeTodaysSample = () => {
    close();
    startFreshAlbum(user!.id);
    requestSampleAlbum();
    navigate('/builder');
  };
  const firstName = firstNameOf(user);

  return (
    // A screen of its own (plain background, nothing of the page behind it).
    <div className="fixed inset-0 z-[210] overflow-y-auto overscroll-contain bg-cream" data-testid="resume-prompt">
      <div className="min-h-full flex items-center justify-center px-4 py-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="resume-title"
          tabIndex={-1}
          className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center"
        >
          <button onClick={close} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-light hover:text-medium hover:bg-line-soft transition-colors">
            <X size={16} />
          </button>
          <MegyMascot size={64} alt="" className="mx-auto object-contain mb-2" />
          <h2 id="resume-title" className="font-display text-xl font-semibold text-dark">
            {firstName ? `Welcome back, ${firstName}!` : 'Welcome back!'}
          </h2>
          <p className="text-sm text-medium mt-1 mb-4" id="resume-ask">Pick up where you left off?</p>

          <div role="radiogroup" aria-labelledby="resume-ask" className="space-y-2 mb-5 text-left" data-testid="resume-albums">
            {offers.map((o) => {
              const on = o.id === choice.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setChosen(o.id)}
                  data-testid="resume-album"
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-peach bg-blush ring-1 ring-peach' : 'border-line bg-paper hover:border-peach/50'}`}
                >
                  <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    on ? 'border-peach bg-peach text-white' : 'border-line bg-white'}`} aria-hidden="true">
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="w-10 h-10 shrink-0 rounded-lg bg-blush overflow-hidden flex items-center justify-center" aria-hidden="true">
                    {o.coverPhoto
                      ? <img src={o.coverPhoto} alt="" className="w-full h-full object-cover" />
                      : <BookOpen size={18} className="text-blush-pink" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-dark text-sm truncate" data-testid="resume-album-name">{o.title || 'Your album'}</span>
                    <span className="block text-xs text-taupe">{detailOf(o)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <button
              onClick={todaysSample ? makeTodaysSample : resume}
              data-testid="resume-yes"
              data-today-sample={todaysSample || undefined}
              data-autofocus
              className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all"
            >
              {todaysSample ? "Make today's sample album" : 'Yes, resume'}
            </button>
            <button
              onClick={startNew}
              data-testid="resume-new"
              className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> Start a new album
            </button>
          </div>
          <button onClick={close} data-testid="resume-not-now" className="mt-3 text-xs text-light hover:text-medium">Not now</button>
        </div>
      </div>
    </div>
  );
}

export default ResumePrompt;
