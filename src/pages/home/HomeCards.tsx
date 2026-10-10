/* ══════════════════════════════════════════════════════════════════════════
   The two cards at the top of Home: Megyprints Albums and Megyprints Events,
   built the same way (the owner's canvas board "Home with Albums and Events",
   2026-10-09). Each card: its label and headline stay put, its middle plays
   the steps by itself (a slide every 4 s, dots to jump, Pause/Play), and its
   button stays put. Start Creating is the one filled button. The Albums
   slides move half a beat after the Events ones, so the two never slide at
   the same moment. On a phone a finger swipes them, and a finger on them
   holds the clock. For people who asked for less motion the slides still
   change every 4 s, but jump instead of sliding, and the scenes hold still
   (index.css).
   The words live in homeCopy.ts (homeCopy.spec.ts keeps them true).
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Video, CalendarHeart } from 'lucide-react';
import MegyMascot from '../../components/MegyMascot';
import { ALBUMS_CARD, EVENTS_CARD, type HomeStep } from '../homeCopy';

/** One slide's time on screen (the board's default). */
export const SLIDE_MS = 4000;
/** How far a finger drags before it counts as a swipe to the next slide. */
export const SWIPE_PX = 48;
/** A finger has to move this far sideways (and more sideways than up or
 *  down) before the slides follow it; until then the page scrolls as usual. */
const DRAG_START_PX = 8;

/* ── The carousel ─────────────────────────────────────────────────────── */

