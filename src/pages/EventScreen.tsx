import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { eventMediaUrl, guestLink } from '../lib/eventCamera';
import { generateQrPngDataUrl } from '../lib/qrMemory';

/* ══════════════════════════════════════════════════════════════════════════
   /e/:code/screen?k=… — the venue screen: a slideshow of what guests share,
   with each guest's name and table, and the QR to join. Open it on the
   venue's laptop (the host's event page has the link). It shows a photo only
   10 seconds after it's shared (0044), so the host can hide one first, and
   the host can pause it. Videos play muted.
   ══════════════════════════════════════════════════════════════════════════ */

interface ScreenItem { id: string; booking_id: string; kind: 'photo' | 'video'; ext: string; guest_name: string | null; table_no: number | null; ready_at: string }
interface ScreenState { title: string; paused: boolean; items: ScreenItem[] }

const SCREEN_POLL_MS = 10_000;
const SLIDE_MS = 7_000;

export default function EventScreen() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('k') ?? '';
  const [state, setState] = useState<ScreenState | null | 'loading'>('loading');
  const [index, setIndex] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => { void generateQrPngDataUrl(guestLink(code), 360).then(setQr).catch(() => setQr(null)); }, [code]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('event_screen', { p_code: code, p_key: key, p_limit: 60 });
      if (!alive) return;
      if (error) return; // keep showing what we have; try again next tick
      setState((data as ScreenState | null) ?? null);
    };
    void load();
    const t = window.setInterval(() => void load(), SCREEN_POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [code, key]);

  // Newest first, but each new photo gets its turn before the loop goes on.
  const items = useMemo(() => (state && state !== 'loading' ? state.items : []), [state]);
  const current = items.length ? items[index % items.length] : null;
  useEffect(() => {
    const fresh = items.findIndex((i) => !seen.current.has(i.id));
    if (fresh >= 0 && current && seen.current.has(current.id)) setIndex(fresh);
  }, [items, current]);
  useEffect(() => { if (current) seen.current.add(current.id); }, [current]);
  useEffect(() => {
    if (!items.length || (state !== 'loading' && state?.paused)) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % Math.max(1, items.length)), current?.kind === 'video' ? 16_000 : SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, items.length, current?.kind, state]);

  if (state === 'loading') {
    return <div className="fixed inset-0 bg-[#1E1A18] flex items-center justify-center text-white/60"><Loader2 className="animate-spin" /></div>;
  }
  if (!state) {
    return (
      <div className="fixed inset-0 bg-[#1E1A18] flex items-center justify-center text-center p-8" data-testid="screen-bad-link">
        <p className="text-white/80 text-xl">This screen link isn’t right. Ask the hosts for the venue screen link from their event page.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#1E1A18] text-white overflow-hidden" data-testid="event-screen">
      <p className="absolute top-6 left-8 font-display text-3xl font-semibold drop-shadow" data-testid="screen-title">{state.title || 'Our event'}</p>

      {state.paused || !current ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8" data-testid="screen-waiting">
          <p className="text-4xl font-display font-semibold">{state.paused ? 'Back in a moment' : 'Share your photos!'}</p>
          <p className="mt-3 text-xl text-white/80">Scan the QR on your table, or this one.</p>
          {qr && <img src={qr} alt="QR to join and share photos" className="mt-6 w-64 h-64 rounded-xl bg-white p-2" />}
        </div>
      ) : (
        <>
          <div className="absolute inset-0 flex items-center justify-center p-16">
            {current.kind === 'video'
              ? <video key={current.id} src={eventMediaUrl(current.booking_id, current.id, 'video', current.ext)} autoPlay muted playsInline
                  onEnded={() => setIndex((i) => (i + 1) % items.length)} className="max-w-full max-h-full rounded-lg shadow-2xl" data-testid="screen-video" />
              : <img key={current.id} src={eventMediaUrl(current.booking_id, current.id, 'view')} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" data-testid="screen-photo" />}
          </div>
          <p className="absolute bottom-8 left-8 text-2xl font-semibold drop-shadow" data-testid="screen-caption">
            {current.guest_name ?? 'A guest'}{current.table_no ? ` · Table ${current.table_no}` : ''}
          </p>
          <div className="absolute bottom-6 right-8 flex items-center gap-3 bg-black/40 rounded-2xl p-3">
            <div className="text-right">
              <p className="text-lg font-semibold">Scan the QR on your table</p>
              <p className="text-sm text-white/70">and share what you shoot</p>
            </div>
            {qr && <img src={qr} alt="" className="w-24 h-24 rounded-lg bg-white p-1" />}
          </div>
        </>
      )}
      <p className="absolute top-7 right-8 text-sm text-white/60">Made with Megyprints Events</p>
    </div>
  );
}
