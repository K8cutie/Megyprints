import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import {
  EMPTY_REQUEST, EVENT_MIN_GUESTS, EVENT_TYPES, manilaToday, requestBooking, requestProblems, type BookingRequest,
} from '../lib/eventBookings';

/* ══════════════════════════════════════════════════════════════════════════
   /events/book — the booking request for an event with 15 or more guests.
   Nothing to pay here: the owner texts or calls, then sets the deal, which
   shows in /events. Sign-in is asked for when they send (the checkout
   pattern), and the answers stay on the page while they sign in.
   ══════════════════════════════════════════════════════════════════════════ */

export default function EventBook() {
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const navigate = useNavigate();
  const [r, setR] = useState<BookingRequest>(EMPTY_REQUEST);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [needSignIn, setNeedSignIn] = useState(false);
  const today = manilaToday();
  const problems = useMemo(() => requestProblems(r, today), [r, today]);
  const shown = tried ? problems : {};
  const underMin = !!shown.guests && /^\d+$/.test(r.guests.trim()) && Number(r.guests.trim()) < EVENT_MIN_GUESTS;

  useEffect(() => { if (user) setNeedSignIn(false); }, [user]);

  const set = <K extends keyof BookingRequest>(k: K, v: BookingRequest[K]) => { setR((prev) => ({ ...prev, [k]: v })); setErr(''); };

  const send = async () => {
    setTried(true);
    if (Object.keys(problems).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!user) { setNeedSignIn(true); openLogin(); return; }
    setSending(true);
    setErr('');
    try {
      const b = await requestBooking(user.id, r);
      navigate(`/events?booking=${b.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t send your request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:border-peach bg-white';
  const bad = (k: keyof BookingRequest) => (shown[k] ? 'border-red-400' : 'border-line');

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-xl mx-auto px-4 pt-28 pb-16">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9A4A2C]">Megyprints Events</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-dark">Book your event</h1>
        <p className="mt-2 text-sm text-medium">
          Tell us about your event. We’ll text or call you to talk it through, then your deal shows in{' '}
          <Link to="/events" className="underline font-semibold">Events</Link>. Nothing to pay yet.
        </p>

        <div className="mt-6 bg-white rounded-2xl p-5 shadow-sm space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-dark mb-2">What kind of event?</legend>
            <div className="flex flex-wrap gap-2" data-testid="book-types">
              {EVENT_TYPES.map((t) => {
                const on = r.eventType === t.id;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => set('eventType', t.id)}
                    className={`px-3.5 py-2 rounded-full border text-sm font-medium ${on ? 'border-blush-pink bg-blush text-dark' : 'border-line text-medium hover:bg-paper'}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            {shown.eventType && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-eventType">{shown.eventType}</p>}
          </fieldset>

          <div>
            <label htmlFor="book-date" className="block text-sm font-semibold text-dark mb-1.5">Date</label>
            <input id="book-date" type="date" min={today} value={r.eventDate} onChange={(e) => set('eventDate', e.target.value)}
              aria-invalid={!!shown.eventDate} className={`${field} ${bad('eventDate')}`} data-testid="book-date" />
            {shown.eventDate && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-eventDate">{shown.eventDate}</p>}
          </div>

          <div>
            <label htmlFor="book-venue" className="block text-sm font-semibold text-dark mb-1.5">Venue</label>
            <input id="book-venue" value={r.venue} onChange={(e) => set('venue', e.target.value)} maxLength={300}
              placeholder="e.g. Manila Cathedral, then Fernbrook Gardens" autoComplete="off"
              aria-invalid={!!shown.venue} className={`${field} ${bad('venue')}`} data-testid="book-venue" />
            {shown.venue && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-venue">{shown.venue}</p>}
          </div>

          <div>
            <label htmlFor="book-guests" className="block text-sm font-semibold text-dark mb-1.5">About how many guests?</label>
            <input id="book-guests" value={r.guests} onChange={(e) => set('guests', e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
              placeholder={`${EVENT_MIN_GUESTS} or more`} aria-invalid={!!shown.guests} className={`${field} ${bad('guests')}`} data-testid="book-guests" />
            {shown.guests && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-guests">{shown.guests}</p>}
            {underMin && (
              <Link to="/builder" className="mt-1.5 inline-block text-xs font-semibold text-cocoa underline" data-testid="book-make-album">Make an album instead</Link>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="book-name" className="block text-sm font-semibold text-dark mb-1.5">Your name</label>
              <input id="book-name" value={r.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoComplete="name"
                aria-invalid={!!shown.name} className={`${field} ${bad('name')}`} data-testid="book-name" />
              {shown.name && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-name">{shown.name}</p>}
            </div>
            <div>
              <label htmlFor="book-mobile" className="block text-sm font-semibold text-dark mb-1.5">Mobile number</label>
              <input id="book-mobile" type="tel" value={r.mobile} onChange={(e) => set('mobile', e.target.value)} maxLength={24} autoComplete="tel"
                placeholder="0917 123 4567" aria-invalid={!!shown.mobile} className={`${field} ${bad('mobile')}`} data-testid="book-mobile" />
              {shown.mobile && <p className="mt-1.5 text-xs text-red-600" data-testid="book-err-mobile">{shown.mobile}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="book-notes" className="block text-sm font-semibold text-dark mb-1.5">Anything we should know? <span className="font-normal text-light">(optional)</span></label>
            <textarea id="book-notes" value={r.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} rows={3}
              placeholder="e.g. Church at 2 PM, reception at 6 PM. 20 tables."
              aria-invalid={!!shown.notes} className={`${field} ${bad('notes')}`} data-testid="book-notes" />
            {shown.notes && <p className="mt-1.5 text-xs text-red-600">{shown.notes}</p>}
          </div>

          <button type="button" onClick={() => void send()} disabled={sending} data-testid="book-send"
            className="w-full py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
            {sending ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <><Send size={16} /> Send my booking request</>}
          </button>
          {needSignIn && !user && (
            <p className="text-xs text-medium text-center" data-testid="book-sign-in">Sign in to send your request. Your answers stay here.</p>
          )}
          {err && <p className="text-sm text-red-600 text-center" role="alert" data-testid="book-error">{err}</p>}
        </div>
      </div>
    </div>
  );
}