export function StepCarousel({ name, slides, startDelayMs = 0, testid }: {
  /** "Megyprints Albums", for the region and the buttons' labels. */
  name: string;
  /** The slides; each gets `go(k)` for an in-slide "Here's how ›". */
  slides: (go: (k: number) => void) => ReactNode[];
  /** The first advance waits this much longer (the half beat). */
  startDelayMs?: number;
  testid: string;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // A jump restarts the clock (no half beat after the first run).
  const [epoch, setEpoch] = useState(0);
  // A finger on the slides holds the clock; dx is how far it has dragged them.
  const [held, setHeld] = useState(false);
  const [dx, setDx] = useState(0);
  const finger = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  // A swipe that ends on a button must not also press it.
  const swiped = useRef(false);
  const region = useRef<HTMLDivElement>(null);
  const list = slides((k: number) => { setI(k); setEpoch((e) => e + 1); });
  const n = list.length;
  const go = useCallback((k: number) => { setI(k); setEpoch((e) => e + 1); }, []);

  useEffect(() => {
    if (paused || held || n < 2) return;
    let tick: number | undefined;
    const first = window.setTimeout(() => {
      setI((k) => (k + 1) % n);
      tick = window.setInterval(() => setI((k) => (k + 1) % n), SLIDE_MS);
    }, SLIDE_MS + (epoch === 0 ? startDelayMs : 0));
    return () => { window.clearTimeout(first); window.clearInterval(tick); };
  }, [paused, held, n, epoch, startDelayMs]);

  // Once the finger is swiping the slides, its moves are the swipe's, not the
  // page's: otherwise the phone flings the page sideways (nothing moves) and
  // the next tap only stops that fling, so a tap on Pause did nothing.
  // React listens to touchmove passively, so this has to be a native listener.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => { if (finger.current?.dragging && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  // Fingers and pens only: a mouse has the dots.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || n < 2 || finger.current) return;
    finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
    swiped.current = false;
    setHeld(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const f = finger.current;
    if (!f || e.pointerId !== f.id) return;
    const mx = e.clientX - f.x;
    if (!f.dragging) {
      if (Math.abs(mx) < DRAG_START_PX || Math.abs(mx) <= Math.abs(e.clientY - f.y)) return;
      f.dragging = true;
      // Keep the finger's moves coming here even if it slides off the card.
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* already gone */ }
    }
    // Past the first or last slide they give a little, then stop.
    const beyond = (i === 0 && mx > 0) || (i === n - 1 && mx < 0);
    setDx(beyond ? mx / 3 : mx);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const f = finger.current;
    if (!f || e.pointerId !== f.id) return;
    finger.current = null;
    setHeld(false);
    setDx(0);
    // A cancel is the page taking over (an up-and-down scroll): no swipe.
    if (!f.dragging || e.type === 'pointercancel') return;
    swiped.current = true;
    const mx = e.clientX - f.x;
    if (mx <= -SWIPE_PX && i < n - 1) go(i + 1);
    else if (mx >= SWIPE_PX && i > 0) go(i - 1);
  };

  return (
    <div data-testid={testid} data-slide={i}>
      {/* touch-pan-y: up-and-down stays the page's scroll; sideways is the swipe. */}
      <div ref={region} role="region" aria-roledescription="carousel" aria-label={`${name}, how it works`}
        className="overflow-hidden rounded-2xl touch-pan-y"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={(e) => { if (swiped.current) { swiped.current = false; e.preventDefault(); e.stopPropagation(); } }}>
        <div className="home-slide-track flex" data-dragging={dx !== 0 ? 'true' : undefined}
          style={dx !== 0
            ? { transform: `translateX(calc(-${i * 100}% + ${dx}px))`, transition: 'none' }
            : { transform: `translateX(-${i * 100}%)` }}>
          {list.map((slide, k) => (
            <div key={k} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`} aria-hidden={k !== i}
              className="w-full shrink-0">
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-center gap-0.5 min-h-[32px]">
        {list.map((_, k) => (
          // 28 px tall to tap; the dot itself stays small.
          <button key={k} type="button" onClick={() => go(k)} aria-label={`${name}, slide ${k + 1} of ${n}`}
            aria-current={k === i ? 'true' : 'false'} data-testid={`${testid}-dot`}
            className="flex px-[3px] py-[9px]">
            <span className={`block h-2.5 rounded-full transition-[width] duration-200 ${k === i ? 'w-[22px] bg-[#B85C38]' : 'w-2 bg-[#E6D3C8]'}`} />
          </button>
        ))}
        <button type="button" onClick={() => setPaused((p) => !p)} data-testid={`${testid}-pause`}
          aria-label={paused ? `Play the ${name} slides` : `Pause the ${name} slides`}
          className="ml-2 h-8 px-3 rounded-full border-[1.5px] border-[#E6E2DD] bg-white text-[12px] font-bold text-[#4A423F]">
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

/* ── Pieces of the scenes ─────────────────────────────────────────────── */

/** The board's crop: region (x0, y0, w, h) of an 896-wide photo, to cover a W×H box. */
export function crop(W: number, H: number, x0: number, y0: number, w: number, h: number) {
  const s = Math.max(W / w, H / h);
  return { width: 896 * s, left: -(x0 * s) - (w * s - W) / 2, top: -(y0 * s) - (h * s - H) / 2 };
}
type Crop = { width: number; left: number; top: number };

function Photo({ src, w, h, c, alt = '', className = '', style }: {
  src: string; w: number; h: number; c: Crop; alt?: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: w, height: h, ...style }}>
      <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false}
        className="absolute max-w-none" style={{ width: c.width, left: c.left, top: c.top }} />
    </div>
  );
}

/** A decorative QR pattern (finders + noise): it looks like a QR, it isn't one. */
function FakeQr({ seed, cell }: { seed: number; cell: number }) {
  const n = 21;
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const finders = [[0, 0], [0, n - 7], [n - 7, 0]];
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      let v = -1;
      for (const [fr, fc] of finders) {
        if (r >= fr - 1 && r <= fr + 7 && col >= fc - 1 && col <= fc + 7) {
          const rr = r - fr, cc = col - fc;
          if (rr < 0 || rr > 6 || cc < 0 || cc > 6) v = 0;
          else if (rr === 0 || rr === 6 || cc === 0 || cc === 6) v = 1;
          else v = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4 ? 1 : 0;
        }
      }
      if (v === -1) v = r === 6 || col === 6 ? ((r + col) % 2 === 0 ? 1 : 0) : (rnd() < 0.5 ? 1 : 0);
      if (v) d += `M${col} ${r}h1v1h-1z`;
    }
  }
  return (
    <svg width={n * cell} height={n * cell} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-hidden="true" className="block bg-white">
      <path d={d} fill="#2D2D2D" />
    </svg>
  );
}

function Sparkle({ x, y, size, fill, delay }: { x: number; y: number; size: number; fill: string; delay?: string }) {
  return (
    <svg className="home-twinkle absolute" style={{ left: x, top: y, animationDelay: delay }} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={fill} />
    </svg>
  );
}

function TruckChip({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <span className="absolute flex items-center gap-[5px] whitespace-nowrap rounded-full bg-white px-[9px] py-1 text-[10px] font-extrabold text-[#4A423F] shadow-[0_4px_10px_rgba(0,0,0,0.16)]" style={{ left: x, top: y }}>
      <svg className="home-drive" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B85C38" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h11v10H3z" /><path d="M14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" />
      </svg>
      {label}
    </span>
  );
}

/** A slide: 150 px, warm paper, a big soft circle behind the picture. */
function Scene({ gold = false, circle = 'left', children }: { gold?: boolean; circle?: 'left' | 'right'; children: ReactNode }) {
  return (
    <div className={`relative flex h-[150px] lg:h-[200px] items-center overflow-hidden ${gold ? 'bg-[#FBF4E6]' : 'bg-[#FBF1EB]'}`}>
      <div aria-hidden="true" className={`absolute rounded-full ${gold ? 'bg-[#F3E2BE]' : 'bg-[#F3DCCF]'} ${circle === 'left' ? '-left-9 -top-6 h-[196px] w-[196px]' : '-right-10 -top-[30px] h-[200px] w-[200px]'}`} />
      {children}
    </div>
  );
}

/** "STEP 1" + its title and line, beside the picture. */
function StepText({ n, step, gold = false }: { n: number; step: HomeStep; gold?: boolean }) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-[3px] pr-3.5 lg:gap-1 lg:pr-5">
      <span className="flex items-baseline gap-1.5">
        <span className={`text-[11px] lg:text-[13px] font-extrabold tracking-[0.12em] ${gold ? 'text-[#8A6420]' : 'text-[#9A4A2C]'}`}>STEP</span>
        <span className={`font-display text-[34px] lg:text-[44px] font-bold leading-none ${gold ? 'text-[#B8862B]' : 'text-[#B85C38]'}`}>{n}</span>
      </span>
      <span className="text-[16px] lg:text-[20px] font-extrabold leading-[1.25] text-[#2D2D2D]">{step.title}</span>
      <span className="text-[13px] lg:text-[15px] leading-[1.4] text-[#4A423F]">{step.desc}</span>
    </div>
  );
}

/** The hook slide: the card's line and "Here's how ›", a fan of photos. */
function HookSlide({ text, how, onHow, phones = false }: { text: string; how: string; onHow: () => void; phones?: boolean }) {
  const fam = '/album-family.jpg';
  // The board's crops of the family album, each with a little phone when it's Events.
  const fan: [number, number, number, Crop][] = phones
    ? [[4, 50, -15, { width: 401, left: -216.5, top: -270.8 }], [72, 48, 14, { width: 372.4, left: -267.7, top: -270.1 }], [38, 28, -2, { width: 362.9, left: -196.2, top: -153.9 }]]
    : [[6, 46, -14, { width: 349.6, left: -252, top: -172.5 }], [70, 46, 13, { width: 362.9, left: -196.2, top: -153.9 }], [38, 30, -2, { width: 229.4, left: -52.4, top: -115.2 }]];
  return (
    <Scene circle="right">
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5 pl-3.5 lg:gap-2 lg:pl-5">
        <p className="m-0 text-[13px] leading-[1.45] text-[#4A423F] sm:text-[14px] lg:text-[16px]">{text}</p>
        <button type="button" onClick={onHow} className="self-start text-[13px] lg:text-[15px] font-extrabold text-[#9A4A2C] hover:underline">{how} ›</button>
      </div>
      <div className="relative ml-2.5 h-[150px] w-[136px] flex-none lg:ml-[51px] lg:origin-right lg:scale-[1.3]" aria-hidden="true">
        <div className="home-float absolute inset-0">
        {fan.map(([x, y, rot, c], k) => (
          <div key={k} className="absolute" style={{ left: x, top: y, transform: `rotate(${rot}deg)` }}>
            <Photo src={fam} w={54} h={64} c={c} className={`rounded-[3px] ${k === 2 ? 'shadow-[0_0_0_3px_#fff,0_10px_20px_rgba(45,30,20,0.35)]' : 'shadow-[0_0_0_3px_#fff,0_8px_16px_rgba(45,30,20,0.3)]'}`} />
            {phones && (
              <span className="absolute h-6 w-4 rounded box-border border-2 border-[#2D2D2D] bg-white"
                style={k === 0 ? { left: -6, top: -8 } : k === 1 ? { right: -6, top: -8 } : { left: 19, top: -14 }} />
            )}
          </div>
        ))}
        </div>
      </div>
    </Scene>
  );
}

const FAMILY_REGIONS: [number, number, number, number][] = [
  [472, 380, 158, 158], [470, 605, 148, 143], [634, 650, 150, 154],
  [200, 450, 220, 250], [642, 442, 146, 164], [160, 380, 270, 440],
];

/** A phone: dark frame, white screen. */
function Phone({ w, h, children, className = '' }: { w: number; h: number; children: ReactNode; className?: string }) {
  return (
    <div className={`box-border rounded-[14px] bg-[#2D2D2D] p-1 shadow-[0_14px_26px_rgba(45,30,20,0.3)] ${className}`} style={{ width: w, height: h }}>
      <div className="h-full w-full overflow-hidden rounded-[11px] bg-white">{children}</div>
    </div>
  );
}

/* ── The cards ────────────────────────────────────────────────────────── */

function CardShell({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <section data-testid={testid}
      className="flex h-full flex-col gap-2 rounded-[22px] bg-white p-4 pb-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.2)] text-left font-body lg:gap-3 lg:rounded-[26px] lg:p-6 lg:pb-5">
      {children}
    </section>
  );
}

export function AlbumsCard({ onStart }: { onStart: () => void }) {
  const fam = '/album-family.jpg';
  const [s1, s2, s3, s4] = ALBUMS_CARD.steps;
  return (
    <CardShell testid="home-albums-card">
      <span className="text-[11px] lg:text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#9A4A2C]">{ALBUMS_CARD.label}</span>
      <h1 className="m-0 font-display text-[22px] font-bold leading-[1.2] text-[#2D2D2D] sm:text-[24px] lg:text-[32px] lg:[text-wrap:balance]">{ALBUMS_CARD.title}</h1>
      <StepCarousel name={ALBUMS_CARD.label} testid="home-albums-slides" startDelayMs={SLIDE_MS / 2} slides={(go) => [
        <HookSlide key="hook" text={ALBUMS_CARD.hook} how={ALBUMS_CARD.how} onHow={() => go(1)} />,
        <Scene key="1">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]" aria-hidden="true">
            <div className="absolute left-[38px] top-3 -rotate-[5deg]">
              <Phone w={70} h={126} className="home-float">
                <div className="grid grid-cols-[repeat(3,17px)] content-start gap-0.5 px-1 pt-3">
                  {Array.from({ length: 12 }, (_, k) => {
                    const r = FAMILY_REGIONS[k % FAMILY_REGIONS.length];
                    return <Photo key={k} src={fam} w={17} h={20} c={crop(17, 20, r[0], r[1], r[2], r[3])} className="rounded-[2px]" />;
                  })}
                </div>
              </Phone>
            </div>
            <div className="absolute left-[104px] top-2.5 flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-[#B85C38] shadow-[0_6px_14px_rgba(184,92,56,0.4)]">
              <svg className="home-rise" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </div>
            <span className="absolute left-24 top-[50px] rounded-full bg-white px-[7px] py-0.5 text-[10px] font-extrabold text-[#9A4A2C] shadow-[0_3px_8px_rgba(0,0,0,0.15)]">40+</span>
          </div>
          <StepText n={1} step={s1} />
        </Scene>,
        <Scene key="2">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]">
            <div className="absolute left-4 top-[18px] rotate-[3deg]">
              <Photo src={fam} w={128} h={110} c={{ width: 156.4, left: -13.7, top: -46.3 }} alt="An album laid out by Megy"
                className="rounded-lg shadow-[0_0_0_3px_#fff,0_14px_26px_rgba(45,30,20,0.32)]" />
            </div>
            <div className="home-float absolute -left-1 top-[86px] drop-shadow-[0_6px_8px_rgba(45,30,20,0.25)]">
              <MegyMascot size={64} alt="" className="object-contain" />
            </div>
            <Sparkle x={126} y={6} size={22} fill="#C9962F" />
          </div>
          <StepText n={2} step={s2} />
        </Scene>,
        // The video memory always shines: the builder's own gold button.
        <Scene key="3" gold>
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]" aria-hidden="true">
            <div className="home-float absolute left-4 top-2">
              <div className="-rotate-3 relative">
                <Photo src={fam} w={104} h={88} c={crop(104, 88, 180, 440, 250, 200)} className="rounded-[3px] shadow-[0_14px_24px_rgba(45,30,20,0.32)]" />
                <div className="home-pop absolute bottom-[5px] right-[5px] rounded-[2px] bg-white p-0.5 shadow-[0_0_10px_rgba(226,181,71,0.9)]">
                  <FakeQr seed={31} cell={1} />
                </div>
              </div>
            </div>
            <span className="memory-shine absolute left-1 top-[106px] flex h-[34px] w-[142px] items-center justify-center gap-[5px] whitespace-nowrap rounded-full text-[11px] font-extrabold">
              <Video size={14} strokeWidth={2.4} /> <span>Add a video memory</span>
            </span>
          </div>
          <StepText n={3} step={s3} gold />
        </Scene>,
        <Scene key="4">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]">
            <div className="home-float absolute left-[22px] top-3">
              <Photo src="/album-travel.jpg" w={106} h={112} c={{ width: 162.3, left: -40.8, top: -56.5 }} alt="A printed album"
                className="-rotate-[4deg] rounded-lg shadow-[0_16px_28px_rgba(45,30,20,0.35)]" />
            </div>
            <TruckChip label="To your door" x={58} y={116} />
          </div>
          <StepText n={4} step={s4} />
        </Scene>,
      ]} />
      <button type="button" onClick={onStart} data-testid="home-start-creating"
        className="mt-auto flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-peach text-[16px] font-bold lg:h-[60px] lg:text-[18px] text-white shadow-[0_6px_16px_rgba(184,92,56,0.3)] hover:bg-blush-pink active:scale-[0.98] transition-[transform,background-color]">
        <Sparkles size={18} /> {ALBUMS_CARD.cta}
      </button>
    </CardShell>
  );
}

