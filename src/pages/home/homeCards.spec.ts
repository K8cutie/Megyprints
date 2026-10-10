// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   HOME'S TWO CARDS (the owner's canvas board "Home with Albums and Events",
   built 2026-10-10). The middle of each card plays its steps by itself, a
   slide every 4 s; Albums half a beat after Events, so they never move
   together; dots jump, Pause holds, "Here's how ›" goes to step 1; nothing
   plays by itself for people who asked for less motion. Start Creating is the
   one filled button; the Events button books.
   ══════════════════════════════════════════════════════════════════════════ */

import { AlbumsCard, EventsCard, SLIDE_MS } from './HomeCards';
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

  it('asked for less motion: nothing plays by itself (the button offers Play)', () => {
    reduce = true;
    render();
    wait(SLIDE_MS * 4);
    expect([slide('home-events-slides'), slide('home-albums-slides')]).toEqual([0, 0]);
    expect($('home-events-slides-pause').textContent).toBe('Play');
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
