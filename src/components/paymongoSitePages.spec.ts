// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   WHAT PAYMONGO CHECKS ON THE WEBSITE (owner's handoff, 2026-11-25).
   Megyprints takes payments through PayMongo under Bridgemedia, a registered
   business, for now. PayMongo turns payments on only when the website is
   complete, with no placeholder pages, and shows: a Privacy Policy, a Return
   and Refund Policy, Terms with a way to settle a dispute, a way to reach
   customer service, prices in pesos, a Philippine business address, and the
   footer line "Megyprints is a brand of Bridgemedia" (to match its
   documents). The words live in src/lib/legalPages.ts and the business
   facts in src/lib/business.ts, shared with the 2.0 app.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), signup: vi.fn(), loading: false, error: null, clearError: vi.fn() }),
}));
vi.mock('./AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn(), openSignup: vi.fn() }) }));
vi.mock('../lib/roles', () => ({ resolveRole: async () => null }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) }, supabaseConfigured: true }));
vi.mock('../lib/report', () => ({ reportError: () => {} }));

import Navbar from './Navbar';
import Footer from './Footer';
import Contact from '../pages/Contact';
import Refund from '../pages/Refund';
import Terms from '../pages/Terms';
import Privacy from '../pages/Privacy';
import { BRAND_OF_LINE, BUSINESS_ADDRESS, COURTS_CITY } from '../lib/business';
import { REFUND_POLICY, REFUND_WORKING_DAYS, REPORT_DAYS } from '../lib/legalPages';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const heading = () => host.querySelector('h1')?.textContent ?? '';
const sectionText = (title: string) =>
  text([...host.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === title) ?? null);
const hrefs = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
/** Words a reviewer would read as "not finished". */
const PLACEHOLDER = /\[[^\]]*\]|\bTBD\b|\bTODO\b|lorem|XXX|address here|coming soon|under construction/i;

/** `children` on `/`, with the legal pages routed. */
const at = async (...children: ReturnType<typeof createElement>[]) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] },
      ...children,
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement('p', { 'data-testid': 'home' }, 'Home') }),
        createElement(Route, { path: '/refund', element: createElement(Refund) }),
        createElement(Route, { path: '/terms', element: createElement(Terms) }),
        createElement(Route, { path: '/privacy', element: createElement(Privacy) }))));
  });
};
const page = async (el: ReturnType<typeof createElement>) => {
  await act(async () => { root.render(createElement(MemoryRouter, null, el)); });
};

describe('the business facts', () => {
  it('the footer line PayMongo asks for, word for word', () => {
    expect(BRAND_OF_LINE).toBe('Megyprints is a brand of Bridgemedia.');
  });
  it('the address and the courts city wait for the owner: no made-up value', () => {
    // Both must match Bridgemedia's DTI papers. Until given, they are null
    // and nothing shows (the tests below check no placeholder shows either).
    expect(BUSINESS_ADDRESS === null || BUSINESS_ADDRESS.trim().length > 10).toBe(true);
    expect(COURTS_CITY === null || COURTS_CITY.trim().length > 2).toBe(true);
  });
});

describe('the footer', () => {
  it('says Megyprints is a brand of Bridgemedia, with no placeholder', async () => {
    await at(createElement(Footer));
    expect(text(q('footer-who-sells'))).toBe(BUSINESS_ADDRESS ? `${BRAND_OF_LINE}${BUSINESS_ADDRESS}` : BRAND_OF_LINE);
    expect(text(host)).not.toMatch(PLACEHOLDER);
  });

  it('links the three policies; the refund link opens the Return and Refund Policy', async () => {
    await at(createElement(Footer));
    expect(q('footer-privacy')?.getAttribute('href')).toBe('/privacy');
    expect(q('footer-terms')?.getAttribute('href')).toBe('/terms');
    const refund = q('footer-refund') as HTMLAnchorElement;
    expect(text(refund)).toBe('Return and Refund Policy');
    expect(refund.getAttribute('href')).toBe('/refund');
    await act(async () => { refund.click(); });
    expect(heading()).toBe('Return and Refund Policy');
    expect(q('home')).toBeNull();
  });
});

describe('the phone menu', () => {
  it('has the refund policy beside the other two, and the tap opens it', async () => {
    await at(createElement(Navbar));
    expect(q('menu-refund')).toBeNull();
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!.click(); });
    const link = q('menu-refund') as HTMLAnchorElement;
    expect(text(link)).toBe('Return and Refund Policy');
    expect(q('menu-privacy')).not.toBeNull();
    expect(q('menu-terms')).not.toBeNull();
    await act(async () => { link.click(); });
    expect(heading()).toBe('Return and Refund Policy');
  });
});