export function EventsCard() {
  const fam = '/album-family.jpg';
  const [s1, s2, s3, s4] = EVENTS_CARD.steps;
  const phones: [number, number, number][] = [[4, 8, 0], [22, 54, 3], [4, 100, 2]];
  return (
    <CardShell testid="home-events-card">
      <span className="flex items-center gap-1.5 text-[11px] lg:text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#9A4A2C]">
        <span className="rounded-full bg-[#B85C38] px-1.5 py-0.5 tracking-[0.08em] text-white">New</span>
        {EVENTS_CARD.label}
      </span>
      <h2 className="m-0 font-display text-[22px] font-bold leading-[1.2] text-[#2D2D2D] sm:text-[24px] lg:text-[32px] lg:[text-wrap:balance]">{EVENTS_CARD.title}</h2>
      <StepCarousel name={EVENTS_CARD.label} testid="home-events-slides" slides={(go) => [
        <HookSlide key="hook" text={EVENTS_CARD.body} how={EVENTS_CARD.how} onHow={() => go(1)} phones />,
        <Scene key="1">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]" aria-hidden="true">
            <div className="absolute left-10 top-3 -rotate-6">
              <Phone w={70} h={126} className="home-float">
                <div className="flex flex-col items-center gap-1.5 pt-3">
                  <span className="font-display text-[9px] font-bold italic text-[#B85C38]">Ana &amp; Ben</span>
                  <FakeQr seed={7} cell={2} />
                  <span className="flex items-center gap-0.5 rounded-full bg-[#E5F1E9] px-[5px] py-0.5 text-[7px] font-extrabold text-[#2E7D4A]">
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#2E7D4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>QR ready
                  </span>
                </div>
              </Phone>
            </div>
            <Sparkle x={112} y={6} size={22} fill="#C9962F" />
            <Sparkle x={24} y={104} size={14} fill="#B85C38" delay=".6s" />
          </div>
          <StepText n={1} step={s1} />
        </Scene>,
        <Scene key="2">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]" aria-hidden="true">
            <div className="absolute left-1 top-28 h-6 w-[132px] rounded-full bg-[#E9D2C3]" />
            <div className="absolute left-3.5 top-12 box-border flex h-[72px] w-14 flex-col items-center justify-center gap-[5px] rounded-[5px] bg-white shadow-[0_10px_18px_rgba(45,30,20,0.25)]">
              <FakeQr seed={23} cell={2} />
              <span className="text-[7px] font-extrabold tracking-[0.12em] text-[#9A4A2C]">TABLE 7</span>
            </div>
            <div className="absolute left-20 top-2.5 rotate-[9deg]">
              <div className="box-border h-[108px] w-[60px] rounded-[13px] bg-[#2D2D2D] p-1 shadow-[0_14px_26px_rgba(45,30,20,0.32)]">
                <div className="relative flex h-[100px] w-[52px] items-center justify-center overflow-hidden rounded-[10px] bg-[#3B3633]">
                  <div className="rounded-[2px] bg-white p-[3px]"><FakeQr seed={23} cell={1} /></div>
                  <svg className="absolute left-2 top-[26px]" width="36" height="46" viewBox="0 0 36 46" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M1 9V1h8M27 1h8v8M35 37v8h-8M9 45H1v-8" /></svg>
                  <div className="home-scan absolute left-1.5 right-1.5 h-0.5 rounded-sm bg-[#E07A52] shadow-[0_0_8px_2px_rgba(224,122,82,0.7)]" />
                </div>
              </div>
            </div>
          </div>
          <StepText n={2} step={s2} />
        </Scene>,
        <Scene key="3">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]" aria-hidden="true">
            {phones.map(([x, y, region], k) => {
              const r = FAMILY_REGIONS[region];
              return (
                <div key={k} className="absolute box-border h-11 w-[30px] rounded-[7px] bg-[#2D2D2D] p-0.5 shadow-[0_6px_12px_rgba(45,30,20,0.25)]" style={{ left: x, top: y }}>
                  <Photo src={fam} w={26} h={40} c={crop(26, 40, r[0], r[1], r[2], r[3])} className="rounded-[5px] bg-white" />
                </div>
              );
            })}
            <div className="absolute left-[76px] top-[52px] h-20 w-[66px] rounded-[4px_7px_7px_4px] bg-[#B85C38] shadow-[0_14px_24px_rgba(45,30,20,0.32)]">
              <div className="absolute bottom-0 left-1.5 top-0 w-0.5 bg-black/20" />
              <span className="absolute bottom-2.5 left-3.5 right-1.5 text-center font-display text-[9px] italic text-[#FBF1EB]">Our album</span>
            </div>
            <div className="absolute left-[86px] top-[30px] origin-top-left -rotate-[8deg] scale-75">
              <Photo src={fam} w={54} h={64} c={{ width: 349.6, left: -252, top: -172.5 }} className="rounded-[3px] shadow-[0_0_0_3px_#fff,0_8px_16px_rgba(45,30,20,0.3)]" />
            </div>
            <div className="home-fly absolute left-[92px] top-[26px] origin-top-left">
              <Photo src={fam} w={54} h={64} c={{ width: 401, left: -216.5, top: -270.8 }} className="rounded-[3px] shadow-[0_0_0_3px_#fff,0_8px_16px_rgba(45,30,20,0.3)]" />
            </div>
          </div>
          <StepText n={3} step={s3} />
        </Scene>,
        <Scene key="4">
          <div className="relative h-[150px] w-[150px] flex-none lg:origin-left lg:scale-[1.3] lg:mr-[45px]">
            <div className="home-float absolute left-[18px] top-3">
              <Photo src="/album-wedding.jpg" w={112} h={112} c={{ width: 154.4, left: -21.6, top: -46.6 }} alt="A printed wedding album"
                className="-rotate-3 rounded-lg shadow-[0_16px_28px_rgba(45,30,20,0.35)]" />
            </div>
            <span className="home-pop absolute left-2 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#B85C38] shadow-[0_4px_10px_rgba(184,92,56,0.45)]" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            <TruckChip label="On its way" x={56} y={116} />
          </div>
          <StepText n={4} step={s4} />
        </Scene>,
      ]} />
      <div className="mt-auto flex flex-col gap-2">
      <p className="m-0 text-center text-[12px] lg:text-[14px] text-[#6B625E]">{EVENTS_CARD.who}</p>
      {/* Outlined: Start Creating stays the one filled button on Home. */}
      <Link to="/events" data-testid="home-events-book"
        className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] border-2 border-peach bg-white text-[16px] font-bold lg:h-[60px] lg:text-[18px] text-[#9A4A2C] no-underline hover:bg-blush transition-colors">
        <CalendarHeart size={18} /> {EVENTS_CARD.cta} ›
      </Link>
      </div>
    </CardShell>
  );
}
