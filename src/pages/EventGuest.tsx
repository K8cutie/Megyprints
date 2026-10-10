import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Camera, ImagePlus, Loader2, Check, X, Trash2, Play, RefreshCw, BookOpen } from 'lucide-react';
import {
  EVENT_PHOTOS_PER_GUEST, EVENT_VIDEOS_PER_GUEST, EVENT_VIDEO_MAX_SECONDS, deleteMyMedia, eventFeed, eventMediaUrl, eventPublic,
  forgetPass, guestMe, joinEvent, readPass, sharePhoto, shareVideo, shortDate,
  type EventPublic, type FeedItem, type GuestMe, type GuestPass, type ShareStage,
} from '../lib/eventCamera';
import { eventTypeLabel } from '../lib/eventBookings';
import { supabase } from '../lib/supabase';

/* ══════════════════════════════════════════════════════════════════════════
   /e/:code — the guest camera, opened from the QR on a table. No account, no
   app: a name (and the kids OK, if the hosts said kids are coming), then
   share up to 20 photos and 2 short videos, and see what everyone shared.
   No signal at the venue? Keep shooting with the camera and add them here
   from the gallery until the closing date.
   ══════════════════════════════════════════════════════════════════════════ */

type QueueItem = { key: string; name: string; kind: 'photo' | 'video'; stage: ShareStage | 'failed'; error?: string; file: File };

export default function EventGuest() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const tableFromQr = Number(params.get('t')) || null;
  const [ev, setEv] = useState<EventPublic | null | 'loading'>('loading');
  const [loadErr, setLoadErr] = useState('');
  const [pass, setPass] = useState<GuestPass | null>(() => readPass(code));
  const [me, setMe] = useState<GuestMe | null>(null);
  const [copyOffer, setCopyOffer] = useState(false);

  useEffect(() => {
    let alive = true;
    eventPublic(code)
      .then((e) => { if (alive) setEv(e); })
      .catch((e: Error) => { if (alive) { setLoadErr(e.message); setEv(null); } });
    void supabase.rpc('event_copy_offer', { p_code: code }).then(({ data }) => { if (alive) setCopyOffer(!!data); });
    return () => { alive = false; };
  }, [code]);

  const refreshMe = useCallback(async () => {
    if (!pass) return;
    try {
      const m = await guestMe(code, pass.token);
      if (!m) { forgetPass(code); setPass(null); setMe(null); return; }
      setMe(m);
    } catch { /* keep what's shown; the next refresh tries again */ }
  }, [code, pass]);
  useEffect(() => { void refreshMe(); }, [refreshMe]);

  if (ev === 'loading') {
    return <Shell><div className="py-24 flex justify-center text-light"><Loader2 className="animate-spin" /></div></Shell>;
  }
  if (!ev) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="guest-unknown">
          <h1 className="font-display text-2xl font-bold text-dark">We can’t find this event</h1>
          <p className="mt-2 text-sm text-medium">{loadErr || 'Check the QR on your table, or ask the hosts for the link.'}</p>
        </div>
      </Shell>
    );
  }

  const title = ev.title || `${eventTypeLabel(ev.event_type)} album`;
  const header = (
    <header className="text-center mb-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9A4A2C]">Megyprints Events</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-dark" data-testid="guest-title">{title}</h1>
      <p className="text-sm text-medium">{eventTypeLabel(ev.event_type)} · {shortDate(ev.event_date)}</p>
    </header>
  );

  if (!ev.open) {
    const early = new Date(`${ev.opens_on}T00:00:00`) > new Date();
    return (
      <Shell>
        {header}
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center" data-testid="guest-closed">
          <p className="text-base font-semibold text-dark">
            {early ? `Photos open on ${shortDate(ev.opens_on)}, the day before the event.` : `This event closed for photos on ${shortDate(ev.closes_on)}. Thank you for sharing!`}
          </p>
          {copyOffer && <CopyLink code={code} />}
        </div>
        <PlanYourOwn />
      </Shell>
    );
  }

  if (!pass) {
    return (
      <Shell>
        {header}
        <JoinCard ev={ev} code={code} tableFromQr={tableFromQr} onJoined={(p) => setPass(p)} />
        <PlanYourOwn />
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <Camera_ ev={ev} code={code} pass={pass} me={me} onChanged={refreshMe} />
      {copyOffer && <div className="mt-4 text-center"><CopyLink code={code} /></div>}
      <PlanYourOwn />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-cream">
      <div className="max-w-lg mx-auto px-4 pt-8 pb-16">{children}</div>
    </div>
  );
}

