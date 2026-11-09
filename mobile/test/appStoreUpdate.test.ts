/* ══════════════════════════════════════════════════════════════════════════
   A NEW VERSION ON THE APP STORE (iPhone: lib/appStoreUpdate.ts). The App
   Store installs updates itself, so the app only says a newer one is there:
   "A new version of Megy Prints is ready." — Update in App Store / Later,
   with Android's rules (appUpdate.ts): on screen only, one box at a time,
   never while an order is sent, Later waits 4 hours.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlertButton } from 'react-native';
import {
  createAppStorePrompt, isNewerVersion, LATER, LATER_WAIT_MS, LOOKUP_EVERY_MS, lookUpStoreVersion,
  UPDATE_IN_STORE, type StorePromptDeps, type StoreVersion,
} from '../src/lib/appStoreUpdate';
import { UPDATE_READY } from '../src/lib/appUpdate';

const STORE: StoreVersion = { version: '2.1.0', url: 'https://apps.apple.com/ph/app/megy-prints/id1' };

function setup(o: { store?: StoreVersion | null; current?: string; sending?: boolean } = {}) {
  const shown: { message: string | undefined; buttons: AlertButton[]; dismiss?: () => void }[] = [];
  const opened: string[] = [];
  let clock = 1_000_000;
  let lookups = 0;
  const d: StorePromptDeps = {
    current: o.current ?? '2.0.9',
    lookUp: async () => { lookups++; return o.store === undefined ? STORE : o.store; },
    sending: () => o.sending ?? false,
    now: () => clock,
    ask: (_t, message, buttons, options) => { shown.push({ message, buttons, dismiss: options.onDismiss }); },
    open: (url) => { opened.push(url); },
  };
  return { prompt: createAppStorePrompt(d), shown, opened, tick: (ms: number) => { clock += ms; }, lookups: () => lookups };
}
const press = (b: AlertButton[], text: string) => b.find((x) => x.text === text)!.onPress!();

describe('which version is newer', () => {
  it('compares number by number', () => {
    expect(isNewerVersion('2.0.10', '2.0.9')).toBe(true);
    expect(isNewerVersion('2.1', '2.0.9')).toBe(true);
    expect(isNewerVersion('2.0.9', '2.0.9')).toBe(false);
    expect(isNewerVersion('2.0.8', '2.0.9')).toBe(false);
    expect(isNewerVersion('3', '2.9.9')).toBe(true);
  });
});

describe('the box', () => {
  it('a newer version: the line, with Update in App Store and Later', async () => {
    const t = setup();
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0].message).toBe(UPDATE_READY);
    expect(t.shown[0].buttons.map((b) => b.text)).toEqual([LATER, UPDATE_IN_STORE]);
  });

  it('Update opens the App Store page; coming back does not ask again at once', async () => {
    const t = setup();
    await t.prompt.cameOnScreen();
    press(t.shown[0].buttons, UPDATE_IN_STORE);
    expect(t.opened).toEqual([STORE.url]);
    t.prompt.leftScreen();
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(1);
  });

  it('Later waits 4 hours, then asks again', async () => {
    const t = setup();
    await t.prompt.cameOnScreen();
    press(t.shown[0].buttons, LATER);
    t.tick(LATER_WAIT_MS - 1);
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(1);
    t.tick(2);
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(2);
  });

  it('a tap beside the box counts as Later', async () => {
    const t = setup();
    await t.prompt.cameOnScreen();
    t.shown[0].dismiss!();
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(1);
  });

  it('nothing while an order is being sent, when this is the newest, or when the store has no answer (a test build)', async () => {
    for (const o of [{ sending: true }, { current: '2.1.0' }, { store: null }]) {
      const t = setup(o);
      await t.prompt.cameOnScreen();
      expect(t.shown).toHaveLength(0);
    }
  });

  it('never two boxes at once, and the App Store is asked at most once an hour', async () => {
    const t = setup();
    await t.prompt.cameOnScreen();
    await t.prompt.cameOnScreen();
    expect(t.shown).toHaveLength(1);
    expect(t.lookups()).toBe(1);
    press(t.shown[0].buttons, LATER);
    t.tick(LATER_WAIT_MS);
    await t.prompt.cameOnScreen();
    expect(t.lookups()).toBe(LATER_WAIT_MS >= LOOKUP_EVERY_MS ? 2 : 1);
  });
});

describe("Apple's lookup", () => {
  it('reads the version and the page; anything else is no answer', async () => {
    const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    let asked = '';
    const spy = (async (url: string) => { asked = url; return { ok: true, json: async () => ({ results: [{ version: '2.1.0', trackViewUrl: STORE.url }] }) }; }) as unknown as typeof fetch;
    await expect(lookUpStoreVersion('com.megyprints.app', spy)).resolves.toEqual(STORE);
    expect(asked).toBe('https://itunes.apple.com/lookup?bundleId=com.megyprints.app&country=ph');
    await expect(lookUpStoreVersion('x', answer({ resultCount: 0, results: [] }))).resolves.toBeNull();
    await expect(lookUpStoreVersion('x', answer({}, false))).resolves.toBeNull();
    await expect(lookUpStoreVersion('x', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).resolves.toBeNull();
  });
});
