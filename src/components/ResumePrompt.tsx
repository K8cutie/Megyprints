import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, BookOpen, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAlbumSync } from '../lib/useAlbumSync';
import { readLocalDraftSummary } from '../lib/localDraft';
import { chooseResumeOffer, type ResumeOffer } from '../lib/resumeOffer';
import { wasResumeAsked, markResumeAsked, clearResumeAsked, startFreshAlbum } from '../lib/albumSession';
import { formatRelativeTime } from './UserProjectsSection';
import { useModalDialog } from '../lib/useModalDialog';

/* ══════════════════════════════════════════════════════════════════════════
   ResumePrompt — "Pick up where you left off?"

   Owner (2026-09-29): every time the customer logs back in, the app asks if
   they want to resume where they left off. "Logs back in" = the first page of
   a signed-in visit (a remembered session opening the app) or a fresh
   sign-in. Asked ONCE per visit per account; signing out resets it.

   Not asked where it would interrupt or mean nothing: checkout, the operator
   console, a link to one specific album, or a builder already showing an
   album. Which album it offers: lib/resumeOffer.
   ══════════════════════════════════════════════════════════════════════════ */

function notHere(pathname: string, search: string): boolean {
  if (pathname.startsWith('/admin') || pathname.startsWith('/order')) return true;
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

export function ResumePrompt() {
  const { user, loading } = useAuth();
  const { loadAll } = useAlbumSync();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<ResumeOffer | null>(null);

  // Signing out (or into another account) ends the visit: ask again next time.
  const lastUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const id = user?.id ?? null;
    if (lastUserRef.current && lastUserRef.current !== id) {
      clearResumeAsked();
      setOffer(null);
    }
    lastUserRef.current = id;
  }, [user?.id, loading]);

  useEffect(() => {
    if (loading || !user || offer) return;
    const userId = user.id;
    if (wasResumeAsked(userId) || notHere(pathname, search)) return;
    let cancelled = false;
    // Let the page paint first — a prompt racing the page's own entrance
    // reads like a pop-up ad.
    const t = setTimeout(() => {
      void loadAll(userId).then((saved) => {
        if (cancelled || wasResumeAsked(userId) || notHere(pathname, search)) return;
        markResumeAsked(userId);
        const choice = chooseResumeOffer(
          readLocalDraftSummary(),
          saved.filter((a) => a.id).map((a) => ({
            id: a.id as string, title: a.title, updatedAt: a.updatedAt, photoCount: a.photos?.length,
          })),
          userId,
        );
        if (choice) setOffer(choice);
      });
    }, 900);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user, loading, pathname, search, offer, loadAll]);

  // Keyboard (KB-2): focus on "Yes, resume", Tab kept inside, Escape = not now.
  const panelRef = useModalDialog<HTMLDivElement>(!!offer && !!user, () => setOffer(null));

  if (!offer || !user) return null;

  const close = () => setOffer(null);
  const resume = () => {
    close();
    navigate(offer.kind === 'saved' ? `/builder?album=${offer.albumId}` : '/builder');
  };
  const startNew = () => {
    close();
    startFreshAlbum(user.id);
    navigate('/builder');
  };
  const firstName = firstNameOf(user);
  const detail = offer.kind === 'device'
    ? `${offer.photoCount} photo${offer.photoCount === 1 ? '' : 's'} · on this device`
    : offer.updatedAt ? `Last saved ${formatRelativeTime(new Date(offer.updatedAt))}` : 'Saved in your account';

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 px-4" onClick={close} data-testid="resume-prompt">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
      >
        <button onClick={close} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-light hover:text-medium hover:bg-line-soft transition-colors">
          <X size={16} />
        </button>
        <img src="/megy-character.png" alt="" className="w-16 h-16 mx-auto object-contain mb-2" draggable={false} />
        <h2 id="resume-title" className="font-display text-xl font-semibold text-dark">
          {firstName ? `Welcome back, ${firstName}!` : 'Welcome back!'}
        </h2>
        <p className="text-sm text-medium mt-1 mb-4">Pick up where you left off?</p>

        <div className="flex items-center gap-3 text-left rounded-xl border border-line bg-paper px-4 py-3 mb-5">
          <div className="w-10 h-10 shrink-0 rounded-full bg-blush flex items-center justify-center">
            <BookOpen size={18} className="text-blush-pink" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-dark text-sm truncate" data-testid="resume-album-name">{offer.title || 'Your album'}</p>
            <p className="text-xs text-taupe">{detail}</p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={resume}
            data-testid="resume-yes"
            data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Yes, resume
          </button>
          <button
            onClick={startNew}
            data-testid="resume-new"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={16} /> Start a new album
          </button>
        </div>
        <button onClick={close} className="mt-3 text-xs text-light hover:text-medium">Not now</button>
      </div>
    </div>
  );
}

export default ResumePrompt;
