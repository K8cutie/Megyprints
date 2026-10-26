// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   THE TESTER CODE IN THE PRICING TAB (owner, 2026-10-26: the code and its
   on/off in the Pricing tab; "the code to make the album free is the way to
   go"). It shows what is live now, and Save sends exactly what is picked.
   ═══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  settings: { code: 'MEGYTEST', on: true } as { code: string; on: boolean } | null,
  saves: [] as unknown[],
  saveAnswer: null as string | null,
}));
vi.mock('../../lib/testerCode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/testerCode')>()),
  loadTesterSettings: async () => h.settings,
  saveTesterSettings: async (s: unknown) => { h.saves.push(s); return h.saveAnswer; },
}));

import TesterCodeSettings from './TesterCodeSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  h.settings = { code: 'MEGYTEST', on: true }; h.saves = []; h.saveAnswer = null;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
const open = async () => { await act(async () => { root.render(createElement(TesterCodeSettings)); }); await settle(); };
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); await settle(); };
const typeCode = async (v: string) => {
  const input = $('tester-code-value') as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('the tester code settings', () => {
  it('show what is live: MEGYTEST, on, and that it makes the album free', async () => {
    await open();
    expect($('tester-code-status')?.textContent).toBe('On now');
    expect(($('tester-code-value') as HTMLInputElement).value).toBe('MEGYTEST');
    expect($('tester-on')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('the album becomes free: no payment step, and the order arrives already Paid');
    expect(host.textContent).not.toContain('₱1');
  });

  it('a new code, Save: sends exactly that and says what testers get', async () => {
    await open();
    await typeCode('trial2026');
    await click('tester-code-save');
    expect(h.saves).toEqual([{ code: 'TRIAL2026', on: true }]);
    expect($('tester-code-saved')?.textContent).toBe('✓ Saved. Testers who type TRIAL2026 get the album free.');
    expect($('tester-code-status')?.textContent).toBe('On now');
  });

  it('Off, Save: everyone pays the normal price', async () => {
    await open();
    await click('tester-off');
    await click('tester-code-save');
    expect(h.saves).toEqual([{ code: 'MEGYTEST', on: false }]);
    expect($('tester-code-saved')?.textContent).toBe('✓ Saved. The tester code is off: everyone pays the normal price.');
    expect($('tester-code-status')?.textContent).toBe('Off now');
  });

  it('a code the database would refuse is stopped here, with why', async () => {
    await open();
    await typeCode('AB');
    await click('tester-code-save');
    expect(h.saves).toEqual([]);
    expect($('tester-code-settings-error')?.textContent).toBe('The code must be 4 to 24 letters or numbers, no spaces.');
  });

  it("a save that didn't go through says so, and what's live stays shown", async () => {
    h.saveAnswer = 'Not saved: only the owner can change the tester code.';
    await open();
    await click('tester-off');
    await click('tester-code-save');
    expect($('tester-code-settings-error')?.textContent).toBe('Not saved: only the owner can change the tester code.');
    expect($('tester-code-status')?.textContent).toBe('On now');
  });

  it("settings that can't load say so, with nothing to save", async () => {
    h.settings = null;
    await open();
    expect($('tester-code-settings-error')?.textContent).toBe("Couldn't load the tester code. Reload the page.");
    expect($('tester-code-save')).toBeNull();
  });
});
