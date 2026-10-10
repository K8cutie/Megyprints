// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   HOME'S TWO CARDS (the owner's canvas board "Home with Albums and Events",
   built 2026-10-10). The middle of each card plays its steps by itself, a
   slide every 4 s; Albums half a beat after Events, so they never move
   together; dots jump, Pause holds, "Here's how ›" goes to step 1; a finger
   swipes them; for people who asked for less motion they still change, but
   jump instead of sliding. Start Creating is the one filled button; the
   Events button books.
   ══════════════════════════════════════════════════════════════════════════ */

import { AlbumsCard, EventsCard, SLIDE_MS, SWIPE_PX } from './HomeCards';
import { ALBUMS_CARD, EVENTS_CARD } from '../homeCopy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let reduce = false;
const onStart = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  onStart.mockReset();
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') ? reduce : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

const render = () => act(() => {
  root.render(createElement(MemoryRouter, null,
    createElement('div', null, createElement(AlbumsCard, { onStart }), createElement(EventsCard))));
});
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const slide = (id: string) => Number($(id).getAttribute('data-slide'));
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe('the step slides', () => {
  it('each card has its hook and four steps, in the owner\'s words', () => {
    render();
    const albums = $('home-albums-card').textContent!;
    const events = $('home-events-card').textContent!;
    expect(albums).toContain(ALBUMS_CARD.title);
    expect(albums).toContain(ALBUMS_CARD.hook);
    for (const s of ALBUMS_CARD.steps) expect(albums).toContain(s.title);
    expect(events).toContain(EVENTS_CARD.title);
    expect(events).toContain(EVENTS_CARD.body);
    for (const s of EVENTS_CARD.steps) expect(events).toContain(s.title);
    expect(host.querySelectorAll('[data-testid="home-albums-slides-dot"]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-testid="home-events-slides-dot"]')).toHaveLength(5);
  });

  it('a slide every 4 s, Albums half a beat after Events: never at the same moment', () => {
    render();
    wait(SLIDE_MS);
    expect([slide('home-events-slides'), slide('home-albums-slides')]).toEqual([1, 0]);
    wait(SLIDE_MS / 2);
    expect([slide('home-events-slides'), slide('home-albums-slides')]).toEqual([1, 1]);
    wait(SLIDE_MS / 2);
    expect([slide('home-events-slides'), slide('home-albums-slides')]).toEqual([2, 1]);
    wait(SLIDE_MS * 3);
    expect(slide('home-events-slides')).toBe(0); // round again after the 5th
  });

  it('Pause holds the slides and says Play; Play starts them again', () => {
    render();
    click($('home-events-slides-pause'));
    expect($('home-events-slides-pause').textContent).toBe('Play');
    wait(SLIDE_MS * 3);
    expect(slide('home-events-slides')).toBe(0);
    click($('home-events-slides-pause'));
    wait(SLIDE_MS);
    expect(slide('home-events-slides')).toBe(1);
  });

  it('a dot jumps there and the clock starts over from it', () => {
    render();
    click(host.querySelectorAll('[data-testid="home-albums-slides-dot"]')[3]);
    expect(slide('home-albums-slides')).toBe(3);
    expect(host.querySelectorAll('[data-testid="home-albums-slides-dot"]')[3].getAttribute('aria-current')).toBe('true');
    wait(SLIDE_MS - 10);
    expect(slide('home-albums-slides')).toBe(3);
    wait(20);
    expect(slide('home-albums-slides')).toBe(4);
  });

  it('"Want to know how? ›" and "Here’s how ›" go to step 1', () => {
    render();
    const how = [...$('home-events-card').querySelectorAll('button')].find((b) => b.textContent?.startsWith(EVENTS_CARD.how))!;
    click(how);
    expect(slide('home-events-slides')).toBe(1);
    const albumsHow = [...$('home-albums-card').querySelectorAll('button')].find((b) => b.textContent?.startsWith(ALBUMS_CARD.how))!;
    click(albumsHow);
    expect(slide('home-albums-slides')).toBe(1);
  });

  it('only the slide on screen is read out; the rest are hidden from screen readers', () => {
    render();
    const groups = $('home-events-slides').querySelectorAll('[aria-roledescription="slide"]');
    expect([...groups].map((g) => g.getAttribute('aria-hidden'))).toEqual(['false', 'true', 'true', 'true', 'true']);
  });

  it('asked for less motion: the slides still change every 4 s, but jump instead of sliding', async () => {
    // Owner, 2026-10-10: "why is the sidescroll slider turned off for phone?"
    // It started paused on a phone with Reduce Motion / Remove animations on.
    reduce = true;
    render();
    expect($('home-events-slides-pause').textContent).toBe('Pause');
    wait(SLIDE_MS);
    expect(slide('home-events-slides')).toBe(1);
    wait(SLIDE_MS * 1.5);
    expect([slide('home-events-slides'), slide('home-albums-slides')]).toEqual([2, 2]);
    // The jump: no sliding transition, and the scenes hold still.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    const reduced = css.slice(css.indexOf('.home-slide-track { transition: transform'));
    expect(reduced).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.home-slide-track \{ transition: none; \}\s*\.home-float, [^}]*animation: none !important;/);
  });
});

