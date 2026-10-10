// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   ONLY REAL WAYS TO REACH US (1-star testers, 2026-10-04): on the thank-you
   page, just after sending ₱1,816, the footer said "123 Main St, City" and
   "(555) 123-4567" — template placeholders — and "© 2025". The email's domain
   (megyprints.com) doesn't exist, the social icons went nowhere, Subscribe did
   nothing, and the Contact page repeated it all and promised cash on delivery
   (checkout takes bank transfer only). And the home page still said "Upload
   20 or more" photos: an album needs 40.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) }, supabaseConfigured: true }));
vi.mock('../lib/report', () => ({ reportError: () => {} }));

import Footer from './Footer';
import Contact from '../pages/Contact';
import { MIN_ALBUM_PHOTOS } from '../pages/builder/albumMinimum';

const FAKE = /123 Main|\(555\)|555-|@megyprints\.com|cash on delivery/i;

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); });
const render = async (el: ReturnType<typeof createElement>) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(createElement(MemoryRouter, null, el)); });
  return host;
};

describe('the footer', () => {
  it('no placeholder address, phone or dead email; no link or button that goes nowhere', async () => {
    const h = await render(createElement(Footer));
    expect(h.textContent).not.toMatch(FAKE);
    expect(h.querySelectorAll('a[href="#"]').length).toBe(0);
    expect([...h.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Subscribe');
  });
  it('the real ways: a message, and your order', async () => {
    const h = await render(createElement(Footer));
    const links = [...h.querySelectorAll('[data-testid="footer-contact"] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['Send us a message', '/contact'], ['Check on your order', '/orders']]);
    expect(h.textContent).toContain(`© ${new Date().getFullYear()} Megy Prints`);
  });
});

describe('the Contact page', () => {
  it('no placeholder phone, street, dead email or cash on delivery — including the FAQ', async () => {
    const h = await render(createElement(Contact));
    // Open every FAQ so its answer is on the page.
    for (const b of [...h.querySelectorAll('button')].filter((x) => x.textContent?.includes('?'))) await act(async () => { b.click(); });
    expect(h.textContent).not.toMatch(FAKE);
    expect(h.textContent).toMatch(/InstaPay QR/);
    expect([...h.querySelectorAll('[data-testid="contact-ways"] a')].map((a) => a.getAttribute('href'))).toEqual(['/orders']);
  });
});

describe('the photo count the pages promise is the gate', () => {
  it(`"${MIN_ALBUM_PHOTOS} or more", from the one constant (source guard)`, () => {
    // Home's and the editor demo's words live in homeCopy.ts (2026-10-09).
    for (const f of ['../pages/homeCopy.ts', './WizardGuide.tsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8');
      expect(src, f).toMatch(/\$\{MIN_ALBUM_PHOTOS\} or more/);
    }
    for (const f of ['../pages/homeCopy.ts', '../pages/Home.tsx', './WizardGuide.tsx', '../pages/BuilderDemoSection.tsx']) {
      expect(readFileSync(resolve(__dirname, f), 'utf8'), f).not.toMatch(/20 or more/);
    }
  });
});
