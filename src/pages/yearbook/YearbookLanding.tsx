/* ── MEGYearbooks landing page (/#/yearbooks) ────────────────────────────────
   For school yearbook advisers and principals. The yearbook page in the hero
   and the "same head size" row are drawn live by the yearbook's own layout
   engine and painter, with the sample class photos — so what a school sees
   here is exactly what the app makes. Works on a phone; the maker itself is
   for a computer. "Request a school account" goes to the same inbox as the
   Megyprints contact form (contact_messages). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ClipboardList, FolderOpen, Loader2, Play, Printer, QrCode, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { canvasMeasure, loadPageFonts, paintPage } from '@/yearbook/painter';
import { approxMeasure, layoutSection, type Measure, type YbPage } from '@/yearbook/layout';
import { fitPortrait, mainFace, minEyeGap, sectionEyeGap } from '@/yearbook/portraitFit';
import { TRIM } from '@/yearbook/geometry';
import { fetchSampleManifest, sampleThumbUrl, samplePortraitUrl, type SampleManifest, type SamplePerson } from '@/yearbook/sample';
import type { PhotoMeta, Section } from '@/yearbook/types';

const TRY_URL = '/yearbooks/app?sample=1';

function useManifest() {
  const [m, setM] = useState<SampleManifest | null>(null);
  useEffect(() => { let alive = true; fetchSampleManifest().then((x) => alive && setM(x)).catch(() => undefined); return () => { alive = false; }; }, []);
  return m;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Thumbnail-sized PhotoMeta: faces are stored as fractions, so they fit any size. */
function thumbMeta(p: SamplePerson): PhotoMeta {
  const w = 240, h = 300;
  return { id: p.file, fileName: p.file, width: w, height: h, order: 0, faces: p.faces.map((f) => ({ ...f, source: 'ai' as const })), flags: [], scanned: true };
}

/** The hero: a real 9-per-page yearbook page from the sample class. */
function HeroPage({ m }: { m: SampleManifest }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [measure, setMeasure] = useState<Measure>(() => approxMeasure);
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({});
  const people = useMemo(() => [m.people.find((p) => p.role === 'class_adviser')!, ...m.people.filter((p) => p.role === 'student').slice(0, 8)], [m]);

  useEffect(() => { loadPageFonts().then(() => setMeasure(() => canvasMeasure())); }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(people.map((p) => loadImg(sampleThumbUrl(p.file)).then((i) => [p.file, i] as const)))
      .then((list) => alive && setImgs(Object.fromEntries(list)))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [people]);

  const page: YbPage | null = useMemo(() => {
    const photos = Object.fromEntries(people.map((p) => [p.file, thumbMeta(p)]));
    const section: Section = {
      id: 'hero', title: m.section, classMemoryCode: 'hero',
      people: people.map((p, i) => ({ id: p.file, first: p.first, last: p.last, ...(p.middle ? { middle: p.middle } : {}), ...(p.role === 'class_adviser' ? { title: m.adviserTitle } : {}), role: p.role, rosterOrder: i, memoryCode: `hero${i}` })),
      assignments: Object.fromEntries(people.map((p) => [p.file, [p.file]])), confidence: {}, checked: {}, layout: 'portraits', density: 9, looksPerPage: 3,
    };
    const here = typeof window !== 'undefined' ? `${window.location.origin}/#/yearbooks` : 'https://megyprints.vercel.app/#/yearbooks';
    return layoutSection(section, { photos, measure, qrData: () => here, firstPage: 27, schoolYear: m.batch }).pages[0] ?? null;
  }, [m, people, measure]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !page) return;
    const w = c.clientWidth || 320;
    paintPage(c, page, { ppi: (w / TRIM.w) * Math.min(2, window.devicePixelRatio || 1), bleed: false, photo: (id) => imgs[id] ?? null });
  }, [page, imgs]);

  return <canvas ref={ref} className="block w-full rounded-[2px] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.08),0_18px_40px_rgba(60,40,20,0.18)]" style={{ aspectRatio: `${TRIM.w} / ${TRIM.h}` }} aria-label={`A sample yearbook page: ${m.section}, nine portraits with a QR code each`} />;
}