describe('a finger swipes the slides (phones)', () => {
  // The slides' box; a finger's moves are pointer events of type "touch".
  const region = (id: string) => $(id).querySelector('[role="region"]') as HTMLElement;
  const track = (id: string) => region(id).firstElementChild as HTMLElement;
  const finger = (el: Element, type: string, x: number, y = 60, pointerType = 'touch') => act(() => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: 7 });
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
    el.dispatchEvent(ev);
  });
  const swipe = (id: string, from: number, to: number, y = 60) => {
    const r = region(id);
    finger(r, 'pointerdown', from, 60);
    finger(r, 'pointermove', (from + to) / 2, (60 + y) / 2);
    finger(r, 'pointermove', to, y);
    finger(r, 'pointerup', to, y);
  };

  it('swipe left goes to the next slide, swipe right comes back', () => {
    render();
    swipe('home-events-slides', 300, 100);
    expect(slide('home-events-slides')).toBe(1);
    swipe('home-events-slides', 300, 100);
    expect(slide('home-events-slides')).toBe(2);
    swipe('home-events-slides', 100, 300);
    expect(slide('home-events-slides')).toBe(1);
  });

  it('the slides follow the finger while it drags, then settle', () => {
    render();
    const r = region('home-albums-slides');
    finger(r, 'pointerdown', 300);
    finger(r, 'pointermove', 220);
    expect(track('home-albums-slides').style.transform).toBe('translateX(calc(-0% + -80px))');
    expect(track('home-albums-slides').style.transition).toBe('none');
    finger(r, 'pointerup', 220);
    expect(track('home-albums-slides').style.transform).toBe('translateX(-100%)');
    expect(track('home-albums-slides').style.transition).toBe('');
  });

  it('a short drag, or an up-and-down scroll, leaves the slide where it was', () => {
    render();
    swipe('home-events-slides', 300, 300 - (SWIPE_PX - 10));
    expect(slide('home-events-slides')).toBe(0);
    // Mostly down, though sideways by more than a swipe: the page scrolls.
    swipe('home-events-slides', 300, 300 - SWIPE_PX - 20, 360);
    expect(slide('home-events-slides')).toBe(0);
    expect(track('home-events-slides').style.transform).toBe('translateX(-0%)');
    // The browser takes over a scroll with a cancel: never a swipe.
    const r = region('home-events-slides');
    finger(r, 'pointerdown', 300);
    finger(r, 'pointermove', 100);
    finger(r, 'pointercancel', 100);
    expect(slide('home-events-slides')).toBe(0);
    expect(track('home-events-slides').style.transform).toBe('translateX(-0%)');
  });

  it('there is nothing before the first slide or after the last: they stop there', () => {
    render();
    swipe('home-events-slides', 100, 300);
    expect(slide('home-events-slides')).toBe(0);
    click(host.querySelectorAll('[data-testid="home-events-slides-dot"]')[4]);
    swipe('home-events-slides', 300, 100);
    expect(slide('home-events-slides')).toBe(4);
  });

  it('a finger on the slides holds the clock; lifting it starts the clock over', () => {
    render();
    const r = region('home-events-slides');
    finger(r, 'pointerdown', 200);
    wait(SLIDE_MS * 3);
    expect(slide('home-events-slides')).toBe(0);
    finger(r, 'pointerup', 200);
    wait(SLIDE_MS - 10);
    expect(slide('home-events-slides')).toBe(0);
    wait(20);
    expect(slide('home-events-slides')).toBe(1);
  });

  it('a swipe restarts the clock from the slide it lands on', () => {
    render();
    wait(SLIDE_MS - 500);
    swipe('home-events-slides', 300, 100);
    expect(slide('home-events-slides')).toBe(1);
    wait(SLIDE_MS - 10);
    expect(slide('home-events-slides')).toBe(1);
    wait(20);
    expect(slide('home-events-slides')).toBe(2);
  });

  it('a swipe that starts on "Want to know how? ›" does not press it; a tap does', () => {
    render();
    const how = [...$('home-events-card').querySelectorAll('button')].find((b) => b.textContent?.startsWith(EVENTS_CARD.how))!;
    // Swipe right from the button (nothing before slide 1), then the click the browser may send.
    finger(how, 'pointerdown', 100);
    finger(how, 'pointermove', 200);
    finger(how, 'pointerup', 200);
    click(how);
    expect(slide('home-events-slides')).toBe(0);
    // The next plain tap works.
    finger(how, 'pointerdown', 100);
    finger(how, 'pointerup', 100);
    click(how);
    expect(slide('home-events-slides')).toBe(1);
  });

  it('a swipe keeps its moves from the page (no sideways fling eats the next tap); a scroll does not', () => {
    // Real phone, 2026-10-10: after a quick swipe the next tap on Pause did nothing.
    render();
    const r = region('home-events-slides');
    const move = () => {
      const ev = new Event('touchmove', { bubbles: true, cancelable: true });
      r.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    finger(r, 'pointerdown', 300);
    expect(move()).toBe(false); // not a swipe yet
    finger(r, 'pointermove', 250);
    expect(move()).toBe(true);  // swiping: the page leaves it alone
    finger(r, 'pointerup', 250);
    finger(r, 'pointerdown', 300);
    finger(r, 'pointermove', 290, 160); // up-and-down
    expect(move()).toBe(false); // the page scrolls as usual
    finger(r, 'pointercancel', 290, 160);
  });

  it('a mouse does not drag the slides (it has the dots); up-and-down is left to the page', () => {
    render();
    const r = region('home-events-slides');
    finger(r, 'pointerdown', 300, 60, 'mouse');
    finger(r, 'pointermove', 100, 60, 'mouse');
    finger(r, 'pointerup', 100, 60, 'mouse');
    expect(slide('home-events-slides')).toBe(0);
    expect(r.className).toMatch(/\btouch-pan-y\b/);
  });
});

