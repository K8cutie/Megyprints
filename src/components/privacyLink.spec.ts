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
