import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Copy, Check, Printer, Monitor, Star, Play, BookOpen, Users, ExternalLink, Pause } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { eventTypeLabel, getMyBooking, peso, type EventBooking } from '../lib/eventBookings';
import { eventMediaUrl, guestLink, screenLink, shortDate } from '../lib/eventCamera';
import {
  downloadOriginal, myEvent, myEventGuests, myEventPool, removeGuest, saveMyEvent, setPoolItem, setScreenPaused,
  type EventGuest, type MyEvent, type PoolItem,
} from '../lib/eventHost';
import { setPendingEventImport } from '../lib/eventAlbum';
import { startFreshAlbum } from '../lib/albumSession';
import { generateQrPngDataUrl } from '../lib/qrMemory';
import { createLimiter } from '../lib/limit';
import { MIN_ALBUM_PHOTOS } from './builder/albumMinimum';
import { ALBUM_SIZES } from './builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   /events/:id — the host's event, once the deposit is confirmed (0044).
   The QR for the tables, the venue screen, what guests shared (hide, pick),
   who joined (remove), and "Make my album" from the picked photos (0045).
   ══════════════════════════════════════════════════════════════════════════ */

export default function EventManage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<EventBooking | null | 'loading'>('loading');
  const [ev, setEv] = useState<MyEvent | null>(null);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [guests, setGuests] = useState<EventGuest[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [b, e] = await Promise.all([getMyBooking(user.id, id), myEvent(id)]);
      setBooking(b);
      setEv(e);
      if (e) {
        const [p, g] = await Promise.all([myEventPool(id), myEventGuests(id)]);
        setPool(p);
        setGuests(g);
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'We couldn’t load your event.');
      setBooking((b) => (b === 'loading' ? null : b));
    }
  }, [user, id]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (booking === 'loading') return <Page><div className="py-24 flex justify-center text-light"><Loader2 className="animate-spin" /></div></Page>;
  if (!booking || !ev) {
    return (
      <Page>
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="manage-not-ready">
          <p className="font-semibold text-dark">{booking ? 'Your event opens once we confirm your deposit.' : 'We can’t find this event on your account.'}</p>
          {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
          <Link to="/events" className="mt-3 inline-block underline text-sm font-semibold text-cocoa">Back to your bookings</Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <Link to={`/events?booking=${booking.id}`} className="text-sm text-medium hover:text-dark">‹ Your bookings</Link>
      <h1 className="mt-2 font-display text-3xl font-bold text-dark" data-testid="manage-title">{ev.title || `${eventTypeLabel(booking.event_type)} album`}</h1>
      <p className="text-sm text-medium">
        {eventTypeLabel(booking.event_type)} · {shortDate(booking.event_date)} · Booking <span className="font-mono">{booking.booking_number}</span>
      </p>

      <div className="mt-5 grid gap-4">
        <ShareCard ev={ev} />
        <Counts ev={ev} />
        <AlbumCard booking={booking} ev={ev} pool={pool} navigate={navigate} userId={user?.id ?? null} />
        <SettingsCard ev={ev} onSaved={load} />
        <ScreenCard ev={ev} onChanged={load} />
        <PoolCard pool={pool} onChanged={load} />
        <GuestsCard guests={guests} onChanged={load} />
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="bg-cream min-h-screen"><div className="max-w-3xl mx-auto px-4 pt-24 pb-16">{children}</div></div>;
}

function Card({ title, icon, children, testid }: { title: string; icon?: React.ReactNode; children: React.ReactNode; testid?: string }) {
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm" data-testid={testid}>
      <h2 className="font-display text-lg font-semibold text-dark flex items-center gap-2 mb-3">{icon}{title}</h2>
      {children}
    </section>
  );
}

function CopyButton({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" data-testid={testid}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }); }}
      className="px-3 py-2 rounded-lg border border-peach text-cocoa text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-blush">
      {done ? <><Check size={14} /> Copied</> : <><Copy size={14} /> {label}</>}
    </button>
  );
}

function ShareCard({ ev }: { ev: MyEvent }) {
  const link = ev.guest_code ? guestLink(ev.guest_code) : '';
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { if (link) void generateQrPngDataUrl(link, 480).then(setQr).catch(() => setQr(null)); }, [link]);
  return (
    <Card title="Your guests’ QR" testid="manage-share">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        {qr && <img src={qr} alt="The QR your guests scan" className="w-40 h-40 rounded-lg border border-line-soft" data-testid="manage-qr" />}
        <div className="text-sm text-medium space-y-2">
          <p>
            {ev.open ? 'Guests are sharing now.' : `Guests can share from ${shortDate(ev.opens_on)} to ${shortDate(ev.closes_on)}.`}{' '}
            Everything is kept until {shortDate(ev.kept_until)}, so make your album before then.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/events/${ev.booking_id}/cards`} data-testid="manage-cards"
              className="px-3 py-2 rounded-lg border-2 border-peach text-cocoa text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-blush">
              <Printer size={14} /> Print table cards
            </Link>
            <CopyButton text={link} label="Copy the guest link" testid="manage-copy-link" />
            {ev.guest_code && (
              <Link to={`/e/${ev.guest_code}`} className="px-3 py-2 rounded-lg border border-line text-dark text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-paper">
                <ExternalLink size={14} /> Open the guest page
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Counts({ ev }: { ev: MyEvent }) {
  const cell = (n: number, label: string) => (
    <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
      <p className="font-display text-2xl font-bold text-dark">{n}</p>
      <p className="text-xs text-medium">{label}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-4 gap-2" data-testid="manage-counts">
      {cell(ev.guests, 'guests')}{cell(ev.photos, 'photos')}{cell(ev.videos, 'videos')}{cell(ev.picked, 'picked')}
    </div>
  );
}

function AlbumCard({ booking, ev, pool, navigate, userId }: { booking: EventBooking; ev: MyEvent; pool: PoolItem[]; navigate: ReturnType<typeof useNavigate>; userId: string | null }) {
  const picked = pool.filter((p) => p.picked && !p.hidden);
  const photos = picked.filter((p) => p.kind === 'photo');
  const videos = picked.filter((p) => p.kind === 'video');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const size = ALBUM_SIZES.find((s) => s.preset === booking.deal_album_size)?.name ?? booking.deal_album_size;
  const short = MIN_ALBUM_PHOTOS - photos.length;

  const make = async () => {
    setTried(true);
    setErr('');
    if (short > 0 || !booking.deal_album_size || !booking.deal_cover || !booking.deal_pages) return;
    try {
      // A few at a time, kept in the order they were shared.
      const limit = createLimiter(4);
      let got = 0;
      setBusy(`Getting your photos ready (0 of ${photos.length})…`);
      const files = await Promise.all(photos.map((p) => limit(async () => {
        const blob = await downloadOriginal(p.booking_id, p.id);
        setBusy(`Getting your photos ready (${++got} of ${photos.length})…`);
        const who = (p.guest_name ?? 'guest').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 24);
        return new File([blob], `${who}-${p.id}.jpg`, { type: 'image/jpeg', lastModified: new Date(p.ready_at).getTime() });
      })));
      setPendingEventImport({
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        title: ev.title || `${eventTypeLabel(booking.event_type)} album`,
        occasion: eventTypeLabel(booking.event_type),
        size: booking.deal_album_size,
        cover: booking.deal_cover,
        pages: booking.deal_pages,
        files,
        videos: videos.map((v) => ({ id: v.id, url: eventMediaUrl(v.booking_id, v.id, 'video', v.ext), ext: v.ext, by: v.guest_name, durationS: v.duration_s })),
      });
      startFreshAlbum(userId);
      navigate('/builder');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t get your photos. Try again.');
      setBusy('');
    }
  };

  return (
    <Card title="Your printed album" icon={<BookOpen size={18} className="text-blush-pink" />} testid="manage-album">
      <p className="text-sm text-medium">
        Your deal’s album: {size}, {booking.deal_cover === 'soft' ? 'softcover' : 'hardbound'}, up to {booking.deal_pages} pages.
        {booking.status === 'booked' && <> The {peso(Number(booking.deal_total) - Number(booking.deal_deposit))} balance is due before it prints.</>}
      </p>
      {booking.album_order_id ? (
        <p className="mt-2 text-sm font-semibold text-dark" data-testid="manage-album-ordered">
          Your album is ordered. <Link to="/orders" className="underline text-cocoa">See it in Your orders</Link>.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-dark" data-testid="manage-picked">
            {photos.length} photo{photos.length === 1 ? '' : 's'} picked{videos.length ? ` and ${videos.length} video${videos.length === 1 ? '' : 's'} (they become video memories)` : ''}.
          </p>
          <button type="button" onClick={() => void make()} disabled={!!busy} data-testid="manage-make-album"
            className="mt-3 w-full py-3 rounded-xl bg-blush-pink text-white font-semibold hover:brightness-105 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={16} className="animate-spin" /> {busy}</> : `Make my album with ${photos.length} photos`}
          </button>
          {tried && short > 0 && (
            <p className="mt-2 text-xs text-[#8A5A12]" role="alert" data-testid="manage-album-short">
              An album needs at least {MIN_ALBUM_PHOTOS} photos. Pick {short} more below (tap “Pick” on a photo).
            </p>
          )}
          {err && <p className="mt-2 text-xs text-red-600" role="alert">{err}</p>}
        </>
      )}
    </Card>
  );
}

function SettingsCard({ ev, onSaved }: { ev: MyEvent; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(ev.title ?? '');
  const [kids, setKids] = useState(ev.kids_on);
  const [tables, setTables] = useState(ev.tables ? String(ev.tables) : '');
  const [copies, setCopies] = useState(ev.copies_on);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await saveMyEvent(ev.booking_id, { title, kidsOn: kids, tables: tables ? Number(tables) : null, copiesOn: copies });
      await onSaved();
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Your event" testid="manage-settings">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-semibold text-dark mb-1">Name on the guest page and the screen</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Ana & Ben" data-testid="manage-title-input"
            className="w-full px-3 py-2 rounded-lg border border-line outline-none focus:border-peach" />
        </label>
        <label className="block">
          <span className="block font-semibold text-dark mb-1">How many tables? <span className="font-normal text-light">(for the table cards)</span></span>
          <input value={tables} onChange={(e) => setTables(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="e.g. 20" data-testid="manage-tables"
            className="w-32 px-3 py-2 rounded-lg border border-line outline-none focus:border-peach" />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} className="mt-1" data-testid="manage-kids" />
          <span><b className="text-dark">Kids will be there.</b> Guests are told before they join, and tick that they’re okay with it.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={copies} onChange={(e) => setCopies(e.target.checked)} className="mt-1" data-testid="manage-copies" />
          <span><b className="text-dark">Guests can order their own copy</b> of your album, at the normal price, once yours is ordered.</span>
        </label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={busy} data-testid="manage-save"
            className="px-4 py-2 rounded-lg border-2 border-peach text-cocoa font-semibold hover:bg-blush disabled:opacity-60">
            {busy ? 'Saving…' : 'Save'}
          </button>
          {msg && <span className="text-xs text-medium" role="status">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

function ScreenCard({ ev, onChanged }: { ev: MyEvent; onChanged: () => Promise<void> }) {
  const link = ev.guest_code && ev.screen_key ? screenLink(ev.guest_code, ev.screen_key) : '';
  const toggle = async () => { await setScreenPaused(ev.booking_id, !ev.screen_paused).catch(() => {}); await onChanged(); };
  return (
    <Card title="Venue screen" icon={<Monitor size={18} className="text-blush-pink" />} testid="manage-screen">
      <p className="text-sm text-medium">
        Open this link on the venue’s laptop or TV. Guests’ photos show with their names, 10 seconds after they share them, so you can hide one first. Keep this link to yourself.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={link} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border border-line text-dark text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-paper">
          <ExternalLink size={14} /> Open the screen
        </a>
        <CopyButton text={link} label="Copy the screen link" />
        <button type="button" onClick={() => void toggle()} data-testid="manage-screen-pause"
          className="px-3 py-2 rounded-lg border border-peach text-cocoa text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-blush">
          {ev.screen_paused ? <><Play size={14} /> Resume the screen</> : <><Pause size={14} /> Pause the screen</>}
        </button>
      </div>
    </Card>
  );
}

function PoolCard({ pool, onChanged }: { pool: PoolItem[]; onChanged: () => Promise<void> }) {
  const [filter, setFilter] = useState<'all' | 'picked' | 'hidden'>('all');
  const [open, setOpen] = useState<PoolItem | null>(null);
  const shown = pool.filter((p) => (filter === 'picked' ? p.picked : filter === 'hidden' ? p.hidden : true));
  const change = async (p: PoolItem, c: { hidden?: boolean; picked?: boolean }) => { await setPoolItem(p.id, c).catch(() => false); await onChanged(); };
  return (
    <Card title={`What your guests shared (${pool.length})`} testid="manage-pool">
      <div className="flex gap-1 mb-3">
        {(['all', 'picked', 'hidden'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === f ? 'bg-blush-pink text-white' : 'bg-paper text-medium'}`}>
            {f === 'all' ? 'All' : f === 'picked' ? 'Picked' : 'Hidden'}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-medium py-6 text-center">{pool.length ? 'Nothing here.' : 'Nothing shared yet. It shows here as guests share.'}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {shown.map((p) => (
            <div key={p.id} className={`relative rounded-lg overflow-hidden bg-paper ${p.picked ? 'ring-2 ring-[#D4A017]' : ''}`} data-testid="manage-pool-item">
              <button type="button" onClick={() => setOpen(p)} className="block w-full aspect-square">
                <img src={eventMediaUrl(p.booking_id, p.id, 'thumb')} alt={`By ${p.guest_name ?? 'a guest'}`} loading="lazy"
                  className={`w-full h-full object-cover ${p.hidden ? 'opacity-40' : ''}`} />
              </button>
              {p.kind === 'video' && <span className="absolute left-1 top-1 rounded-full bg-black/60 p-1"><Play size={11} className="text-white" fill="white" /></span>}
              {p.picked && <span className="absolute right-1 top-1 rounded-full bg-[#D4A017] p-1"><Star size={11} className="text-white" fill="white" /></span>}
              <p className="px-1.5 pt-1 text-[10px] text-medium truncate">{p.guest_name ?? 'A guest'}{p.hidden ? ' · hidden' : ''}</p>
              {/* In words, not bare icons: hosts aren't all app people. */}
              <div className="grid grid-cols-2 gap-1 p-1">
                <button type="button" onClick={() => void change(p, { picked: !p.picked })} aria-pressed={p.picked} data-testid="manage-pick"
                  className={`rounded-md py-1 text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${p.picked ? 'bg-[#D4A017] text-white' : 'bg-white border border-line text-dark'}`}>
                  {p.picked ? 'Picked' : 'Pick'}
                </button>
                <button type="button" onClick={() => void change(p, { hidden: !p.hidden })} aria-pressed={p.hidden} data-testid="manage-hide"
                  className="rounded-md py-1 text-[11px] font-semibold inline-flex items-center justify-center gap-1 bg-white border border-line text-dark">
                  {p.hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'video'
              ? <video src={eventMediaUrl(open.booking_id, open.id, 'video', open.ext)} controls autoPlay playsInline className="w-full max-h-[75vh] rounded-lg bg-black" />
              : <img src={eventMediaUrl(open.booking_id, open.id, 'view')} alt="" className="w-full max-h-[75vh] object-contain rounded-lg" />}
            <p className="mt-2 text-center text-sm text-white">{open.guest_name ?? 'A guest'}{open.table_no ? ` · Table ${open.table_no}` : ''}</p>
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => setOpen(null)} className="px-4 py-2 rounded-lg bg-white text-dark text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function GuestsCard({ guests, onChanged }: { guests: EventGuest[]; onChanged: () => Promise<void> }) {
  const [asking, setAsking] = useState<string | null>(null);
  const live = guests.filter((g) => !g.removed_at);
  return (
    <Card title={`Who joined (${live.length})`} icon={<Users size={18} className="text-blush-pink" />} testid="manage-guests">
      {guests.length === 0 ? <p className="text-sm text-medium">No one yet.</p> : (
        <ul className="divide-y divide-line-soft">
          {guests.map((g) => (
            <li key={g.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-testid="manage-guest">
              <span className={`flex-1 min-w-[12rem] ${g.removed_at ? 'text-light line-through' : 'text-dark'}`}>
                {g.name}{g.table_no ? ` · Table ${g.table_no}` : ''}{' '}
                <span className="text-medium">· {g.photos} photo{g.photos === 1 ? '' : 's'}, {g.videos} video{g.videos === 1 ? '' : 's'}</span>
              </span>
              {!g.removed_at && (asking === g.id ? (
                // Its own line under the name, so the name isn't squeezed on a phone.
                <div className="w-full flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => { void removeGuest(g.id).then(onChanged); setAsking(null); }} data-testid="manage-remove-yes"
                    className="px-2.5 py-1 rounded-lg bg-[#FDE7E7] text-[#C0392B] text-xs font-semibold">Yes, remove {g.name} and their photos</button>
                  <button type="button" onClick={() => setAsking(null)} className="px-2.5 py-1 rounded-lg border border-line text-xs">Keep</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAsking(g.id)} data-testid="manage-remove"
                  className="px-2.5 py-1 rounded-lg border border-line text-xs text-medium">Remove</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-light">Removing someone stops them sharing and deletes everything they shared.</p>
    </Card>
  );
}
