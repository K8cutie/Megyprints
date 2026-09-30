import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { parseAuthReturn } = await import('./nativeAuth');

/* The native Google sign-in return. Only OUR two return shapes may carry
   tokens into the app; anything else is ignored. */
describe('parseAuthReturn', () => {
  it('reads the verified App Link (tokens in the #fragment, nonce in the query)', () => {
    const p = parseAuthReturn('https://megyprints.vercel.app/auth-native.html?n=abc#access_token=A&refresh_token=R');
    expect(p?.get('n')).toBe('abc');
    expect(p?.get('access_token')).toBe('A');
    expect(p?.get('refresh_token')).toBe('R');
  });

  it('reads the intent:// fallback (megyprints://auth?…)', () => {
    const p = parseAuthReturn('megyprints://auth?n=abc&access_token=A&refresh_token=R');
    expect(p?.get('access_token')).toBe('A');
    expect(p?.get('n')).toBe('abc');
  });

  it('ignores look-alike hosts, other paths and other schemes', () => {
    expect(parseAuthReturn('https://megyprints.vercel.app.evil.com/auth-native.html#access_token=A')).toBeNull();
    expect(parseAuthReturn('https://megyprints.vercel.app/profile#access_token=A')).toBeNull();
    expect(parseAuthReturn('http://megyprints.vercel.app/auth-native.html#access_token=A')).toBeNull();
    expect(parseAuthReturn('megyprints://other?access_token=A')).toBeNull();
    expect(parseAuthReturn('not a url')).toBeNull();
  });

  it('passes a provider error through (so the app can treat it as cancelled)', () => {
    const p = parseAuthReturn('megyprints://auth?n=abc&error=access_denied');
    expect(p?.get('error')).toBe('access_denied');
    expect(p?.get('access_token')).toBeNull();
  });
});
