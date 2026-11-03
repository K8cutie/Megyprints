// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE COACH MARK ITSELF (components/lesson/CoachMark): where the bubble goes
   beside its control, with its arrow towards it and a ring around it; that
   it never sits on the lesson strip (found on the walk: a tall layout sheet
   left no room above it, and the bubble hid the strip's second line); the
   wait before a later step shows; nothing when no control is on screen.
   Positions come from getBoundingClientRect, set here, and the bubble is
   64 px tall, as on the walk (jsdom draws nothing).
   ══════════════════════════════════════════════════════════════════════════ */

import CoachMark, { COACH_FALLBACK_MS, type CoachStep } from './CoachMark';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
/** An element on the page at a place on a 390×844 phone. */
const place = (attrs: Record<string, string>, box: { x: number; y: number; w: number; h: number }) => {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.getBoundingClientRect = () => ({ left: box.x, top: box.y, width: box.w, height: box.h, right: box.x + box.w, bottom: box.y + box.h, x: box.x, y: box.y, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
};
const STEPS: CoachStep[] = [
  { target: '[data-coach="tool"]', text: 'This is the tool. **Tap it.**' },
  { target: '[data-coach="button"]', text: 'Tap **Show me** to try it.' },
];
const show = async (props: Partial<Parameters<typeof CoachMark>[0]> = {}) => {
  await act(async () => { root.render(createElement(CoachMark, { steps: STEPS, ...props })); });
};
const px = (v: string) => Number.parseFloat(v);
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true, get() { return (this as HTMLElement).dataset.testid === 'coach-mark-bubble' ? 64 : 0; },
  });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.innerHTML = '';
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
  vi.useRealTimers();
});

describe('beside its control', () => {
  it('a sheet low on the screen: the bubble above it, its arrow down at it, the ring around it', async () => {
    place({ 'data-coach': 'tool' }, { x: 0, y: 500, w: 390, h: 344 });
    await show();
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="tool"]');
    const bubble = $('coach-mark-bubble')!;
    // Right above the sheet: its 64 px and a 14 px gap for the arrow.
    expect(px(bubble.style.top)).toBe(500 - 14 - 64);
    expect($('coach-mark-arrow')!.dataset.side).toBe('below');
    const ring = $('coach-mark-ring')!;
    expect(px(ring.style.top)).toBe(496);
    expect(px(ring.style.left)).toBe(2); // kept on screen
    expect([...$('coach-mark-text')!.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['Tap it.']);
    expect($('coach-mark-bubble')!.querySelector('img')).not.toBeNull(); // Megy
  });

  it('a box high on the screen: the bubble below it, its arrow up at it', async () => {
    place({ 'data-coach': 'tool' }, { x: 16, y: 120, w: 358, h: 100 });
    await show();
    expect(px($('coach-mark-bubble')!.style.top)).toBe(220 + 14);
    expect($('coach-mark-arrow')!.dataset.side).toBe('above');
  });

  it('never on the lesson strip: with no room between the strip and a tall sheet, the bubble slides onto the sheet\'s top edge', async () => {
    place({ 'data-testid': 'strip' }, { x: 0, y: 48, w: 390, h: 62 }); // the strip: 48 to 110
    place({ 'data-coach': 'tool' }, { x: 0, y: 169, w: 390, h: 675 }); // the layout sheet, 80% of the screen
    await show({ keepClear: '[data-testid="strip"]' });
    // Right above the sheet would be 169 - 14 - 64 = 91, on the strip; instead, 6 px under it.
    expect(px($('coach-mark-bubble')!.style.top)).toBe(110 + 6);
    expect($('coach-mark-arrow')!.dataset.side).toBe('below');
  });

  it('nothing in it takes a tap', async () => {
    place({ 'data-coach': 'tool' }, { x: 0, y: 500, w: 390, h: 344 });
    await show();
    expect($('coach-mark')!.className).toContain('pointer-events-none');
    expect($('coach-mark')!.querySelectorAll('button, a, input, textarea')).toHaveLength(0);
  });
});

describe('which step', () => {
  it('the first control on screen; a later one only after the first has been gone a moment', async () => {
    place({ 'data-coach': 'button' }, { x: 258, y: 60, w: 116, h: 38 });
    await show();
    // The tool may be on its way in: not the button at once.
    expect($('coach-mark')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(COACH_FALLBACK_MS + 200); });
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="button"]');
    expect($('coach-mark')!.dataset.coachStep).toBe('1');
    // The tool opens: on it at once.
    const tool = place({ 'data-coach': 'tool' }, { x: 0, y: 500, w: 390, h: 344 });
    await act(async () => { vi.advanceTimersByTime(1); });
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="tool"]');
    // It closes: gone for a moment, then the button again.
    tool.remove();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect($('coach-mark')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(COACH_FALLBACK_MS); });
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="button"]');
  });

  it('no control on screen: nothing', async () => {
    await show();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect($('coach-mark')).toBeNull();
  });
});
