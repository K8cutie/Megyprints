import { describe, it, expect } from 'vitest';
import {
  normalizePHPhone, isValidFullName, normalizeFullName,
  isValidZip, validateAddress, composeAddress, EMPTY_ADDRESS, type AddressValue,
} from './contact';

// Shipping normalization is load-bearing: createOrderFromLatestAlbum stores what
// these return, so a regression writes un-routable addresses / un-callable phones
// onto real orders.

describe('normalizePHPhone', () => {
  it('canonicalizes every way a PH mobile is typed to +639XXXXXXXXX', () => {
    const good = [
      '09171234567', '+63 917 123 4567', '63917 123 4567', '9171234567',
      '(0917) 123-4567', '0917-123-4567', '+639171234567',
    ];
    for (const raw of good) expect(normalizePHPhone(raw), raw).toBe('+639171234567');
  });

  it('rejects anything that cannot be a PH mobile', () => {
    const bad = ['12345', '0917123456' /* 9 digits */, '081712345678' /* not 9-prefixed */, '', 'abcdefghij', '+1 415 555 0100'];
    for (const raw of bad) expect(normalizePHPhone(raw), raw).toBeNull();
  });
});

describe('isValidFullName', () => {
  it('accepts real names and normalizes whitespace', () => {
    expect(isValidFullName('Juana Dela Cruz')).toBe(true);
    expect(normalizeFullName('  Juan   Dela  Cruz ')).toBe('Juan Dela Cruz');
    expect(isValidFullName('Jo')).toBe(true);
    expect(isValidFullName('李雷')).toBe(true); // any script
  });
  it('rejects too-short, blank, or letter-less input', () => {
    expect(isValidFullName('A')).toBe(false);
    expect(isValidFullName('   ')).toBe(false);
    expect(isValidFullName('12345')).toBe(false);
    expect(isValidFullName('x'.repeat(81))).toBe(false);
  });
});

describe('isValidZip', () => {
  it('requires exactly 4 digits', () => {
    expect(isValidZip('1234')).toBe(true);
    expect(isValidZip('123')).toBe(false);
    expect(isValidZip('12a4')).toBe(false);
    expect(isValidZip('12345')).toBe(false);
  });
});

describe('validateAddress / composeAddress', () => {
  const full: AddressValue = {
    ...EMPTY_ADDRESS,
    provinceCode: 'PH-00', provinceName: 'Metro Manila',
    cityCode: 'C1', cityName: 'Pateros',
    barangayCode: 'B1', barangayName: 'San Roque',
    street: '12 Rizal St', zip: '1620',
  };

  it('passes a complete address and flags missing parts', () => {
    expect(validateAddress(full)).toEqual({});
    const missing = validateAddress({ ...EMPTY_ADDRESS, street: 'x', zip: '1' });
    expect(missing.provinceCode).toBeDefined();
    expect(missing.cityCode).toBeDefined();
    expect(missing.barangayCode).toBeDefined();
    expect(missing.street).toBeDefined();
    expect(missing.zip).toBeDefined();
  });

  it('composes the canonical single line (street → barangay → city → province ZIP)', () => {
    expect(composeAddress(full)).toBe('12 Rizal St, Brgy. San Roque, Pateros, Metro Manila 1620');
  });
});
