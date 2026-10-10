import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Printer } from 'lucide-react';
import { myEvent, type MyEvent } from '../lib/eventHost';
import { guestLink } from '../lib/eventCamera';
import { generateQrPngDataUrl } from '../lib/qrMemory';

/* ══════════════════════════════════════════════════════════════════════════
   /events/:id/cards — the table cards, ready to print: one per table, each
   with its own QR (so a guest's photos say which table they're from), two to
   an A4 page. One card when the host hasn't said how many tables.
   ══════════════════════════════════════════════════════════════════════════ */

export default function EventCards() {
  const { id = '' } = useParams();
  const [ev, setEv] = useState<MyEvent | null | 'loading'>('loading');
  const [qrs, setQrs] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    myEvent(id).then((e) => { if (alive) setEv(e); }).catch(() => { if (alive) setEv(null); });
    return () => { alive = false; };
  }, [id]);

  const tables = ev && ev !== 'loading' ? Math.max(1, ev.tables ?? 1) : 0;
  const code = ev && ev !== 'loading' ? ev.guest_code : null;
  useEffect(() => {
    if (!code || !tables) return;
    let alive = true;
    const list = Array.from({ length: tables }, (_, i) => guestLink(code, ev && ev !== 'loading' && ev.tables ? i + 1 : null));
    void Promise.all(list.map((l) => generateQrPngDataUrl(l, 600))).then((r) => { if (alive) setQrs(r); });
    return () => { alive = false; };
  }, [code, tables, ev]);

  if (ev === 'loading') return <div className="py-24 flex justify-center text-light"><Loader2 className="animate-spin" /></div>;
  if (!ev || !ev.guest_code) {
    return <p className="p-8 text-center text-sm text-medium">This event isn’t open yet. <Link to="/events" className="underline">Back to your bookings</Link></p>;
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="print:hidden max-w-3xl mx-auto px-4 py-6 flex items-center justify-between gap-3">
        <Link to={`/events/${id}`} className="text-sm text-medium">‹ Your event</Link>
        <p className="text-sm text-medium">{ev.tables ? `${ev.tables} cards, one per table.` : 'One card. Set how many tables on your event page to number them.'}</p>
        <button type="button" onClick={() => window.print()} data-testid="cards-print"
          className="px-4 py-2 rounded-lg bg-blush-pink text-white font-semibold inline-flex items-center gap-1.5">
          <Printer size={16} /> Print
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-6 pb-10 print:gap-0 print:pb-0">
        {Array.from({ length: tables }, (_, i) => (
          <article key={i} data-testid="table-card"
            className="w-[5in] h-[7in] border border-[#B85C38] p-1 break-inside-avoid print:m-[0.25in]">
            <div className="h-full border border-line px-8 py-7 flex flex-col items-center text-center">
              {ev.tables ? <p className="text-sm font-bold tracking-[0.24em] uppercase text-[#B85C38]">Table {i + 1}</p> : <span />}
              <h1 className="mt-3 font-display italic text-5xl leading-none text-dark">{ev.title || 'Our celebration'}</h1>
              <h2 className="mt-5 font-display text-2xl text-dark">Help us remember today</h2>
              {qrs[i] ? <img src={qrs[i]} alt="" className="mt-4 w-48 h-48" /> : <div className="mt-4 w-48 h-48 bg-paper" />}
              <p className="mt-4 text-base font-bold text-dark leading-snug">Point your phone camera here.<br />No app to install.</p>
              <p className="mt-2 text-sm text-medium leading-snug max-w-[3.6in]">Share your photos and videos with us. We’ll pick our favorites for our printed album.</p>
              <p className="mt-1.5 text-xs text-medium">No signal right now? Keep shooting and scan this later.</p>
              <p className="mt-auto text-[10px] tracking-[0.14em] uppercase text-[#8B7E7A]">Megyprints Events</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
