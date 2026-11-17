// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Terms from '../pages/Terms';

/* ══════════════════════════════════════════════════════════════════════════
   PHOTO RIGHTS IN THE TERMS (owner, 2026-11-13: "If a user takes pictures as
   a fan of Taylor Swift and creates an album, what's our protection?"). The
   terms already said "only photos you took or may use" and "we won't print
   other people's artwork". They now also say: we don't check every photo;
   your own concert photos are fine, official photos and artwork are not;
   albums are for personal use, not resale or promotion; how a rights owner
   reports an album; the customer covers claims from what they added; and
   what we owe is capped at the order, without taking consumer-law rights.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const text = (id: string) =>
  (document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the Terms protect the shop when a customer adds photos of a famous person', () => {
  beforeEach(async () => {
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Terms))); });
  });

  it('says we do not check every photo and the customer is responsible', () => {
    expect(text('terms-no-screening')).toMatch(/don't check every photo/);
    expect(text('terms-no-screening')).toMatch(/You are responsible/);
  });

  it('allows your own concert photos but not official photos or artwork', () => {
    expect(text('terms-celebrities')).toMatch(/took yourself of a famous person/);
    expect(text('terms-celebrities')).toMatch(/Official photos, album covers, logos and artwork/);
  });

  it('keeps albums for personal use, not resale or promotion', () => {
    expect(text('terms-personal-use')).toMatch(/Don't sell them or use them to promote/);
  });

  it('gives a rights owner a way to report an album, and lets us stop the order', () => {
    expect(text('terms-complaints')).toMatch(/@/);
    expect(text('terms-complaints')).toMatch(/stop or cancel the order/);
  });

  it('has the customer cover claims from what they added', () => {
    expect(text('terms-indemnity')).toMatch(/cover our costs from that claim, including legal costs/);
  });

  it('caps what we owe at the order, without taking consumer-law rights', () => {
    expect(text('terms-liability')).toMatch(/what you paid for that order/);
    expect(text('terms-liability')).toMatch(/Philippine consumer law/);
  });
});
