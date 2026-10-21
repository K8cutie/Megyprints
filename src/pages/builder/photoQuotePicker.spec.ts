// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   "Write a line for this photo" in the quote picker (owner, 2026-10-21:
   Haiku, the customer picks from 3). A signed-out tap is answered with the
   sign-in step — never a greyed button — and carries on by itself after it;
   a signed-in tap shows 3 lines written for the photo; tapping one puts it in
   the box. Every way it can end has words, and the theme lines stay.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  openLogin: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: h.openLogin }) }));
vi.mock('../../lib/photoQuotes', () => ({ writeLinesForPhotos: (...a: unknown[]) => h.write(...a) }));
vi.mock('../../lib/quotes', () => ({
  fetchThemeQuotes: async () => ({ quotes: ['A line for the trip'], source: 'curated' }),
  moreThemeQuotes: async () => ({ quotes: ['A line for the trip'], source: 'curated' }),
  curatedQuotesFor: () => ['A line for the trip'],
  MAX_QUOTE_CHARS: 46,
}));

import QuotePickerModal, { PHOTO_QUOTE_MESSAGES } from './QuotePickerModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const onPick = vi.fn();
const onClose = vi.fn();
const show = (photoUrls: string[] = ['blob:x/0']) => act(() => root.render(createElement(QuotePickerModal, { photoUrls, onPick, onClose, mobile: true })));
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const tap = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); await act(async () => { await Promise.resolve(); }); };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  h.user = null; h.openLogin.mockReset(); h.write.mockReset(); onPick.mockReset(); onClose.mockReset();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('the button', () => {
  it('a page with no photos: no button (nothing to look at)', async () => {
    show([]);
    await settle();
    expect($('photo-quote')).toBeNull();
  });
  it('says this photo / these photos, in words, and that the copy is not kept', async () => {
    show(['blob:x/0']);
    await settle();
    expect($('photo-quote-write')!.textContent!.trim()).toBe('Write a line for this photo');
    expect($('photo-quote')!.textContent).toContain('We don’t keep it.');
    show(['blob:x/0', 'blob:x/1']);
    expect($('photo-quote-write')!.textContent!.trim()).toBe('Write a line for these photos');
    expect($('photo-quote-write')!.hasAttribute('disabled')).toBe(false); // never a greyed, dead tap
  });
});

describe('signed out', () => {
  it('the tap asks to sign in and sends nothing; "Sign in" opens sign-in; once in, it carries on by itself', async () => {
    show();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect(h.write).not.toHaveBeenCalled();
    await tap($('photo-quote-sign-in')!.querySelector('button'));
    expect(h.openLogin).toHaveBeenCalledTimes(1);

    h.user = { id: 'u1' };
    h.write.mockResolvedValue({ lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'] });
    show();
    await settle();
    expect(h.write).toHaveBeenCalledTimes(1);
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['Making each other laugh', 'Riding the train together', 'A castle at night']);
  });
});

describe('signed in', () => {
  beforeEach(() => { h.user = { id: 'u1' }; });
  it('a page of several photos: all of them go, and the lines say they are for these photos', async () => {
    h.write.mockResolvedValue({ lines: ['A happy start to a big day', 'Arriving with big smiles', 'A fun day out in Hong Kong'] });
    show(['blob:x/0', 'blob:x/1', 'blob:x/2']);
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][0]).toEqual(['blob:x/0', 'blob:x/1', 'blob:x/2']);
    expect($('photo-quote-heading')!.textContent).toBe('Written for these photos'); // walk 2026-10-21: it said "this photos"
  });
  it('3 lines written for the photo; tapping one puts it in the box', async () => {
    h.write.mockResolvedValue({ lines: ['Making each other laugh', 'Riding the train together', 'A castle at night'] });
    show(['blob:x/0']);
    await settle();
    await tap($('photo-quote-write'));
    expect(h.write.mock.calls[0][0]).toEqual(['blob:x/0']);
    expect($('photo-quote-heading')!.textContent).toBe('Written for this photo');
    const lines = $$('photo-quote-line');
    expect(lines).toHaveLength(3);
    await tap(lines[1]);
    expect(onPick).toHaveBeenCalledWith('Riding the train together');
    expect(onClose).toHaveBeenCalled();
  });
  it('"Write 3 more" sends the lines already shown so they are not repeated', async () => {
    h.write.mockResolvedValueOnce({ lines: ['One', 'Two', 'Three'] }).mockResolvedValueOnce({ lines: ['Four', 'Five', 'Six'] });
    show();
    await settle();
    await tap($('photo-quote-write'));
    await tap($('photo-quote-more'));
    expect(h.write.mock.calls[1][2]).toEqual(['One', 'Two', 'Three']);
    expect($$('photo-quote-line').map((b) => b.textContent)).toEqual(['Four', 'Five', 'Six']);
  });
  it('every way it can end has words, and the theme lines stay to pick from', async () => {
    for (const error of ['limit_user', 'limit_all', 'refused', 'failed'] as const) {
      h.write.mockResolvedValueOnce({ error });
      show();
      await settle();
      await tap($('photo-quote-write'));
      expect($('photo-quote-note')!.textContent).toBe(PHOTO_QUOTE_MESSAGES[error]);
      expect(host.textContent).toContain('A line for the trip');
      act(() => root.unmount());
      root = createRoot(host);
    }
  });
  it('a session that ran out on the server asks to sign in again', async () => {
    h.write.mockResolvedValue({ error: 'sign_in' });
    show();
    await settle();
    await tap($('photo-quote-write'));
    expect($('photo-quote-sign-in')).not.toBeNull();
    expect(h.write).toHaveBeenCalledTimes(1); // and does not loop
  });
});

describe('wired in all four places the picker opens', () => {
  it('BuilderEdit (desktop) and MobileReview (phone) pass the page photos to both pickers', () => {
    for (const f of ['BuilderEdit.tsx', 'MobileReview.tsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8');
      expect(src.match(/photoUrls=\{pagePhotoUrls\(/g)).toHaveLength(2);
    }
  });
});