describe('the Return and Refund Policy page', () => {
  it('every part, in plain words, and no placeholder', async () => {
    await page(createElement(Refund));
    expect(heading()).toBe('Return and Refund Policy');
    expect([...host.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(REFUND_POLICY.sections.map((s) => s.title));
    expect(text(host)).not.toMatch(PLACEHOLDER);
    expect(text(q('refund-who-sells'))).toContain('Megyprints is a brand of Bridgemedia, a business registered in the Philippines');
  });

  it('what is refunded, what is printed again, and what is not', async () => {
    await page(createElement(Refund));
    expect(sectionText('Cancelling an order')).toContain('An unpaid order: cancel it yourself in Your orders. You pay nothing.');
    // Owner, 2026-11-25: no change-of-mind refund once paid ("There is no
    // change of mind law in PH"; "it will kill us").
    expect(sectionText('Cancelling an order')).toContain("A paid order: we can't cancel it or refund it because you changed your mind.");
    expect(text(host)).not.toMatch(/refund the full amount|haven't started printing/);
    expect(sectionText('If something is wrong with your album')).toContain('We print it again for free, and send it to you for free, when:');
    expect(text(q('refund-when-refund'))).toBe("If we can't print it again, or the new album is wrong too, we refund what you paid for that album.");
    expect(sectionText("What we can't refund")).toContain('A change of mind, once you have paid.');
    expect(sectionText('How to ask')).toContain(`within ${REPORT_DAYS} days after your album arrives`);
    expect(text(q('refund-how-paid'))).toContain(`within ${REFUND_WORKING_DAYS} working days`);
    expect(sectionText('Your rights by law')).toContain('Consumer Act of the Philippines (Republic Act 7394)');
  });

  it('every link goes somewhere real', async () => {
    await page(createElement(Refund));
    expect(hrefs()).toEqual(expect.arrayContaining(['/orders', '/terms', '/contact', 'mailto:megyprintsph@gmail.com']));
    expect(hrefs().every((h) => h && h !== '#')).toBe(true);
  });
});

describe('the Terms', () => {
  it('say who sells, and link the refund policy', async () => {
    await page(createElement(Terms));
    expect(text(q('terms-who-sells'))).toContain('Megyprints is a brand of Bridgemedia, a business registered in the Philippines');
    expect(sectionText('If something is wrong')).toContain("We print it again for free, or refund you if we can't.");
    expect(hrefs()).toContain('/refund');
    expect(sectionText('Ordering and paying')).toContain('Prices are in Philippine pesos.');
  });

  it('say how a dispute is settled: us first, then the DTI, then the courts', async () => {
    await page(createElement(Terms));
    const disputes = sectionText('If we disagree');
    expect(text(q('terms-disputes'))).toContain('Tell us first.');
    expect(disputes).toContain('Department of Trade and Industry (DTI)');
    expect(disputes).toContain(COURTS_CITY ? `the proper courts of ${COURTS_CITY}.` : 'the proper courts of the Philippines.');
    expect(text(host)).not.toMatch(PLACEHOLDER);
  });
});

describe('the Privacy Policy', () => {
  it('says who sells, and the rights the Data Privacy Act gives', async () => {
    await page(createElement(Privacy));
    expect(text(q('privacy-who-sells'))).toContain('Megyprints is a brand of Bridgemedia');
    const rights = sectionText('Your rights');
    expect(rights).toContain('Data Privacy Act of 2012 (Republic Act 10173)');
    expect(rights).toContain('National Privacy Commission');
    expect(rights).toContain('To use any of these rights, email megyprintsph@gmail.com.');
    expect(text(host)).not.toMatch(PLACEHOLDER);
  });
});

describe('the Contact page', () => {
  it('says who sells, gives the email, and links the refund policy', async () => {
    await page(createElement(Contact));
    const business = q('contact-business')!;
    expect(text(business)).toContain(BRAND_OF_LINE);
    expect(business.querySelector('a')?.getAttribute('href')).toBe('mailto:megyprintsph@gmail.com');
    expect(q('contact-refund')?.getAttribute('href')).toBe('/refund');
    expect(text(host)).not.toMatch(PLACEHOLDER);
  });

  it("the FAQ's refund answer says the same as the policy (made to order; damaged or wrong is printed again)", async () => {
    await page(createElement(Contact));
    const faq = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('refund policy'))!;
    await act(async () => { faq.click(); });
    expect(text(host)).toContain("Albums are made to order, so we can't cancel or refund a paid order because you changed your mind.");
    expect(text(host)).toContain('If your album arrives damaged or wrong, we print it again for free.');
    expect(text(host)).not.toContain("we don't offer refunds");
  });
});

describe('once the owner gives the address and the city', () => {
  it('the footer, the Contact page and the words show them', async () => {
    vi.resetModules();
    vi.doMock('../lib/business', async (orig) => ({
      ...(await orig<typeof import('../lib/business')>()),
      BUSINESS_ADDRESS: '12 Sample Street, Barangay Uno, Sample City, Metro Manila 1000',
      COURTS_CITY: 'Sample City',
    }));
    const { default: F } = await import('./Footer');
    const { default: C } = await import('../pages/Contact');
    const { TERMS_OF_SERVICE, PRIVACY_POLICY, REFUND_POLICY: R, runsText } = await import('../lib/legalPages');
    await page(createElement('div', null, createElement(F), createElement(C)));
    expect(text(q('footer-who-sells'))).toContain('12 Sample Street, Barangay Uno, Sample City, Metro Manila 1000');
    expect(text(q('contact-business'))).toContain('12 Sample Street, Barangay Uno, Sample City, Metro Manila 1000');
    const all = (d: typeof R) => d.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'paragraph' ? [runsText(b.runs)] : b.items.map(runsText)))).join(' ');
    for (const d of [TERMS_OF_SERVICE, PRIVACY_POLICY, R]) {
      expect(all(d)).toContain('a business registered in the Philippines, at 12 Sample Street, Barangay Uno, Sample City, Metro Manila 1000.');
    }
    expect(all(TERMS_OF_SERVICE)).toContain('the case goes to the proper courts of Sample City.');
    vi.doUnmock('../lib/business');
  });
});