function PlanYourOwn() {
  return (
    <p className="mt-8 text-center text-xs text-medium" data-testid="guest-plan-own">
      Planning your own event? <Link to="/events" className="underline font-semibold text-cocoa">Megyprints Events</Link> collects every guest’s photos into one printed album.
    </p>
  );
}

function CopyLink({ code }: { code: string }) {
  return (
    <Link to={`/e/${code}/copy`} data-testid="guest-copy-link"
      className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-peach text-cocoa font-semibold hover:bg-blush">
      <BookOpen size={16} /> Order your own copy of the album
    </Link>
  );
}

function JoinCard({ ev, code, tableFromQr, onJoined }: { ev: EventPublic; code: string; tableFromQr: number | null; onJoined: (p: GuestPass) => void }) {
  const [name, setName] = useState('');
  const [table, setTable] = useState<string>(tableFromQr ? String(tableFromQr) : '');
  const [kidsOk, setKidsOk] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nameBad = tried && name.trim().length < 1;
  const kidsBad = tried && ev.kids_on && !kidsOk;

  const join = async () => {
    setTried(true);
    setErr('');
    if (name.trim().length < 1 || (ev.kids_on && !kidsOk)) return;
    setBusy(true);
    try {
      onJoined(await joinEvent(code, name, table ? Number(table) : null, kidsOk));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t add you. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4" data-testid="guest-join">
      <p className="text-sm text-dark">
        Your photos and videos go to the hosts. They pick their favorites for the printed album. No app to install.
      </p>
      <div>
        <label htmlFor="guest-name" className="block text-sm font-semibold text-dark mb-1.5">Your name</label>
        <input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name"
          placeholder="e.g. Tita Lorna" aria-invalid={nameBad} data-testid="guest-name"
          className={`w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:border-peach ${nameBad ? 'border-red-400' : 'border-line'}`} />
        {nameBad && <p className="mt-1.5 text-xs text-red-600">Add your name, so the hosts know whose photos these are.</p>}
      </div>
      {ev.tables ? (
        <div>
          <label htmlFor="guest-table" className="block text-sm font-semibold text-dark mb-1.5">Your table <span className="font-normal text-light">(optional)</span></label>
          <select id="guest-table" value={table} onChange={(e) => setTable(e.target.value)} data-testid="guest-table"
            className="w-full px-3 py-2.5 rounded-lg border border-line text-sm bg-white">
            <option value="">—</option>
            {Array.from({ length: ev.tables }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Table {n}</option>)}
          </select>
        </div>
      ) : null}
      {ev.kids_on && (
        <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${kidsBad ? 'border-red-400 bg-[#FFF5F5]' : 'border-line-soft'}`} data-testid="guest-kids">
          <input type="checkbox" checked={kidsOk} onChange={(e) => setKidsOk(e.target.checked)} className="mt-0.5" />
          <span>Kids are at this event. I’m okay with that, including photos of my own kids.</span>
        </label>
      )}
      <p className="text-xs text-medium">
        The hosts and the other guests can see what you share, and photos may play on the venue screen. The hosts will take down any photo you ask them to.
      </p>
      <button type="button" onClick={() => void join()} disabled={busy} data-testid="guest-join-btn"
        className="w-full py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 disabled:opacity-60 flex items-center justify-center gap-2">
        {busy ? <><Loader2 size={16} className="animate-spin" /> Joining…</> : 'Join and share photos'}
      </button>
      {err && <p className="text-sm text-red-600 text-center" role="alert" data-testid="guest-join-error">{err}</p>}
    </div>
  );
}

// "Camera" clashes with the icon's name.
function Camera_({ ev, code, pass, me, onChanged }: { ev: EventPublic; code: string; pass: GuestPass; me: GuestMe | null; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<'everyone' | 'mine'>('everyone');
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const [note, setNote] = useState('');
  const takeRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);

  const loadFeed = useCallback(async () => {
    try { setFeed(await eventFeed(code, pass.token, null, 100)); } catch { /* keep the last feed */ }
  }, [code, pass.token]);
  useEffect(() => {
    void loadFeed();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadFeed(); }, 30_000);
    return () => window.clearInterval(t);
  }, [loadFeed]);

  const photosLeft = Math.max(0, EVENT_PHOTOS_PER_GUEST - (me?.photos ?? 0) - queue.filter((q) => q.kind === 'photo' && q.stage !== 'done' && q.stage !== 'failed').length);
  const videosLeft = Math.max(0, EVENT_VIDEOS_PER_GUEST - (me?.videos ?? 0) - queue.filter((q) => q.kind === 'video' && q.stage !== 'done' && q.stage !== 'failed').length);

  const run = useCallback(async (items: QueueItem[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (const it of items) {
        const set = (patch: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.key === it.key ? { ...x, ...patch } : x)));
        try {
          if (it.kind === 'photo') await sharePhoto(code, pass.token, it.file, (s) => set({ stage: s }));
          else await shareVideo(code, pass.token, it.file, (s) => set({ stage: s }));
          set({ stage: 'done' });
        } catch (e) {
          set({ stage: 'failed', error: e instanceof Error ? e.message : 'It didn’t go through.' });
        }
      }
    } finally {
      runningRef.current = false;
      await onChanged();
      await loadFeed();
    }
  }, [code, pass.token, onChanged, loadFeed]);

  const add = (files: FileList | null) => {
    setNote('');
    if (!files?.length) return;
    let p = photosLeft;
    let v = videosLeft;
    const take: QueueItem[] = [];
    let skipped = 0;
    for (const f of Array.from(files)) {
      const kind = f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name) ? 'video' : 'photo';
      if (kind === 'photo' ? p <= 0 : v <= 0) { skipped++; continue; }
      if (kind === 'photo') p--; else v--;
      take.push({ key: `${Date.now()}-${Math.random()}`, name: f.name, kind, stage: 'preparing', file: f });
    }
    if (skipped) setNote(`${skipped} left out: you can share ${EVENT_PHOTOS_PER_GUEST} photos and ${EVENT_VIDEOS_PER_GUEST} videos. Delete one of yours to add another.`);
    if (!take.length) return;
    setQueue((q) => [...take, ...q]);
    void run(take);
  };

  const retry = (it: QueueItem) => {
    setQueue((q) => q.map((x) => (x.key === it.key ? { ...x, stage: 'preparing', error: undefined } : x)));
    void run([{ ...it, stage: 'preparing' }]);
  };

  const remove = async (item: FeedItem) => {
    setNote('');
    const gone = await deleteMyMedia(code, pass.token, item.id).catch(() => false);
    if (!gone) setNote('We couldn’t delete it. Check your connection and try again.');
    setOpen(null);
    await onChanged();
    await loadFeed();
  };

  const shown = (feed ?? []).filter((f) => (tab === 'mine' ? f.mine : true));

  return (
    <div className="space-y-4" data-testid="guest-camera">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-dark">Hi, <b>{pass.name}</b>{pass.table ? ` · Table ${pass.table}` : ''}</p>
        <p className="mt-1 text-sm text-medium" data-testid="guest-counter">
          {me ? `${me.photos} of ${EVENT_PHOTOS_PER_GUEST} photos · ${me.videos} of ${EVENT_VIDEOS_PER_GUEST} videos shared` : 'Loading…'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => takeRef.current?.click()} data-testid="guest-take"
            className="py-3 rounded-xl bg-blush-pink text-white font-semibold flex items-center justify-center gap-2 hover:brightness-105">
            <Camera size={18} /> Take a photo
          </button>
          <button type="button" onClick={() => pickRef.current?.click()} data-testid="guest-pick"
            className="py-3 rounded-xl border-2 border-peach text-cocoa font-semibold flex items-center justify-center gap-2 hover:bg-blush">
            <ImagePlus size={18} /> From your gallery
          </button>
        </div>
        <input ref={takeRef} type="file" accept="image/*" capture="environment" className="sr-only" data-testid="guest-take-input"
          onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <input ref={pickRef} type="file" accept="image/*,video/*" multiple className="sr-only" data-testid="guest-pick-input"
          onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <p className="mt-2 text-[11px] text-light">
          Videos up to {EVENT_VIDEO_MAX_SECONDS} seconds. No signal right now? Keep shooting with your camera and add them here until {shortDate(ev.closes_on)}.
        </p>
        {note && <p className="mt-2 text-xs text-cocoa" role="status">{note}</p>}
      </div>

      {queue.length > 0 && (
        <ul className="bg-white rounded-2xl p-3 shadow-sm space-y-1.5" data-testid="guest-queue">
          {queue.slice(0, 8).map((q) => (
            <li key={q.key} className="flex items-center gap-2 text-xs">
              {q.stage === 'done' ? <Check size={14} className="text-success shrink-0" />
                : q.stage === 'failed' ? <X size={14} className="text-red-600 shrink-0" />
                  : <Loader2 size={14} className="animate-spin text-light shrink-0" />}
              <span className="truncate flex-1 text-dark">{q.name}</span>
              <span className="text-medium shrink-0">
                {q.stage === 'preparing' ? 'Getting it ready…' : q.stage === 'uploading' ? 'Sharing…' : q.stage === 'done' ? 'Shared' : ''}
              </span>
              {q.stage === 'failed' && (
                <button type="button" onClick={() => retry(q)} className="shrink-0 inline-flex items-center gap-1 text-cocoa font-semibold underline">
                  <RefreshCw size={12} /> Try again
                </button>
              )}
            </li>
          ))}
          {queue.some((q) => q.stage === 'failed') && (
            <li className="text-[11px] text-red-600">{queue.find((q) => q.stage === 'failed')?.error}</li>
          )}
        </ul>
      )}

      <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm" role="tablist">
        {(['everyone', 'mine'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`guest-tab-${t}`}
            className={`flex-1 py-2 rounded-full text-sm font-semibold ${tab === t ? 'bg-blush-pink text-white' : 'text-medium'}`}>
            {t === 'everyone' ? 'Everyone' : 'Mine'}
          </button>
        ))}
      </div>

      {feed === null ? (
        <div className="py-10 flex justify-center text-light"><Loader2 className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-medium" data-testid="guest-feed-empty">
          {tab === 'mine' ? 'Nothing shared yet. Take a photo!' : 'No photos yet. Be the first to share one!'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5" data-testid="guest-feed">
          {shown.map((f) => (
            <button key={f.id} type="button" onClick={() => setOpen(f)} data-testid="guest-feed-item"
              className="relative aspect-square rounded-lg overflow-hidden bg-paper">
              <img src={eventMediaUrl(f.booking_id, f.id, 'thumb')} alt={`Shared by ${f.guest_name ?? 'a guest'}`} loading="lazy" className="w-full h-full object-cover" />
              {f.kind === 'video' && <span className="absolute right-1 top-1 rounded-full bg-black/60 p-1"><Play size={12} className="text-white" fill="white" /></span>}
              {f.mine && f.hidden && <span className="absolute left-1 bottom-1 rounded bg-black/60 px-1.5 text-[10px] text-white">Hidden by the hosts</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'video'
              ? <video src={eventMediaUrl(open.booking_id, open.id, 'video', open.ext)} controls autoPlay playsInline className="w-full max-h-[70vh] rounded-lg bg-black" />
              : <img src={eventMediaUrl(open.booking_id, open.id, 'view')} alt="" className="w-full max-h-[70vh] object-contain rounded-lg" />}
            <p className="mt-2 text-center text-sm text-white">{open.guest_name ?? 'A guest'}{open.table_no ? ` · Table ${open.table_no}` : ''}</p>
            <div className="mt-3 flex justify-center gap-2">
              {open.mine && (
                <button type="button" onClick={() => void remove(open)} data-testid="guest-delete"
                  className="px-4 py-2 rounded-lg bg-white text-[#C0392B] text-sm font-semibold inline-flex items-center gap-1.5">
                  <Trash2 size={14} /> Delete this
                </button>
              )}
              <button type="button" onClick={() => setOpen(null)} className="px-4 py-2 rounded-lg bg-white/90 text-dark text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
