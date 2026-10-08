import { describe, expect, it } from 'vitest';
import { qrModuleMm, yearbookQrData } from './qr';

describe('yearbook QR', () => {
  it('writes the link in capitals so it uses the compact QR mode', () => {
    expect(yearbookQrData('ab2cd3ef', 'https://megyprints.vercel.app')).toBe('HTTPS://MEGYPRINTS.VERCEL.APP/Y/AB2CD3EF');
  });

  it('capitals give a smaller code than the same link in lower case (at the stronger Q level)', () => {
    const upper = qrModuleMm('HTTPS://MEGYPRINTS.VERCEL.APP/Y/AB2CD3EF', 0.5, 'Q');
    const lower = qrModuleMm('https://megyprints.vercel.app/y/ab2cd3ef', 0.5, 'Q');
    expect(upper.modules).toBeLessThan(lower.modules);
  });

  it('documents today\'s square size on a 0.5 in badge (test print decides the floor)', () => {
    const today = qrModuleMm('HTTPS://MEGYPRINTS.VERCEL.APP/Y/AB2CD3EF', 0.5);
    const shortDomain = qrModuleMm('HTTPS://MGY.PH/Y/AB2CD3EF', 0.5);
    expect(today.version).toBeLessThanOrEqual(3);
    expect(today.mm).toBeGreaterThan(0.33);
    expect(shortDomain.mm).toBeGreaterThan(today.mm);
  });
});
