import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarHeart, Loader2, Check, ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import BankTransferPay from '../components/BankTransferPay';
import {
  BOOKING_STEPS, EVENT_MIN_GUESTS, bookingView, balanceOf, cancelMyBooking, eventTypeLabel, listMyBookings, peso,
  submitBookingPayment, uploadBookingProof, type EventBooking, type PaymentKind,
} from '../lib/eventBookings';
import { ALBUM_SIZES } from './builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   /events — Megyprints Events for 15 or more guests: what it is, how booking
   works, and the host's own bookings (where each one is, its deal, and the
   deposit or balance to pay). Booking itself is /events/book.
   ══════════════════════════════════════════════════════════════════════════ */

const fmtDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
};

const HOW_BOOKING_WORKS: { title: string; desc: string }[] = [
  { title: 'Send a request', desc: 'Tell us the date, the venue and about how many guests. Nothing to pay yet.' },
  { title: 'Get your deal', desc: 'We text or call you to talk it through, then your deal shows here: the price, what’s included, and your album.' },
  { title: 'Pay the deposit', desc: 'By bank transfer, with the QR here. Once we confirm it, your date is booked.' },
  { title: 'Pay the balance', desc: 'Any time before your album prints. Then we print it and ship it to your door.' },
];

export default function Events() {
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const [bookings, setBookings] = useState<EventBooking[] | null>(null);
  const [err, setErr] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [params] = useSearchParams();
  const focusId = params.get('booking');

  useEffect(() => {
    if (!user) { setBookings(null); return; }
    let alive = true;
    listMyBookings(user.id)
      .then((r) => { if (alive) setBookings(r); })
      .catch((e: Error) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [user, reloadTick]);

  return (
    <div className="bg-cream min-h-screen">
      <section className="max-w-3xl mx-auto px-4 pt-28 pb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9A4A2C]">Megyprints Events</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-dark leading-tight">Shared Memories, Different Perspectives</h1>
        <p className="mt-4 text-lg text-dark font-semibold">Every photo from every phone, finally in one album.</p>
        <p className="mt-2 text-medium leading-relaxed">
          Your guests scan the QR on their table and share what they shoot. You pick your favorites,
          and we print your album and ship it to your door.
        </p>
        <p className="mt-2 text-sm text-medium" data-testid="events-who">
          For weddings, debuts and celebrations with {EVENT_MIN_GUESTS} or more guests. Book us and we’ll set it up with you.
        </p>
        <Link to="/events/book" data-testid="events-book"
          className="mt-6 inline-flex items-center justify-center gap-1.5 px-8 py-3.5 bg-blush-pink text-white font-semibold rounded-xl hover:brightness-105 shadow-sm">
          Book your event <ChevronRight size={18} />
        </Link>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-10">
        <h2 className="font-display text-xl font-semibold text-dark mb-3">How booking works</h2>
        <ol className="grid sm:grid-cols-2 gap-3" data-testid="events-how">
          {HOW_BOOKING_WORKS.map((s, i) => (
            <li key={s.title} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
              <span className="shrink-0 w-8 h-8 rounded-full bg-blush text-[#9A4A2C] font-bold flex items-center justify-center">{i + 1}</span>
              <span>
                <span className="block font-semibold text-dark">{s.title}</span>
                <span className="block text-sm text-medium mt-0.5">{s.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-2 mb-3">
          <CalendarHeart className="text-blush-pink" size={20} />
          <h2 className="font-display text-xl font-semibold text-dark">Your bookings</h2>
        </div>
        {!user && (
          <p className="text-sm text-medium" data-testid="events-signed-out">
            Already sent a request?{' '}
            <button type="button" onClick={openLogin} className="underline font-semibold text-cocoa">Sign in to see it</button>.
          </p>
        )}
        {err && <p className="text-sm text-red-500 mb-4">We couldn’t load your bookings: {err}</p>}
        {user && bookings === null && !err && (
          <div className="flex items-center gap-2 text-sm text-light py-6"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        )}
        {bookings && bookings.length === 0 && (
          <p className="text-sm text-medium" data-testid="events-none">No bookings yet. When you send a request, it shows here.</p>
        )}
        <div className="space-y-4">
          {bookings?.map((b) => (
            <BookingCard key={b.id} booking={b} focused={b.id === focusId} onChanged={() => setReloadTick((n) => n + 1)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function BookingCard({ booking: b, focused, onChanged }: { booking: EventBooking; focused?: boolean; onChanged: () => void }) {
  const view = bookingView(b);
  const [paying, setPaying] = useState<PaymentKind | null>(null);
  const [notice, setNotice] = useState('');
  const [askCancel, setAskCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView?.({ block: 'start' }); }, [focused]);

  const balance = balanceOf(b);
  const size = ALBUM_SIZES.find((s) => s.preset === b.deal_album_size)?.name ?? b.deal_album_size;
  const canCancel = (b.status === 'requested' || b.status === 'quoted') && !b.deposit_submitted_at;

  const pay = async (kind: PaymentKind, receipt: File | null, reference: string) => {
    let proofPath: string | null = null;
    let uploadNote = '';
    if (receipt) {
      try { proofPath = await uploadBookingProof(b.id, kind, receipt); }
      catch (e) { uploadNote = `${e instanceof Error ? e.message : 'Your receipt didn’t upload.'} We still recorded that you sent it, and we’ll match it in our bank app.`; }
    }
    await submitBookingPayment(b.id, kind, { reference, proofPath });
    setPaying(null);
    setNotice(uploadNote);
    onChanged();
  };

  const cancel = async () => {
    setCancelling(true);
    setCancelErr('');
    try {
      const ok = await cancelMyBooking(b.id);
      if (!ok) setCancelErr('This booking can no longer be cancelled here. Message us and we’ll sort it out.');
      onChanged();
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : 'Could not cancel. Please try again.');
    } finally {
      setCancelling(false);
      setAskCancel(false);
    }
  };

  return (
    <div ref={ref} className={`bg-white rounded-2xl p-5 shadow-sm ${focused ? 'ring-2 ring-peach' : ''}`}
      data-testid="booking-card" data-status={b.status} data-focused={focused ? 'true' : undefined}>
      <p className="text-base font-display font-semibold text-dark">{eventTypeLabel(b.event_type)} · {fmtDate(b.event_date)}</p>
      <p className="text-sm text-dark">Booking <span className="font-mono text-[#C98A5E]">{b.booking_number}</span></p>
      <p className="text-xs text-medium mt-0.5">{b.guest_count} guests{b.venue ? ` · ${b.venue}` : ''}</p>

      <p className={`mt-3 text-sm font-semibold ${view.closed ? 'text-red-600' : 'text-dark'}`} data-testid="booking-headline">{view.headline}</p>
      {b.status === 'declined' && b.close_reason && <p className="mt-1 text-xs text-medium">{b.close_reason}</p>}
      {view.closed && (
        <p className="mt-1 text-xs text-medium">Questions? <Link to="/contact" className="underline font-semibold">Message us</Link>.</p>
      )}

      {!view.closed && (
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" data-testid="booking-steps">
          {BOOKING_STEPS.map((label, i) => (
            <li key={label} data-reached={i <= view.stage ? 'true' : 'false'}
              className={`flex items-center gap-1 ${i <= view.stage ? 'text-dark font-semibold' : 'text-light'}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center ${i <= view.stage ? 'bg-blush-pink text-white' : 'bg-paper'}`}>
                {i <= view.stage && <Check size={10} />}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}

      {b.deal_total != null && !view.closed && (
        <div className="mt-4 rounded-xl border border-line-soft p-4" data-testid="booking-deal">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-dark">Your deal</span>
            <span className="font-display text-xl font-bold text-blush-pink" data-testid="booking-total">{peso(b.deal_total)}</span>
          </div>
          <p className="mt-1 text-sm text-medium">
            Your printed album: {size} · {b.deal_cover === 'soft' ? 'Softcover' : 'Hardbound'} · {b.deal_pages} pages
          </p>
          {b.deal_includes && <p className="mt-1 text-sm text-medium whitespace-pre-line" data-testid="booking-includes">{b.deal_includes}</p>}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-medium">Deposit, to book your date</span>
              <span className="font-semibold text-dark text-right whitespace-nowrap" data-testid="booking-deposit">{peso(b.deal_deposit)}{b.deposit_paid_at ? ' · paid' : ''}</span>
            </div>
            {balance != null && balance > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-medium">Balance, before your album prints</span>
                <span className="font-semibold text-dark text-right whitespace-nowrap" data-testid="booking-balance">{peso(balance)}{b.balance_paid_at ? ' · paid' : ''}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {notice && <p className="mt-3 text-xs text-medium" role="status">{notice}</p>}

      {/* Booked: the event is open — its QR, the screen, the photos, the album.
          Outlined when a payment is the card's one filled button. */}
      {(b.status === 'booked' || b.status === 'paid' || b.status === 'completed') && (
        <Link to={`/events/${b.id}`} data-testid="booking-open-event"
          className={`mt-4 w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${view.action === 'pay-balance'
            ? 'border-2 border-peach text-cocoa hover:bg-blush' : 'bg-blush-pink text-white hover:brightness-105'}`}>
          Open your event: QR, photos and album <ChevronRight size={16} />
        </Link>
      )}

      {view.action === 'pay-deposit' && paying !== 'deposit' && (
        <button type="button" onClick={() => setPaying('deposit')} data-testid="booking-pay-deposit"
          className="mt-4 w-full py-3 bg-blush-pink text-white font-semibold rounded-xl hover:brightness-105">
          Pay the {peso(b.deal_deposit)} deposit
        </button>
      )}
      {view.action === 'pay-balance' && paying !== 'balance' && (
        <button type="button" onClick={() => setPaying('balance')} data-testid="booking-pay-balance"
          className="mt-4 w-full py-3 bg-blush-pink text-white font-semibold rounded-xl hover:brightness-105">
          Pay the {peso(balance)} balance
        </button>
      )}
      {paying === 'deposit' && b.deal_deposit != null && (
        <BankTransferPay amount={Number(b.deal_deposit)} note={b.booking_number} what="deposit"
          onSent={(file, reference) => pay('deposit', file, reference)} />
      )}
      {paying === 'balance' && balance != null && (
        <BankTransferPay amount={balance} note={b.booking_number} what="balance"
          onSent={(file, reference) => pay('balance', file, reference)} />
      )}

      {canCancel && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!askCancel ? (
            <button type="button" onClick={() => setAskCancel(true)} data-testid="booking-cancel"
              className="px-3 py-1.5 rounded-lg border border-peach bg-white text-xs font-semibold text-cocoa hover:bg-blush">
              Cancel this request
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void cancel()} disabled={cancelling} data-testid="booking-cancel-yes"
                className="px-3 py-1.5 rounded-lg bg-blush-pink text-white text-xs font-semibold hover:brightness-105 disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1.5">
                {cancelling && <Loader2 size={12} className="animate-spin" />} Yes, cancel booking {b.booking_number}
              </button>
              <button type="button" onClick={() => setAskCancel(false)} disabled={cancelling} data-testid="booking-cancel-keep"
                className="px-3 py-1.5 rounded-lg border border-peach bg-white text-xs font-semibold text-cocoa hover:bg-blush">
                Keep it
              </button>
            </>
          )}
        </div>
      )}
      {cancelErr && <p className="mt-2 text-xs text-red-600" role="alert">{cancelErr}</p>}
    </div>
  );
}
