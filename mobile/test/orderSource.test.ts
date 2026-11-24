/* ══════════════════════════════════════════════════════════════════════════
   WHICH POST AN ORDER CAME FROM, IN THE APP (src/lib/orderSource.ts: the
   rules; src/lib/installSource.ts: the phone's part).

   A post's Play Store link carries a tag in its "referrer"
   (…&referrer=utm_source%3Dfacebook%26utm_campaign%3Dxmas-01). Google Play
   gives that text to the installed app, the app keeps the tag for 30 days
   from the install, and an order placed in that time carries it.

   The rule these tests hold it to: the tag is a note, and it never gets in
   anyone's way. Play is asked once; a phone that can't ask Play, an install
   from no link, an old tag and junk on the phone all end the same, with no
   tag and nothing thrown. (The order row itself: sendOrder.test.ts.)
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureInstallSource, SOURCE_ASKED_KEY, SOURCE_KEY, storedOrderSource, type InstallFacts } from '../src/lib/installSource';
import { isMissingSourceColumn, normalizeSource, SOURCE_PATTERN, SOURCE_WINDOW_DAYS, sourceFromReferrer } from '../src/lib/orderSource';

const mockStore = new Map<string, string>();
let mockStorageBroken = false;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => { if (mockStorageBroken) throw new Error('storage is full'); return mockStore.get(k) ?? null; }),
  setItem: jest.fn(async (k: string, v: string) => { if (mockStorageBroken) throw new Error('storage is full'); mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 18);
const kept = () => JSON.parse(mockStore.get(SOURCE_KEY) ?? 'null') as { tag: string; at: number } | null;
const play = (referrer: string | null, installedAt: number | null = NOW - 60_000) => {
  const ask = jest.fn(async (): Promise<InstallFacts> => ({ referrer, installedAt }));
  return ask;
};

beforeEach(() => { mockStore.clear(); mockStorageBroken = false; });

describe('what counts as a tag', () => {
  it('lower-case letters, digits and hyphens, tidied the way the database tidies it', () => {
    expect(normalizeSource('xmas-01')).toBe('xmas-01');
    expect(normalizeSource('  XMAS-01 ')).toBe('xmas-01');
  });
  it('anything else is no tag', () => {
    for (const bad of ['', '   ', '-xmas', 'xmas 01', 'xmas_01', 'x'.repeat(41), "x'; drop table orders;--", '(not set)', null, undefined]) {
      expect(normalizeSource(bad)).toBeNull();
    }
    expect(SOURCE_PATTERN.test('a')).toBe(true);
  });
});

describe("reading the tag from Google Play's referrer text", () => {
  it('a tagged link: its utm_campaign', () => {
    expect(sourceFromReferrer('utm_source=facebook&utm_medium=social&utm_campaign=xmas-01')).toBe('xmas-01');
    expect(sourceFromReferrer('utm_campaign=Xmas-01&utm_source=facebook')).toBe('xmas-01');
  });
  it('still URL text (Play sometimes hands it over undecoded)', () => {
    expect(sourceFromReferrer('utm_source%3Dfacebook%26utm_campaign%3Dxmas-01')).toBeNull();
    expect(sourceFromReferrer('utm_source=facebook&utm_campaign=xmas%2D01')).toBe('xmas-01');
  });
  it('an install from no tagged link, or text that is not a campaign', () => {
    expect(sourceFromReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(sourceFromReferrer('utm_source=google&utm_campaign=(not%20set)')).toBeNull();
    expect(sourceFromReferrer('gclid=abc123')).toBeNull();
    expect(sourceFromReferrer('utm_campaign=')).toBeNull();
    expect(sourceFromReferrer('%E0%A4%A&utm_campaign=xmas-01')).toBe('xmas-01');
    expect(sourceFromReferrer('')).toBeNull();
    expect(sourceFromReferrer(null)).toBeNull();
  });
});

describe('asking Google Play when the app opens', () => {
  it('keeps the tag, counted from the install', async () => {
    const installedAt = NOW - 2 * DAY;
    const ask = play('utm_source=facebook&utm_campaign=xmas-01', installedAt);
    await expect(captureInstallSource(ask, NOW)).resolves.toBe('xmas-01');
    expect(kept()).toEqual({ tag: 'xmas-01', at: installedAt });
  });

  it('asks once per install', async () => {
    const ask = play('utm_source=facebook&utm_campaign=xmas-01');
    await captureInstallSource(ask, NOW);
    await captureInstallSource(ask, NOW + DAY);
    await captureInstallSource(ask, NOW + 2 * DAY);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(kept()?.tag).toBe('xmas-01');
  });

  it('an install from no tagged link keeps nothing, and is not asked again', async () => {
    const ask = play('utm_source=google-play&utm_medium=organic');
    await expect(captureInstallSource(ask, NOW)).resolves.toBeNull();
    await captureInstallSource(ask, NOW + DAY);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mockStore.has(SOURCE_KEY)).toBe(false);
    expect(mockStore.has(SOURCE_ASKED_KEY)).toBe(true);
  });

  it("a phone that can't ask Play: nothing kept, nothing thrown, asked again next time", async () => {
    const down = jest.fn(async (): Promise<InstallFacts> => { throw new Error('SERVICE_UNAVAILABLE'); });
    await expect(captureInstallSource(down, NOW)).resolves.toBeNull();
    expect(mockStore.size).toBe(0);
    const ask = play('utm_source=facebook&utm_campaign=xmas-01');
    await expect(captureInstallSource(ask, NOW + DAY)).resolves.toBe('xmas-01');
  });

  it('the install time unknown, or in the future: counted from today', async () => {
    await captureInstallSource(play('utm_campaign=xmas-01', null), NOW);
    expect(kept()).toEqual({ tag: 'xmas-01', at: NOW });
    mockStore.clear();
    await captureInstallSource(play('utm_campaign=xmas-01', NOW + DAY), NOW);
    expect(kept()).toEqual({ tag: 'xmas-01', at: NOW });
  });

  it("the phone's storage failing is not the customer's problem", async () => {
    mockStorageBroken = true;
    await expect(captureInstallSource(play('utm_campaign=xmas-01'), NOW)).resolves.toBeNull();
    await expect(storedOrderSource(NOW)).resolves.toBeNull();
  });

  it('on anything but Android, Play is not asked and nothing is kept', async () => {
    // jest's React Native is an iPhone: the app's own asker answers "no link".
    await expect(captureInstallSource(undefined, NOW)).resolves.toBeNull();
    expect(mockStore.has(SOURCE_KEY)).toBe(false);
  });
});

describe('how long a tag counts', () => {
  it(`for ${SOURCE_WINDOW_DAYS} days from the install`, async () => {
    mockStore.set(SOURCE_KEY, JSON.stringify({ tag: 'xmas-01', at: 0 }));
    await expect(storedOrderSource(SOURCE_WINDOW_DAYS * DAY)).resolves.toBe('xmas-01');
  });
  it('after that it is forgotten', async () => {
    mockStore.set(SOURCE_KEY, JSON.stringify({ tag: 'xmas-01', at: 0 }));
    await expect(storedOrderSource(SOURCE_WINDOW_DAYS * DAY + 1)).resolves.toBeNull();
    expect(mockStore.has(SOURCE_KEY)).toBe(false);
  });
  it('an app installed long ago from a tagged link, then updated: not credited to the old post', async () => {
    await captureInstallSource(play('utm_campaign=xmas-01', NOW - 45 * DAY), NOW);
    await expect(storedOrderSource(NOW)).resolves.toBeNull();
  });
  it('something else in its place is no tag', async () => {
    for (const junk of ['not json', '{}', '{"tag":"BAD TAG","at":1}', '{"tag":"ok","at":"soon"}', 'null']) {
      mockStore.set(SOURCE_KEY, junk);
      await expect(storedOrderSource(1)).resolves.toBeNull();
    }
    expect(jest.mocked(AsyncStorage.getItem)).toHaveBeenCalled();
  });
});

describe('telling a missing column from any other refusal', () => {
  it('the two ways the database says it', () => {
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'source' column of 'orders' in the schema cache" })).toBe(true);
    expect(isMissingSourceColumn({ code: '42703', message: 'column "source" of relation "orders" does not exist' })).toBe(true);
  });
  it('another column, another error, or none', () => {
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'tester_code' column of 'orders' in the schema cache" })).toBe(false);
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'resource' column" })).toBe(false);
    expect(isMissingSourceColumn({ code: '23514', message: 'source' })).toBe(false);
    expect(isMissingSourceColumn(null)).toBe(false);
  });
});