describe('bigger on desktop, the same on a phone (owner, 2026-10-10)', () => {
  // "make it bigger on the desktop but looking at the mobile no changes":
  // the phone sizes stay as they were; desktop (lg, 1024 px+) adds its own.
  it('each size keeps its phone value and adds a desktop one', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'HomeCards.tsx'), 'utf8');
    const home = readFileSync(resolve(__dirname, '../Home.tsx'), 'utf8');
    for (const pair of [
      'h-[150px] lg:h-[200px]',                       // the slides
      'w-[150px] flex-none lg:origin-left lg:scale-[1.3]', // their pictures
      'text-[22px]',                                  // the headlines on a phone…
      'sm:text-[24px] lg:text-[32px]',                // …and bigger on desktop
      'text-[16px] lg:text-[20px]',                   // step titles
      'text-[13px] lg:text-[15px]',                   // step lines
      'h-[52px] w-full', 'lg:h-[60px] lg:text-[18px]', // the buttons
      'p-4 pb-3.5', 'lg:p-6 lg:pb-5',                 // the cards
    ]) expect(src).toContain(pair);
    expect(home).toContain('max-w-[1040px] lg:max-w-[1280px]');
    // No other breakpoint grows them (md is a tablet: unchanged).
    expect(src).not.toMatch(/\b(md|sm):(h-\[200px\]|scale-|p-6)/);
  });
});

describe('the buttons', () => {
  it('Start Creating is the one filled button; it starts an album', () => {
    render();
    click($('home-start-creating'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect($('home-start-creating').className).toMatch(/\bbg-peach\b/);
    expect($('home-events-book').className).not.toMatch(/\bbg-peach\b/);
  });
  it('the Events button books, and says who Events is for', () => {
    render();
    expect($('home-events-book').getAttribute('href')).toBe('/events');
    expect($('home-events-book').textContent).toContain(EVENTS_CARD.cta);
    expect($('home-events-card').textContent).toContain(EVENTS_CARD.who);
  });
});
