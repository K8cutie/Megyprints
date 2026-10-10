import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  UNPAID_ORDER_DAYS, UNPAID_ORDER_LIMIT, UNPAID_LIMIT_SQLSTATE, UnpaidLimitError, isUnpaidLimitError, PAY_WITHIN_MESSAGE, payByDate,
} from './orderExpiry';

/* ══════════════════════════════════════════════════════════════════════════
   Unpaid orders close by themselves (0042). The database owns the numbers;
   the app only says them. These keep the words true and the phone's video
   copies safe:
     · the 7 days / 3 orders / MP001 on screen are the ones in the migration;
     · checkout never frees the phone's copy of a video at Place order (an
       order that expires unpaid loses its cloud copy, and a reorder uploads
       it again from the phone);
     · the payment screen tells the customer the window.
   ══════════════════════════════════════════════════════════════════════════ */

const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/0042_unpaid_order_expiry.sql'), 'utf8');
const orderPage = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
const endpoint = readFileSync(resolve(__dirname, '../../api/expire-orders.mjs'), 'utf8');

describe('the numbers on screen are the database\'s', () => {
  it('7 days', () => {
    expect(migration).toMatch(new RegExp(`function public\\.unpaid_order_days\\(\\)[\\s\\S]*?select ${UNPAID_ORDER_DAYS} \\$\\$`));
  });
  it('3 unpaid orders', () => {
    expect(migration).toMatch(new RegExp(`function public\\.unpaid_order_limit\\(\\)[\\s\\S]*?select ${UNPAID_ORDER_LIMIT} \\$\\$`));
  });
  it('the refusal code', () => {
    expect(migration).toContain(`errcode = '${UNPAID_LIMIT_SQLSTATE}'`);
  });
  it('the endpoint never passes its own number of days (the database decides)', () => {
    expect(endpoint).toMatch(/rpc\('expire_unpaid_orders'\)/);
  });
});

describe('the 4th unpaid order', () => {
  it('is recognised by its SQLSTATE only', () => {
    expect(isUnpaidLimitError({ code: 'MP001' })).toBe(true);
    expect(isUnpaidLimitError({ code: '42501' })).toBe(false);
    expect(isUnpaidLimitError(null)).toBe(false);
    expect(isUnpaidLimitError(undefined)).toBe(false);
  });
  it('reads as a sentence with the real numbers', () => {
    const msg = new UnpaidLimitError().message;
    expect(msg).toContain(`${UNPAID_ORDER_LIMIT} orders waiting for payment`);
    expect(msg).toContain(`${UNPAID_ORDER_DAYS} days`);
    expect(msg).not.toMatch(/row-level|policy|violates|MP001/i);
  });
  it('checkout offers the way to those orders', () => {
    expect(orderPage).toMatch(/setUnpaidLimit\(err instanceof UnpaidLimitError\)/);
    expect(orderPage).toMatch(/unpaidLimit && \([\s\S]*?navigate\('\/orders'\)[\s\S]*?Open my orders/);
  });
});

describe('the phone keeps its video copies until the order is paid', () => {
  it('checkout never frees a staged clip', () => {
    expect(orderPage).not.toMatch(/removeStagedClip/);
  });
});

describe('checkout order of steps (red-team, 2026-10-09)', () => {
  const place = orderPage.slice(orderPage.indexOf('const placeOrder = async'), orderPage.indexOf('const handlePaymentSent'));
  it('a gone video is found BEFORE the order row exists (no unpaid order left behind)', () => {
    expect(place.indexOf('findMissingClips(clipCodes)')).toBeGreaterThan(0);
    expect(place.indexOf('findMissingClips(clipCodes)')).toBeLessThan(place.indexOf('createOrderFromAlbum('));
  });
  it('the videos are checked again after the print file, before their memory rows', () => {
    const pdf = place.indexOf('await uploadOrderPrintPdf(');
    const again = place.indexOf('const again = await uploadStagedClips(clipCodes)');
    const rows = place.indexOf('ensureMemoriesForFills(');
    expect(pdf).toBeGreaterThan(0);
    expect(again).toBeGreaterThan(pdf);
    expect(rows).toBeGreaterThan(again);
  });
  it('a checkout brought back on an order that has since closed starts a new order (red-team round 2)', () => {
    const check = place.indexOf("current?.status === 'cancelled'");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(place.indexOf('findMissingClips(clipCodes)'));
  });
  it('starting over clears the old payment screen (receipt, reference)', () => {
    const fn = orderPage.slice(orderPage.indexOf('const startOverAfterClosed'), orderPage.indexOf('const missingClipMessage'));
    for (const reset of ['setProofFile(null)', "setPayRef('')", 'clearCheckoutOrder()', 'createdOrderRef.current = null']) expect(fn).toContain(reset);
  });
  it('HD is priced from this album\'s own kept clips, not the phone-wide setting alone', () => {
    // (An event album's memories are part of its deal: never HD, 0045.)
    expect(orderPage).toMatch(/const hdMemories = !eventLink && qrCount > 0 && \(albumTier \?\? currentClipQuality\(\)\) === 'hd'/);
    expect(orderPage).toMatch(/const priceReady = [^\n]*clipTierReady/);
  });
  it('a closed order shows no payment QR (the status is read on the payment step too)', () => {
    expect(orderPage).toMatch(/step !== 'tracking' && step !== 'payment'/);
    const pay = orderPage.slice(orderPage.indexOf("if (step === 'payment')"), orderPage.indexOf('/* ══════════════ FORM'));
    expect(pay.indexOf("placedOrder?.status === 'cancelled'")).toBeGreaterThan(0);
    expect(pay.indexOf("placedOrder?.status === 'cancelled'")).toBeLessThan(pay.indexOf('PAYEE.qrSrc'));
  });
});

describe('Your orders says the last day to pay', () => {
  it('7 days after the order', () => {
    expect(payByDate('2026-10-01T10:00:00+08:00')).toBe(new Date(Date.parse('2026-10-08T10:00:00+08:00')).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }));
  });
  it('an unreadable date says nothing rather than something wrong', () => {
    expect(payByDate('not a date')).toBe('');
  });
});

describe('the payment screen says the window', () => {
  it('the line is on the payment step', () => {
    const pay = orderPage.slice(orderPage.indexOf("if (step === 'payment')"), orderPage.indexOf('/* ══════════════ FORM'));
    expect(pay.length).toBeGreaterThan(100);
    expect(pay).toContain('{PAY_WITHIN_MESSAGE}');
  });
  it('and it is plain', () => {
    expect(PAY_WITHIN_MESSAGE).toBe(`Please pay within ${UNPAID_ORDER_DAYS} days. After that this order closes by itself. Your album stays saved, and you can order it again.`);
  });
});
