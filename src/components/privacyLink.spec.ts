// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY, ONE TAP AWAY IN THE APP (owner, 2026-10-28: "a privacy
   policy link inside the app; go do this"). Google Play wants it reachable
   inside the app, not only on the listing; /privacy existed but nothing
   linked to it. Now: the footer (every page, the app too) and the phone
   menu. And its Payment section says how people really pay (InstaPay QR,
   optional receipt), not "bank transfer or cash on delivery".
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('./AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn(), openSignup: vi.fn() }) }));
vi.mock('../lib/roles', () => ({ resolveRole: async () => null }));

import Navbar from './Navbar';
import Footer from './Footer';
import Privacy from '../pages/Privacy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** A page with the navbar and footer, on `/`; /privacy shows the policy. */
const site = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(Navbar),
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement('p', { 'data-testid': 'home' }, 'Home') }),
        createElement(Route, { path: '/privacy', element: createElement(Privacy) })),
      createElement(Footer)));
  });
};
const policyOpen = () => [...host.querySelectorAll('h1')].some((h) => h.textContent === 'Privacy Policy');

describe('the privacy policy is one tap away', () => {
  it('the footer links to it, and the tap opens it', async () => {
    await site();
    const link = q('footer-privacy') as HTMLAnchorElement;
    expect(text(link)).toBe('Privacy Policy');
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(policyOpen()).toBe(false);
    await act(async () => { link.click(); });
    expect(policyOpen()).toBe(true);
    expect(q('home')).toBeNull();
  });

  it('the phone menu links to it, and the tap opens it', async () => {
    await site();
    expect(q('menu-privacy')).toBeNull();
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!.click(); });
    const link = q('menu-privacy') as HTMLAnchorElement;
    expect(text(link)).toBe('Privacy Policy');
    expect(link.getAttribute('href')).toBe('/privacy');
    await act(async () => { link.click(); });
    expect(policyOpen()).toBe(true);
  });
});

describe('the policy says how people really pay', () => {
  it('InstaPay QR and an optional receipt, no cash on delivery', async () => {
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Privacy))); });
    const payment = [...host.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === 'Payment')!;
    expect(payment).toBeTruthy();
    const words = text(payment);
    expect(words).toContain('scan our InstaPay QR code with your own bank or e-wallet app');
    expect(words).toContain('We do not collect or store your card or bank details in the app.');
    expect(words).toContain('You can attach a screenshot of your transfer receipt and its reference number. It\'s optional.');
    expect(text(host).toLowerCase()).not.toContain('cash on delivery');
  });
});

/* Owner, 2026-10-28: "Fix them": the policy said a QR memory stores a video
   LINK (the video file itself is uploaded, to a public bucket), and never
   mentioned events (guests' photos and videos are uploaded and shown to the
   event's guests and screen). The numbers below are 0044's (event_keep_days
   120, cancelled/host-deleted + 3 days). */
describe('the policy says what happens to QR memory videos and event photos', () => {
  const section = (title: string) => [...host.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === title) ?? null;
  const render = () => act(async () => { root.render(createElement(MemoryRouter, null, createElement(Privacy))); });

  it('QR memory videos: uploaded when you order, anyone with the code can watch, deleting the memory or account', async () => {
    await render();
    const words = text(section('Where your photos go'));
    expect(words).toContain('A video you add to a page stays on your device while you design, and is uploaded to our servers when you place your order.');
    expect(words).toContain('Anyone who scans the QR code, or has its link, can watch the video.');
    expect(words).toContain('You can delete a QR memory in My Memories, and its QR code stops working. Deleting your account also deletes the video files.');
    // Not just "a link" any more.
    expect(text(host)).not.toContain('we store that link');
  });

  it('events: the host\'s booking details, guests\' photos seen by the event, how long they are kept', async () => {
    await render();
    const events = section('Events');
    expect(events).not.toBeNull();
    const words = text(events);
    expect(words).toContain('your name, mobile number, the event date, venue and number of guests, and any payment receipts you attach');
    expect(words).toContain('you join by scanning the QR code at the event and typing your name. No account is needed.');
    expect(words).toContain('They can be seen, with your name and table number, by the host, by the other guests of that event, and on the event\'s screen at the venue.');
    expect(words).toContain('anyone with the exact address can open them');
    expect(words).toContain('Everything from an event is deleted 120 days after the event, or 3 days after a booking is cancelled or the host deletes their account.');
  });

  it('"Information we collect" names both', async () => {
    await render();
    const words = text(section('Information we collect'));
    expect(words).toContain('QR memory videos');
    expect(words).toContain('Event photos and videos');
  });
});
