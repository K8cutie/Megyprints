// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/* ══════════════════════════════════════════════════════════════════════════
   TERMS OF SERVICE, 18 OR OLDER (a tester, 2026-10-31: "I recommend that you
   restrict it to adults only. Additionally, ensure your terms of service
   state that all users declare themselves to be of legal age"). There were
   no terms, only the privacy policy, which said "not directed to children
   under 13". Now: a Terms page that says you must be 18 or older to make an
   account or order; links to it beside Privacy Policy in the footer and the
   phone menu; one line under Create Account and under Place order ("By …
   you agree to our Terms of Service and confirm you're 18 or older"); and
   the privacy policy's Children part says 18 too.
   ══════════════════════════════════════════════════════════════════════════ */

const auth = vi.hoisted(() => ({ signup: vi.fn(), clearError: vi.fn() }));
vi.mock('../lib/authContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), signup: auth.signup, loading: false, error: null, clearError: auth.clearError }),
}));
vi.mock('./AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn(), openSignup: vi.fn() }) }));
vi.mock('../lib/roles', () => ({ resolveRole: async () => null }));

import Navbar from './Navbar';
import Footer from './Footer';
import TermsAgreeLine from './TermsAgreeLine';
import Terms from '../pages/Terms';
import Privacy from '../pages/Privacy';
import { SignupModal } from '../pages/auth/SignupModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const heading = () => host.querySelector('h1')?.textContent ?? '';
/** `children` on `/`, with /terms and /privacy routed to their pages. */
const at = async (...children: ReturnType<typeof createElement>[]) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] },
      ...children,
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement('p', { 'data-testid': 'home' }, 'Home') }),
        createElement(Route, { path: '/terms', element: createElement(Terms) }),
        createElement(Route, { path: '/privacy', element: createElement(Privacy) }))));
  });
};
const sectionText = (title: string) =>
  text([...host.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === title) ?? null);

describe('the Terms are one tap away, beside the privacy policy', () => {
  it('the footer links to them, and the tap opens them', async () => {
    await at(createElement(Footer));
    const link = q('footer-terms') as HTMLAnchorElement;
    expect(text(link)).toBe('Terms of Service');
    expect(link.getAttribute('href')).toBe('/terms');
    expect(q('footer-privacy')).not.toBeNull();
    await act(async () => { link.click(); });
    expect(heading()).toBe('Terms of Service');
    expect(q('home')).toBeNull();
  });

  it('the phone menu links to them, and the tap opens them', async () => {
    await at(createElement(Navbar));
    expect(q('menu-terms')).toBeNull();
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!.click(); });
    const link = q('menu-terms') as HTMLAnchorElement;
    expect(text(link)).toBe('Terms of Service');
    expect(link.getAttribute('href')).toBe('/terms');
    expect(q('menu-privacy')).not.toBeNull();
    await act(async () => { link.click(); });
    expect(heading()).toBe('Terms of Service');
  });
});

describe('what the Terms say', () => {
  it('you must be 18 or older to make an account or order', async () => {
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Terms))); });
    expect(text(q('terms-age'))).toBe('To make an account or place an order, you must be 18 years old or older. When you make an account or place an order, you confirm that you are.');
    expect(sectionText('You must be 18 or older')).not.toBe('');
  });

  it('what is not printed, how ordering really works, and where each link goes', async () => {
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Terms))); });
    expect(sectionText("What we won't print")).toContain('sexual images of anyone under 18. We report these to the police.');
    const ordering = sectionText('Ordering and paying');
    expect(ordering).toContain('You pay by InstaPay');
    expect(ordering).toContain('An unpaid order closes by itself after 7 days.');
    expect(ordering).toContain('Check your album before you order.');
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/orders', '/memories', '/privacy', '/contact', 'mailto:megyprintsph@gmail.com']));
  });

  it("the privacy policy's Children part says 18 too, and links to the Terms", async () => {
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Privacy))); });
    const age = q('privacy-age')!;
    expect(text(age)).toContain('Megyprints is for people 18 and older');
    expect(text(age)).toContain("We don't knowingly collect personal information from anyone under 18.");
    expect(text(age)).not.toContain('13');
    expect(age.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(heading()).toBe('Privacy Policy');
  });
});

describe('the line under the buttons that make an account or place an order', () => {
  it('says what the tap agrees to, with the Terms one tap away', async () => {
    await at(createElement(TermsAgreeLine, { by: 'placing an order' }));
    expect(text(q('terms-agree'))).toBe("By placing an order you agree to our Terms of Service and confirm you're 18 or older.");
    await act(async () => { (q('terms-agree-link') as HTMLAnchorElement).click(); });
    expect(heading()).toBe('Terms of Service');
  });

  it('Create Account has it, and the Terms open with the form closed', async () => {
    const onClose = vi.fn();
    await at(createElement(SignupModal, { isOpen: true, onClose, onSwitchToLogin: vi.fn() }));
    const submit = [...document.querySelectorAll('button[type="submit"]')].find((b) => text(b) === 'Create Account')!;
    expect(submit).toBeTruthy();
    const line = q('terms-agree')!;
    expect(text(line)).toBe("By creating an account you agree to our Terms of Service and confirm you're 18 or older.");
    // Right under Create Account, inside the form.
    expect(submit.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.closest('form')).toBe(submit.closest('form'));
    await act(async () => { (q('terms-agree-link') as HTMLAnchorElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(heading()).toBe('Terms of Service');
  });

  it('Place order has it, right under the button, and only where the button is', () => {
    const src = readFileSync('src/pages/Order.tsx', 'utf8');
    const button = src.indexOf('data-testid="order-place"');
    const line = src.indexOf('<TermsAgreeLine by="placing an order"');
    expect(button).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(button);
    // Nothing else is drawn between the button's end and the line.
    const between = src.slice(src.indexOf('</button>', button) + '</button>'.length, line);
    expect(between.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim()).toBe('');
    expect(src.split('<TermsAgreeLine').length - 1).toBe(1);
  });
});
