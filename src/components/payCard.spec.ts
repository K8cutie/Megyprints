// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import PayCard from './PayCard';

/* ══════════════════════════════════════════════════════════════════════════
   THE PAY CARD (owner's checkout design, 2026-10-31: "an idea for the
   checkout it looks good"). The payment step after Place order:
   - a ✓ badge above "Send ₱…": the order went through;
   - the bank strip (GoTyme Bank · InstaPay · QR Ph), the name and the last 4
     digits as dots, and the QR, full size on a phone;
   - the order number with Copy, for the transfer note ("Copied" after; a
     phone that won't copy says to type it);
   - numbered steps with icons, and how to pay with THIS phone: it can't scan
     its own screen, so screenshot the QR, then Upload QR in the bank app.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const card = async (orderNumber: string | null = 'MP-2026-GJDK7MT') => {
  await act(async () => { root.render(createElement(PayCard, { amountLabel: '₱890', orderNumber })); });
};
const stubClipboard = (writeText: (t: string) => Promise<void>) =>
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

describe('who to pay, and the QR', () => {
  it('the bank strip, the name, the last 4 digits as dots, and the QR', async () => {
    await card();
    expect(text(q('pay-bank'))).toBe('GoTyme Bank · InstaPay · QR Ph');
    expect(text(q('pay-name'))).toBe('ARCHIE GARCIA');
    expect(text(q('pay-account'))).toBe('•••••• Account ending in 2370');
    const qr = q('pay-qr') as HTMLImageElement;
    expect(qr.getAttribute('src')).toBe('/pay/gotyme-instapay.png');
    // Full size on a phone; smaller only beside the name on a wider screen.
    expect(qr.className).toContain('h-56 w-56');
    expect(qr.className).toContain('sm:h-44 sm:w-44');
    expect(text(q('pay-card'))).toContain("Your app may charge a small InstaPay fee. We don't add any.");
  });

  it('a QR that fails to load says what to do instead', async () => {
    await card();
    await act(async () => { q('pay-qr')!.dispatchEvent(new Event('error')); });
    expect(q('pay-qr')).toBeNull();
    expect(text(q('pay-card'))).toContain("The QR code isn't available right now — message us and we'll send the account details.");
  });
});

describe('Copy: the order number for the transfer note', () => {
  it('one tap copies it, and the button says Copied', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    await card();
    const button = q('pay-copy-order')!;
    expect(text(button)).toBe('MP-2026-GJDK7MT Copy');
    expect(button.getAttribute('aria-label')).toBe('Copy order number MP-2026-GJDK7MT');
    await act(async () => { button.click(); });
    expect(writeText).toHaveBeenCalledWith('MP-2026-GJDK7MT');
    expect(text(q('pay-copy-label'))).toBe('Copied');
    expect(q('pay-copy-failed')).toBeNull();
  });

  it('a phone that will not copy says to type it in the note', async () => {
    stubClipboard(async () => { throw new Error('denied'); });
    // jsdom has no execCommand: the old way is missing too.
    await card();
    await act(async () => { q('pay-copy-order')!.click(); });
    expect(text(q('pay-copy-label'))).toBe('Copy');
    expect(text(q('pay-copy-failed'))).toBe("This phone didn't let us copy it. Type MP-2026-GJDK7MT in the note instead.");
  });

  it('no order number yet: no Copy, and step 3 asks for no note', async () => {
    await card(null);
    expect(q('pay-copy-order')).toBeNull();
    const steps = [...host.querySelectorAll('[data-testid="pay-step"]')].map(text);
    expect(steps[2]).toBe('3Send exactly ₱890');
  });
});

describe('the steps', () => {
  it('four numbered steps, the amount, the order number, and paying with this phone', async () => {
    await card();
    const steps = [...host.querySelectorAll('[data-testid="pay-step"]')].map(text);
    expect(steps).toEqual([
      '1Open your bank or e-wallet appGCash, Maya, BPI, BDO, UnionBank…',
      '2Choose Scan QR / InstaPayand scan the code above.Paying with this phone? Take a screenshot of the QR, then choose Upload QR in your bank app.',
      '3Send exactly ₱890and paste MP-2026-GJDK7MT in the note if your app asks.',
      '4Attach your receipt belowIt speeds up confirmation.',
    ]);
  });
});

describe('checkout shows it', () => {
  const order = readFileSync('src/pages/Order.tsx', 'utf8');
  const pay = order.slice(order.indexOf("if (step === 'payment')"), order.indexOf('/* ══════════════ FORM'));
  it('the ✓ badge above "Send ₱…", then the pay card with this order', () => {
    expect(pay.indexOf('data-testid="pay-placed-badge"')).toBeGreaterThan(0);
    expect(pay.indexOf('data-testid="pay-placed-badge"')).toBeLessThan(pay.indexOf('Send {amountLabel}'));
    expect(pay).toContain('<PayCard amountLabel={amountLabel} orderNumber={placed?.order_number ?? null} />');
    // The old inline QR and steps are gone (one place draws them).
    expect(pay).not.toContain('PAYEE.qrSrc');
    expect(pay).not.toContain('Open your bank or e-wallet app');
  });
});
