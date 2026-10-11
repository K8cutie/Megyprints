import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, BookOpen, Play, Star } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAuthModal } from '../components/AuthModalProvider';
import { eventPublic, eventMediaUrl, readPass, shortDate, type EventPublic } from '../lib/eventCamera';
import { eventTypeLabel } from '../lib/eventBookings';
import {
  downloadPickedOriginal, eventForCode, guestAlbumPool, linkEventGuest, myGuestAlbums, setGuestPick,
  type GuestAlbumEvent, type GuestAlbumItem,
} from '../lib/eventGuestAlbum';
import { setPendingEventImport } from '../lib/eventAlbum';
import { startFreshAlbum } from '../lib/albumSession';
import { getDisabledSizes } from '../lib/storeSettings';
import { createLimiter } from '../lib/limit';
import { MIN_ALBUM_PHOTOS } from './builder/albumMinimum';
import { ALBUM_SIZES, type AlbumSizePreset } from './builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   /e/:code/album — a guest makes their own album from the event's pool
   (0047). A parent on the school trip, the bride's mother: pick from what
   everyone shared, then make an album of your own at the normal price.
   Opened from the guest page. The first time, on the phone that joined,
   it links the guest pass to the signed-in account; after that the account
   finds the event from any device.
   ══════════════════════════════════════════════════════════════════════════ */

type Found =
  | { state: 'loading' }
  | { state: 'ready'; event: GuestAlbumEvent }
  | { state: 'none'; message: string };

export default function EventGuestAlbum() {
  const { code = '' } = useParams();
  const { user, loading } = useAuth();
  const { openLogin } = useAuthModal();
  const [pub, setPub] = useState<EventPublic | null | 'loading'>('loading');
  const [found, setFound] = useState<Found>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    void eventPublic(code).then((e) => { if (alive) setPub(e); }).catch(() => { if (alive) setPub(null); });
    return () => { alive = false; };
  }, [code]);

  // Find this account's place at the event: link the pass on this phone, or
  // an earlier link from another device.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      try {
        const pass = readPass(code);
        let linkErr = '';
        if (pass) {
          try { await linkEventGuest(code, pass.token); } catch (e) { linkErr = e instanceof Error ? e.message : ''; }
        }
        const event = eventForCode(await myGuestAlbums(), code);
        if (!alive) return;
        if (event) setFound({ state: 'ready', event });
        else setFound({ state: 'none', message: linkErr || 'Open this on the phone you joined the event with. Or join the event first with its QR code.' });
      } catch (e) {
        if (alive) setFound({ state: 'none', message: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
      }
    })();
    return () => { alive = false; };
  }, [user, code]);

  const title = pub && pub !== 'loading' ? (pub.title || `${eventTypeLabel(pub.event_type)} album`) : 'Your own album';
  const header = (
    <header className="mb-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9A4A2C]">Megyprints Events</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-dark">Make your own album</h1>
      <p className="text-sm text-medium" data-testid="guest-album-event">{title}</p>
    </header>
  );

  if (loading || pub === 'loading') return <Wrap><Spinner /></Wrap>;
  if (!pub || !pub.albums_on) {
    return (
      <Wrap>
        {header}
        <Note testid="guest-album-off">
          <p className="font-semibold text-dark">Making your own album isn’t open for this event.</p>
          <p className="mt-1 text-sm text-medium">The hosts choose this on their event page.</p>
          <Link to={`/e/${code}`} className="mt-3 inline-block underline text-sm font-semibold text-cocoa">Back to the event</Link>
        </Note>
      </Wrap>
    );
  }
  if (!user) {
    return (
      <Wrap>
        {header}
        <Note testid="guest-album-signin">
          <p className="font-semibold text-dark">Sign in to make your own album</p>
          <p className="mt-1 text-sm text-medium">You pick from everyone’s photos and videos, then order your album like any order. Your account keeps your picks.</p>
          <button type="button" onClick={() => openLogin()} data-testid="guest-album-signin-button"
            className="mt-4 w-full py-3 rounded-xl bg-blush-pink text-white font-semibold hover:brightness-105">
            Sign in
          </button>
        </Note>
      </Wrap>
    );
  }
  if (found.state === 'loading') return <Wrap>{header}<Spinner /></Wrap>;
  if (found.state === 'none') {
    return (
      <Wrap>
        {header}
        <Note testid="guest-album-none">
          <p className="font-semibold text-dark">{found.message}</p>
          <Link to={`/e/${code}`} className="mt-3 inline-block underline text-sm font-semibold text-cocoa">Go to the event</Link>
        </Note>
      </Wrap>
    );
  }
  return <Wrap>{header}<Picker event={found.event} userId={user.id} /></Wrap>;
}

