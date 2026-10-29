import { orderTime, parseExifDateTime } from '../src/lib/photoTime';

describe('when a photo was taken (EXIF)', () => {
  it('reads an EXIF time as the phone\'s local time, like the website\'s EXIF reader', () => {
    expect(parseExifDateTime('2026:10:26 14:03:12')).toBe(new Date(2026, 9, 26, 14, 3, 12).getTime());
  });

  it('uses the EXIF time zone when there is one', () => {
    expect(parseExifDateTime('2026:10:26 14:03:12', '+08:00')).toBe(Date.UTC(2026, 9, 26, 6, 3, 12));
    expect(parseExifDateTime('2026:10:26 14:03:12', '-05:30')).toBe(Date.UTC(2026, 9, 26, 19, 33, 12));
  });

  it('refuses blank, zeroed and impossible dates', () => {
    expect(parseExifDateTime(null)).toBeNull();
    expect(parseExifDateTime('')).toBeNull();
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDateTime('2026:02:31 10:00:00')).toBeNull();
    expect(parseExifDateTime('2026:13:01 10:00:00')).toBeNull();
    expect(parseExifDateTime('2026:10:26 25:00:00')).toBeNull();
    expect(parseExifDateTime('yesterday')).toBeNull();
  });

  it('sorts by taken time, else the file\'s time, else not at all', () => {
    expect(orderTime({ capturedAt: 5, modifiedAt: 9 })).toBe(5);
    expect(orderTime({ capturedAt: null, modifiedAt: 9 })).toBe(9);
    expect(orderTime({ capturedAt: null, modifiedAt: null })).toBeNull();
  });
});