/** "As the photographer delivered it" next to "in the yearbook". */
function SameHead({ m }: { m: SampleManifest }) {
  // Five photos spread from the loosest crop to the tightest, so the change shows.
  const picks = useMemo(() => {
    const ranked = m.people
      .filter((p) => p.role === 'student' && p.faces.length)
      .map((p) => ({ p, gap: minEyeGap(240, 300, mainFace(p.faces.map((f) => ({ ...f, source: 'ai' as const })))) ?? 0 }))
      .sort((a, b) => a.gap - b.gap);
    const n = ranked.length;
    return n < 5 ? ranked.map((r) => r.p) : [0, 0.25, 0.5, 0.75, 1].map((q) => ranked[Math.round(q * (n - 1))].p);
  }, [m]);
  const eyeGap = useMemo(() => sectionEyeGap(picks.map(thumbMeta)), [picks]);
  return (
    <div className="grid gap-5">
      {(['raw', 'fit'] as const).map((row) => (
        <div key={row} className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row === 'raw' ? 'As the photographer delivered them' : 'In the yearbook'}</p>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {picks.map((p) => (row === 'raw' ? <img key={p.file} src={sampleThumbUrl(p.file)} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-sm object-cover" /> : <FittedThumb key={p.file} p={p} eyeGap={eyeGap} />))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FittedThumb({ p, eyeGap }: { p: SamplePerson; eyeGap: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    loadImg(sampleThumbUrl(p.file)).then((img) => {
      const c = ref.current;
      if (!alive || !c) return;
      c.width = 240; c.height = 300;
      const crop = fitPortrait(img.naturalWidth, img.naturalHeight, mainFace(p.faces.map((f) => ({ ...f, source: 'ai' as const }))), 0.8, eyeGap).crop;
      c.getContext('2d')!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, 240, 300);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [p, eyeGap]);
  return <canvas ref={ref} className="aspect-[4/5] w-full rounded-sm bg-muted" />;
}

const STEPS = [
  { icon: ClipboardList, title: 'Paste the class list', text: 'From Excel, Google Sheets or the SF1. Any column order.' },
  { icon: FolderOpen, title: 'Drop the photos', text: 'The photographer’s folder, exactly as delivered.' },
  { icon: UserCheck, title: 'Check every name', text: 'Each face next to its name, once, before anything prints.' },
  { icon: Printer, title: 'We print it', text: 'On our own presses. Videos keep arriving after printing.' },
];

const FAQ = [
  { q: 'Do students need an app or an account?', a: 'No. Anyone with a phone camera scans the code on the page. Students send their videos with a private code from their adviser, on any phone browser.' },
  { q: 'How long are the videos?', a: 'Up to 1 minute for each student and for the class adviser, and up to 3 minutes for the class video.' },
  { q: 'Who decides which videos go in?', a: 'The yearbook adviser. Nothing plays until the adviser approves it, and any video can be taken down later. The printed code stays the same.' },
  { q: 'What size is the yearbook?', a: '8.5 × 11 inches, hardbound or softcover. Up to 12 portraits per page, or three looks per graduate: toga, Filipiniana or barong, and a creative shot.' },
  { q: 'Can we start before every photo is in?', a: 'Yes. Students without a photo are listed as “Not pictured”, never as an empty box, and the pages update as photos arrive.' },
  { q: 'What does it cost?', a: 'The price per copy shows as you choose portrait sizes and pages. Request an account and we’ll walk your adviser through a first class.' },
];

const ROLES = ['Yearbook adviser', 'Principal', 'Teacher', 'Parent officer', 'Other'];

function RequestForm() {
  const [f, setF] = useState({ name: '', role: ROLES[0], school: '', contact: '', graduates: '', note: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const missing = { name: !f.name.trim(), school: !f.school.trim(), contact: f.contact.trim().length < 5 };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing.name || missing.school || missing.contact) return;
    setState('sending'); setError('');
    try {
      if (!supabaseConfigured) throw new Error('messaging is not configured');
      const message = [`School: ${f.school.trim()}`, `Role: ${f.role}`, `Contact: ${f.contact.trim()}`, f.graduates.trim() ? `Graduates this year: ${f.graduates.trim()}` : '', f.note.trim() ? `Note: ${f.note.trim()}` : ''].filter(Boolean).join('\n');
      const { error: insErr } = await supabase.from('contact_messages').insert({ name: f.name.trim().slice(0, 200), email: f.contact.trim().slice(0, 200), subject: 'MEGYearbooks school account', message: message.slice(0, 5000) });
      if (insErr) throw insErr;
      setState('sent');
    } catch (err) {
      reportError(err, { path: 'yearbook_account_request' });
      const code = (err as { code?: string } | null)?.code;
      setError(code === '53400' ? 'We’re getting a lot of requests right now. Please try again in a minute.' : 'We couldn’t send your request right now. Please try again in a few minutes.');
      setState('idle');
    }
  };

  if (state === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-6" role="status">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check /></span>
        <p className="font-display text-2xl font-semibold">Request received</p>
        <p className="text-muted-foreground">We’ll message {f.contact.trim()} to set up {f.school.trim()}’s account. In the meantime you can try the sample class on a computer.</p>
        <Button asChild variant="outline"><Link to={TRY_URL}>Try the sample class</Link></Button>
      </div>
    );
  }

  const field = 'h-11 w-full rounded-md border border-input bg-background px-3 text-base';
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-xl bg-card p-5 sm:grid-cols-2 sm:p-6">
      <label className="grid gap-1 text-sm font-medium" htmlFor="yb-req-name">Your name
        <input id="yb-req-name" className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        {tried && missing.name ? <span className="text-xs font-normal text-red-700">Type your name.</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-medium" htmlFor="yb-req-role">Your role
        <select id="yb-req-role" className={field} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
      </label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="yb-req-school">School
        <input id="yb-req-school" className={field} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} placeholder="St. Joseph Academy, Quezon City" autoComplete="organization" />
        {tried && missing.school ? <span className="text-xs font-normal text-red-700">Type the school’s name.</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-medium" htmlFor="yb-req-contact">Email or mobile number
        <input id="yb-req-contact" className={field} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="0917 123 4567" autoComplete="email" />
        {tried && missing.contact ? <span className="text-xs font-normal text-red-700">Type an email or mobile number we can reach you on.</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-medium" htmlFor="yb-req-grads">Graduates this year <span className="font-normal text-muted-foreground">(about)</span>
        <input id="yb-req-grads" inputMode="numeric" className={field} value={f.graduates} onChange={(e) => setF({ ...f, graduates: e.target.value.replace(/[^\d]/g, '').slice(0, 5) })} placeholder="120" />
      </label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="yb-req-note">Anything we should know <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea id="yb-req-note" rows={3} className="w-full rounded-md border border-input bg-background p-3 text-base" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Graduation is in March. Our photographer already has the pictorial schedule." />
      </label>
      {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={state === 'sending'}>{state === 'sending' ? <><Loader2 className="animate-spin" /> Sending</> : <>Request a school account <ArrowRight /></>}</Button>
      </div>
    </form>
  );
}

export default function YearbookLanding() {
  const m = useManifest();
  const star = m?.people.find((p) => p.role === 'student' && p.first === 'Andrea') ?? m?.people.find((p) => p.role === 'student');

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/yearbooks" className="font-display text-xl font-bold tracking-tight">MEGY<span className="text-primary">earbooks</span></Link>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex" aria-label="Sections">
            <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works</a>
            <a href="#video" onClick={(e) => { e.preventDefault(); document.getElementById('video')?.scrollIntoView({ behavior: 'smooth' }); }}>Video QR</a>
            <a href="#safety" onClick={(e) => { e.preventDefault(); document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' }); }}>Safety</a>
            <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>Questions</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to={TRY_URL}>Try the sample class</Link></Button>
            <Button size="sm" onClick={() => document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' })}>Request an account</Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">Yearbooks for Philippine schools</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] [text-wrap:balance] sm:text-5xl lg:text-6xl">Every graduate’s voice, printed in the yearbook.</h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">Paste the class list and drop the photographer’s folder. Megy lays out every page with the same head size for every student, and gives each one a QR code that plays their own video message.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' })}>Request a school account <ArrowRight /></Button>
              <Button asChild size="lg" variant="outline"><Link to={TRY_URL}>Try the sample class</Link></Button>
            </div>
            <p className="text-sm text-muted-foreground">8.5 × 11 · printed on our own presses · in your hands before graduation</p>
          </div>
          <div className="relative mx-auto w-full max-w-[520px] pb-6 pr-10 sm:pr-24">
            {m ? <HeroPage m={m} /> : <div className="aspect-[8.5/11] w-full rounded-[2px] bg-muted" />}
            {star ? (
              <div className="absolute -bottom-2 right-0 w-[38%] max-w-[190px] rounded-[26px] border-[6px] border-neutral-900 bg-neutral-900 shadow-2xl" aria-label={`A phone playing ${star.first}'s video message`}>
                <div className="overflow-hidden rounded-[20px] bg-neutral-900">
                  <div className="relative aspect-[9/14]">
                    <img src={samplePortraitUrl(star.file)} alt="" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-white/90 text-neutral-900"><Play className="ml-0.5 size-5 fill-current" /></span>
                  </div>
                  <div className="px-3 py-2 text-white">
                    <p className="text-sm font-semibold">{star.first} {star.last}</p>
                    <p className="text-[11px] text-white/70">Class of {m?.batch} · 0:48</p>
                  </div>
                </div>
              </div>
            ) : null}
            <span className="absolute left-[46%] top-[42%] hidden items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary shadow sm:flex"><QrCode className="size-3.5" /> scan</span>
          </div>
        </section>

        <section id="video" className="border-y bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
            <p className="font-display text-3xl leading-tight [text-wrap:balance] sm:text-4xl">“Scan this page at your 20th reunion.”</p>
            <div className="grid gap-3 text-muted-foreground">
              <p>Every student, the class adviser and the class itself get their own QR code on the page. Point a phone camera at it and their video plays: a message to the batch, a thank-you to their parents, where they’ll be in ten years.</p>
              <p>The code is printed once and never changes. Videos can arrive after the book is printed, even on graduation day.</p>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
                <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                <s.icon className="size-6 text-primary" aria-hidden="true" />
                <span className="text-lg font-semibold">{s.title}</span>
                <span className="text-sm text-muted-foreground">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Every head, the same size.</h2>
            <p className="text-muted-foreground">Photographers never crop 300 students the same way. Megy finds every face and both eyes, then moves and zooms each crop so the heads match and the eyes line up across the page. Faces are never stretched or edited.</p>
            <p className="text-sm text-muted-foreground">It all runs on the adviser’s computer. The photos aren’t sent anywhere to be read.</p>
          </div>
          {m ? <SameHead m={m} /> : null}
        </section>

        <section id="safety" className="bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div className="rounded-xl bg-background p-6">
              <h3 className="text-lg font-semibold">For the yearbook adviser</h3>
              <ul className="mt-3 grid gap-2 text-muted-foreground">
                {['A step guide with a “Show me” for every step', 'Price per copy as you choose sizes and pages', 'One portrait each or three looks per graduate', 'A check of every name before anything prints', 'Print-ready files at 300 dpi, one per class'].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>)}
              </ul>
            </div>
            <div className="rounded-xl bg-background p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-primary" /> Safe for students</h3>
              <ul className="mt-3 grid gap-2 text-muted-foreground">
                {['A private upload code for each student, handed out in person', 'Nothing plays until the adviser approves it', 'Any video can be taken down, anytime', 'Parent consent and the Data Privacy Act built in', 'No student accounts and no app to install'].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">Questions</h2>
          <div className="mt-6 divide-y rounded-xl border bg-card">
            {FAQ.map((x) => (
              <details key={x.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{x.q}</summary>
                <p className="mt-2 text-muted-foreground">{x.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="request" className="bg-secondary/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">Making a yearbook this school year?</h2>
              <p className="text-muted-foreground">We set up your school’s account and walk your yearbook adviser through the first class. Every school’s yearbook is private to that school.</p>
              <p className="text-sm text-muted-foreground">The yearbook maker runs on a laptop or desktop computer.</p>
            </div>
            <RequestForm />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>MEGYearbooks by <Link to="/" className="underline">Megyprints</Link></span>
          <span>Sample photos from Unsplash. The names and the school are made up.</span>
        </div>
      </footer>
    </div>
  );
}