function Picker({ event, userId }: { event: GuestAlbumEvent; userId: string }) {
  const navigate = useNavigate();
  const [pool, setPool] = useState<GuestAlbumItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'picked' | 'mine'>('all');
  const [open, setOpen] = useState<GuestAlbumItem | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [tried, setTried] = useState(false);
  const disabled = getDisabledSizes();
  const sizes = ALBUM_SIZES.filter((s) => !disabled.includes(s.preset));
  const [size, setSize] = useState<AlbumSizePreset>(
    sizes.find((s) => s.preset === event.album_size)?.preset ?? sizes.find((s) => s.preset === '8x8')?.preset ?? sizes[0]?.preset ?? '8x8',
  );

  const load = useCallback(async () => {
    try { setPool(await guestAlbumPool(event.guest_id)); } catch (e) { setErr(e instanceof Error ? e.message : 'We couldn’t load the photos.'); }
  }, [event.guest_id]);
  useEffect(() => { void load(); }, [load]);

  if (!pool) return err ? <p className="text-sm text-red-600">{err}</p> : <Spinner />;

  const toggle = async (p: GuestAlbumItem) => {
    const next = !p.picked;
    setPool((all) => all && all.map((x) => (x.id === p.id ? { ...x, picked: next } : x)));
    const ok = await setGuestPick(event.guest_id, p.id, next).catch(() => false);
    if (!ok) {
      setErr('That one couldn’t be picked. It may have been removed. Showing the latest photos.');
      await load();
    }
  };

  const picked = pool.filter((p) => p.picked);
  const photos = picked.filter((p) => p.kind === 'photo');
  const videos = picked.filter((p) => p.kind === 'video');
  const short = MIN_ALBUM_PHOTOS - photos.length;
  const shown = pool.filter((p) => (filter === 'picked' ? p.picked : filter === 'mine' ? p.mine : true));

  const make = async () => {
    setTried(true);
    setErr('');
    if (short > 0) return;
    try {
      const limit = createLimiter(4);
      let got = 0;
      setBusy(`Getting your photos ready (0 of ${photos.length})…`);
      const files = await Promise.all(photos.map((p) => limit(async () => {
        const blob = await downloadPickedOriginal(p.booking_id, p.id);
        setBusy(`Getting your photos ready (${++got} of ${photos.length})…`);
        const who = (p.guest_name ?? 'guest').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 24);
        return new File([blob], `${who}-${p.id}.jpg`, { type: 'image/jpeg', lastModified: new Date(p.ready_at).getTime() });
      })));
      setPendingEventImport({
        bookingId: event.booking_id,
        bookingNumber: '',
        title: event.title || `${eventTypeLabel(event.event_type)} album`,
        occasion: eventTypeLabel(event.event_type),
        size,
        cover: 'soft',
        pages: MIN_ALBUM_PHOTOS,
        files,
        videos: videos.map((v) => ({ id: v.id, url: eventMediaUrl(v.booking_id, v.id, 'video', v.ext), ext: v.ext, by: v.guest_name, durationS: v.duration_s })),
        guestAlbum: true,
      });
      startFreshAlbum(userId);
      navigate('/builder');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t get your photos. Try again.');
      setBusy('');
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-5 shadow-sm" data-testid="guest-album-intro">
        <p className="text-sm text-dark">Pick the photos and videos you want. Your picks are only yours: the hosts and other guests don’t see them.</p>
        <p className="mt-1 text-xs text-medium">You order your album like any album, at the normal price. Photos are kept until {shortDate(event.kept_until)}.</p>
      </div>

      <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex gap-1 mb-3">
          {(['all', 'picked', 'mine'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`guest-album-filter-${f}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === f ? 'bg-blush-pink text-white' : 'bg-paper text-medium'}`}>
              {f === 'all' ? `All (${pool.length})` : f === 'picked' ? `Picked (${picked.length})` : 'Shared by me'}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-medium py-6 text-center">{pool.length ? 'Nothing here.' : 'Nothing shared yet. Photos show here as guests share them.'}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {shown.map((p) => (
              <div key={p.id} className={`relative rounded-lg overflow-hidden bg-paper ${p.picked ? 'ring-2 ring-[#D4A017]' : ''}`} data-testid="guest-album-item">
                <button type="button" onClick={() => setOpen(p)} className="block w-full aspect-square" aria-label={`See ${p.kind === 'video' ? 'the video' : 'the photo'} by ${p.guest_name ?? 'a guest'}`}>
                  <img src={eventMediaUrl(p.booking_id, p.id, 'thumb')} alt={`By ${p.guest_name ?? 'a guest'}`} loading="lazy" className="w-full h-full object-cover" />
                </button>
                {p.kind === 'video' && <span className="absolute left-1 top-1 rounded-full bg-black/60 p-1"><Play size={11} className="text-white" fill="white" /></span>}
                {p.picked && <span className="absolute right-1 top-1 rounded-full bg-[#D4A017] p-1"><Star size={11} className="text-white" fill="white" /></span>}
                <p className="px-1.5 pt-1 text-[10px] text-medium truncate">{p.mine ? 'You' : (p.guest_name ?? 'A guest')}</p>
                <div className="p-1">
                  <button type="button" onClick={() => void toggle(p)} aria-pressed={p.picked} data-testid="guest-album-pick"
                    className={`w-full rounded-md py-1 text-[11px] font-semibold ${p.picked ? 'bg-[#D4A017] text-white' : 'bg-white border border-line text-dark'}`}>
                    {p.picked ? 'Picked' : 'Pick'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 bg-white rounded-2xl p-5 shadow-sm" data-testid="guest-album-make">
        <p className="text-sm text-dark" data-testid="guest-album-count">
          {photos.length} photo{photos.length === 1 ? '' : 's'} picked{videos.length ? ` and ${videos.length} video${videos.length === 1 ? '' : 's'} (they become video memories)` : ''}.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-medium">Album size
          <select value={size} onChange={(e) => setSize(e.target.value as AlbumSizePreset)} data-testid="guest-album-size"
            className="h-9 px-2 rounded-lg border border-line text-sm bg-white">
            {sizes.map((s) => <option key={s.preset} value={s.preset}>{s.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void make()} disabled={!!busy} data-testid="guest-album-make-button"
          className="mt-3 w-full py-3 rounded-xl bg-blush-pink text-white font-semibold hover:brightness-105 disabled:opacity-60 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> {busy}</> : <><BookOpen size={16} /> Make my album with {photos.length} photos</>}
        </button>
        {tried && short > 0 && (
          <p className="mt-2 text-xs text-[#8A5A12]" role="alert" data-testid="guest-album-short">
            An album needs at least {MIN_ALBUM_PHOTOS} photos. Pick {short} more (tap “Pick” on a photo).
          </p>
        )}
        {err && <p className="mt-2 text-xs text-red-600" role="alert">{err}</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'video'
              ? <video src={eventMediaUrl(open.booking_id, open.id, 'video', open.ext)} controls autoPlay playsInline className="w-full max-h-[75vh] rounded-lg bg-black" />
              : <img src={eventMediaUrl(open.booking_id, open.id, 'view')} alt="" className="w-full max-h-[75vh] object-contain rounded-lg" />}
            <p className="mt-2 text-center text-sm text-white">{open.mine ? 'You' : (open.guest_name ?? 'A guest')}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={() => { void toggle(open); setOpen({ ...open, picked: !open.picked }); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${open.picked ? 'bg-[#D4A017] text-white' : 'bg-white text-dark'}`}>
                {open.picked ? 'Picked' : 'Pick'}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="px-4 py-2 rounded-lg bg-white text-dark text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-cream"><div className="max-w-lg mx-auto px-4 pt-8 pb-16">{children}</div></div>;
}

function Spinner() {
  return <div className="py-16 flex justify-center text-light"><Loader2 className="animate-spin" /></div>;
}

function Note({ children, testid }: { children: React.ReactNode; testid: string }) {
  return <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid={testid}>{children}</div>;
}
