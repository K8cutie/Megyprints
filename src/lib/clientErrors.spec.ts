import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
import { deviceOf, whereOf, isMoneyPath } from './clientErrors';

/* The console's Errors tab says, in a few words, which phone and where. */

describe('deviceOf', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.81 Mobile Safari/537.36', 'Android 14 · SM-A546E · Chrome 129'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Android 10 · Chrome 130'],
    ['Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'Android 13 · SM-S911B · Samsung Internet 25'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'iPhone · iOS 18.1 · Safari'],
    ['Mozilla/5.0 (Linux; Android 12; TECNO KG5) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/en_US;FBAV/400.0]', 'Android 12 · TECNO KG5 · Facebook app'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Windows · Edge 130'],
    [null, 'unknown device'],
    ['curl/8.0', 'unknown device'],
  ])('%s', (ua, said) => {
    expect(deviceOf(ua)).toBe(said);
  });
});

describe('whereOf / isMoneyPath', () => {
  it('names the step and the try', () => {
    expect(whereOf({ context: { path: 'checkout', step: 'cover_pdf', attempt: 2, orderId: 'o' } })).toBe('checkout · cover_pdf · try 2');
    expect(whereOf({ context: { kind: 'unhandledrejection' } })).toBe('unhandledrejection');
    expect(whereOf({ context: null })).toBe('app');
  });
  it('checkout and Your orders come first', () => {
    expect(isMoneyPath({ context: { path: 'checkout' } })).toBe(true);
    expect(isMoneyPath({ context: { path: 'your_orders' } })).toBe(true);
    expect(isMoneyPath({ context: { kind: 'error' } })).toBe(false);
  });
});
