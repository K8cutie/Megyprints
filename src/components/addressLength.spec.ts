// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   A LONG STREET IS SAID, NEVER CUT (1-star testers, 2026-10-04, the
   Rule-Breaker): the street field stopped at 120 characters (maxlength), so a
   pasted address lost its end — the unit — without a word, and the order
   went through with the cut address. Now nothing is cut: past 100 the field
   shows a count, and past 120 it says by how much and the order waits.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../lib/psgc', () => ({ loadRegions: async () => [], loadAllProvinces: async () => [], loadCities: async () => [], loadBarangays: async () => [], cityRegion: () => null }));

import { validateAddress, streetLength, STREET_MAX, EMPTY_ADDRESS, type AddressValue } from '../lib/contact';
import AddressPicker from './AddressPicker';

const LONG = 'A'.repeat(300) + ' 🏠<u>Unit</u>';
const full = (street: string): AddressValue => ({
  ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila',
  cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan', street, zip: '1110',
});

describe('validateAddress: too long is said, with the count', () => {
  it("the tester's paste: 313 of 120 — the order waits", () => {
    expect(streetLength(LONG)).toBe(313); // the emoji is one character, as the database counts it
    expect(validateAddress(full(LONG)).street).toBe('Too long: 313 of 120 characters. Shorten it so nothing gets cut.');
  });
  it('120 exactly is fine; 121 is not', () => {
    expect(validateAddress(full('B'.repeat(STREET_MAX))).street).toBeUndefined();
    expect(validateAddress(full('B'.repeat(STREET_MAX + 1))).street).toMatch(/^Too long: 121 of 120/);
  });
});

describe('the street field keeps everything typed or pasted', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); });
  const render = async (street: string) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(createElement(AddressPicker, { value: full(street), onChange: () => {} })); });
    return {
      input: host.querySelector<HTMLInputElement>('input[autocomplete="address-line1"]')!,
      count: host.querySelector('[data-testid="street-count"]'),
    };
  };
  it('no 120 cut-off on the field, and the count shows how far over', async () => {
    const { input, count } = await render(LONG);
    expect(input.hasAttribute('maxlength')).toBe(false); // a paste is never cut
    expect(input.value).toBe(LONG);
    expect(count?.textContent).toBe('313/120');
  });
  it('a normal street shows no count', async () => {
    const { count } = await render('12 Rizal St., Purok 2');
    expect(count).toBeNull();
  });
});
