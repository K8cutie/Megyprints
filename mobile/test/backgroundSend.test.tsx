/* ══════════════════════════════════════════════════════════════════════════
   PLACE ORDER IN THE BACKGROUND (lib/checkout/backgroundSend.ts,
   modules/order-keeper, components/checkout/Sending.tsx).

   Making the print files on the phone takes minutes. While it runs, the
   person may open Facebook or another app: Android then pauses the app's
   timers and may freeze it, and the order stops half-way. So while an order
   is made and sent, the app runs the order keeper (its own native module):
   a notification with the bar ("Placing your order", "Making page 4 of
   40…"), which keeps the app working, and, once it is done while the
   person is in another app, a notification that says so.
     • Place order asks Android for notifications first (Android 13+);
     • the keeper starts, and follows every page;
     • sent: "Order MP-… is placed. Pay by bank transfer to finish." (the
       website's words), or "Test order placed"; failed: the screen's own
       words for why; only when the app is not in front (in front, the
       screen says it);
     • notifications refused: sending still works, the screen says to keep
       it open, as before;
     • an older APK without the module: nothing changes, nothing breaks.
   The native half is a stand-in here (it can only run on a phone).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react-native';
import {
  BACKGROUND_NOTE, FAILED_TITLE, KEEPER_TITLE, placedNotice, startKeeper, type KeeperDeps, type KeeperNative,
} from '../src/lib/checkout/backgroundSend';
import { KEEP_OPEN_NOTE, sendFrame } from '../src/lib/checkout/placeRun';
import type { SendStep } from '../src/lib/checkout/sendOrder';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

type Call = { fn: string; args: unknown[] };
function fakeNative(o: { allowed?: boolean; started?: { service: boolean; task: boolean } } = {}) {
  const calls: Call[] = [];
  const n: KeeperNative & { calls: Call[] } = {
    calls,
    notificationsAllowed: () => o.allowed ?? true,
    start: async (...args) => { calls.push({ fn: 'start', args }); return o.started ?? { service: true, task: true }; },
    update: (...args) => { calls.push({ fn: 'update', args }); },
    finish: async (...args) => { calls.push({ fn: 'finish', args }); },
  };
  return n;
}
function deps(native: KeeperNative | null, o: { ask?: boolean; appState?: string } = {}): KeeperDeps & { asked: number } {
  const d = {
    asked: 0,
    native,
    askToNotify: async () => { d.asked++; return o.ask ?? true; },
    appState: () => o.appState ?? 'background',
  };
  return d;
}
const steps = (list: SendStep[]) => {
  let prev = null as ReturnType<typeof sendFrame>['progress'] | null;
  return list.map((s) => { const f = sendFrame(prev, s); prev = f.progress; return f; });
};

describe('the words', () => {
  it('the bar\'s name and the website\'s "is placed" line', () => {
    expect(read('src/components/PlaceOrderProgress.tsx')).toContain(`aria-label="${KEEPER_TITLE}"`);
    expect(read('src/pages/Order.tsx')).toContain('is placed. Pay by bank transfer to finish.</p>');
    expect(placedNotice({ order_number: 'MP-2026-ABC1234' }, false)).toEqual({ title: 'Order MP-2026-ABC1234 is placed', text: 'Pay by bank transfer to finish.' });
    expect(read('src/pages/Order.tsx')).toContain("'Test order placed'");
    expect(placedNotice({ order_number: 'MP-2026-ABC1234' }, true)).toEqual({ title: 'Test order placed', text: 'Order MP-2026-ABC1234' });
    // An event album its booking paid for: Order.tsx's line after it.
    expect(placedNotice({ order_number: 'MP-2026-ABC1234' }, false, 'EV-2026-0007')).toEqual({ title: 'Order MP-2026-ABC1234 is placed', text: 'Your event booking EV-2026-0007 paid for this album. We print it and ship it to your door.' });
    expect(BACKGROUND_NOTE).toBe('You can use other apps while we make and send your order. A notification will tell you when it is done.');
  });
});

describe('the order keeper', () => {
  it('Place order: asks for notifications, then starts with the bar\'s first words', async () => {
    const n = fakeNative();
    const d = deps(n);
    const k = await startKeeper('Placing your order…', d);
    expect(d.asked).toBe(1);
    expect(n.calls).toEqual([{ fn: 'start', args: [KEEPER_TITLE, 'Placing your order…'] }]);
    expect(k.background).toBe(true);
  });

  it('follows every page, with the bar\'s words and how far it is', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n));
    n.calls.length = 0;
    const frames = steps([{ step: 'cover' }, { step: 'pages', done: 0, total: 40, smaller: false }, { step: 'pages', done: 4, total: 40, smaller: false }, { step: 'pages', done: 4, total: 40, smaller: false }, { step: 'sending' }]);
    for (const f of frames) k.step(f);
    expect(n.calls.map((c) => c.args[1])).toEqual(['Making your cover…', 'Making page 1 of 40…', 'Making page 5 of 40…', 'Sending your print file…']);
    expect(n.calls.every((c) => c.fn === 'update' && c.args[0] === KEEPER_TITLE)).toBe(true);
    const pct = n.calls.map((c) => c.args[2] as number);
    const made = pct.slice(0, -1);
    expect(made).toEqual([...made].sort((a, b) => a - b)); // it only moves forward
    expect(made[made.length - 1]).toBeGreaterThan(made[0]);
    expect(pct.at(-1)).toBe(-1); // sending can't be measured: a moving bar, as on the screen
  });

  it('sent while the person is in another app: the order\'s number and what to do next', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n, { appState: 'background' }));
    await k.sent({ order_number: 'MP-2026-ABC1234' }, false);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: ['Order MP-2026-ABC1234 is placed', 'Pay by bank transfer to finish.'] });
    await k.end(); // the screen goes: nothing more
    expect(n.calls.filter((c) => c.fn === 'finish')).toHaveLength(1);
  });

  it('a tester order sent: "Test order placed"', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n));
    await k.sent({ order_number: 'MP-2026-TST0001' }, true);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: ['Test order placed', 'Order MP-2026-TST0001'] });
  });

  it('sent while the app is in front: the screen says it, no notification', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n, { appState: 'active' }));
    await k.sent({ order_number: 'MP-2026-ABC1234' }, false);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: [null, null] });
  });

  it('failed while in another app: the same words the screen shows', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n, { appState: 'background' }));
    const why = "We couldn't send your album's cover. Your order is saved: check your internet, then tap Place order again.";
    await k.failed(why);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: [FAILED_TITLE, why] });
    expect(FAILED_TITLE).toBe('Placing your order stopped');
    await k.end();
    expect(n.calls.filter((c) => c.fn === 'finish')).toHaveLength(1);
  });

  it('left before it is done (the screen closed): stopped, no notification', async () => {
    const n = fakeNative();
    const k = await startKeeper('Placing your order…', deps(n));
    await k.end();
    await k.end();
    expect(n.calls.filter((c) => c.fn === 'finish')).toEqual([{ fn: 'finish', args: [null, null] }]);
  });

  it('notifications refused: still kept going if they leave, but the screen says to keep it open; no "done" notification', async () => {
    const n = fakeNative({ allowed: false });
    const k = await startKeeper('Placing your order…', deps(n, { ask: false, appState: 'background' }));
    expect(n.calls[0].fn).toBe('start');
    expect(k.background).toBe(false);
    await k.sent({ order_number: 'MP-2026-ABC1234' }, false);
    expect(n.calls.at(-1)).toEqual({ fn: 'finish', args: [null, null] });
  });

  it('Android refused to start it: as before (keep the screen open)', async () => {
    const n = fakeNative({ started: { service: false, task: false } });
    const k = await startKeeper('Placing your order…', deps(n));
    expect(k.background).toBe(false);
  });

  it('an older APK without the module: nothing asked, nothing started, nothing breaks', async () => {
    const d = deps(null);
    const k = await startKeeper('Placing your order…', d);
    expect(d.asked).toBe(0);
    expect(k.background).toBe(false);
    k.step(steps([{ step: 'cover' }])[0]);
    await k.sent({ order_number: 'MP-1' }, false);
    await k.failed('x');
    await k.end();
  });

  it('a native call that throws never stops the order', async () => {
    const n = fakeNative();
    n.update = () => { throw new Error('boom'); };
    n.finish = async () => { throw new Error('boom'); };
    const k = await startKeeper('Placing your order…', deps(n));
    expect(() => k.step(steps([{ step: 'cover' }])[0])).not.toThrow();
    await expect(k.sent({ order_number: 'MP-1' }, false)).resolves.toBeUndefined();
  });
});

/* ── The Sending screen ── */
const mockKeeper: { native: (KeeperNative & { calls: Call[] }) | null; ask: boolean } = { native: null, ask: true };
const mockSend: { run: (c: { onStep: (s: SendStep) => void; onOrder: (o: unknown) => void }) => Promise<unknown> } = { run: async () => ({}) };
jest.mock('../src/lib/checkout/backgroundSend', () => {
  const actual = jest.requireActual('../src/lib/checkout/backgroundSend');
  return {
    ...actual,
    // The screen passes no stand-ins: the screen tests' ones (the tests above pass their own).
    startKeeper: (first: string, d?: unknown) => actual.startKeeper(first, d ?? { native: mockKeeper.native, askToNotify: async () => mockKeeper.ask, appState: () => 'background' }),
  };
});
jest.mock('../src/lib/checkout/phoneSend', () => ({ sendFromPhone: (c: never) => mockSend.run(c) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
// eslint-disable-next-line import/first
import { Sending } from '../src/components/checkout/Sending';

function renderSending(onSent = jest.fn(), onFailed = jest.fn()) {
  return render(
    <Sending plan={{} as never} album={{} as never} cover={'hardcover' as never} material={'matte' as never} text={{} as never} placed={null}
      onOrder={jest.fn()} onSent={onSent} onFailed={onFailed} />,
  );
}

describe('the Sending screen', () => {
  beforeEach(() => { mockKeeper.native = fakeNative(); mockKeeper.ask = true; });

  it('notifications allowed: says they can use other apps; the notification follows the pages; done says the order', async () => {
    let finish!: (v: unknown) => void;
    let onStep!: (s: SendStep) => void;
    mockSend.run = (c) => { onStep = c.onStep; return new Promise((r) => { finish = r; }); };
    const onSent = jest.fn();
    await renderSending(onSent);
    expect(await screen.findByText(BACKGROUND_NOTE)).toBeOnTheScreen();
    expect(screen.queryByText(KEEP_OPEN_NOTE)).toBeNull();
    onStep({ step: 'pages', done: 3, total: 40, smaller: false });
    expect(mockKeeper.native!.calls.at(-1)).toEqual({ fn: 'update', args: [KEEPER_TITLE, 'Making page 4 of 40…', expect.any(Number)] });
    finish({ order: { id: 'o-1', order_number: 'MP-2026-ABC1234', status: 'pending_payment' }, paidByTester: false });
    await screen.findByTestId('order-placing');
    await new Promise((r) => setImmediate(r));
    expect(mockKeeper.native!.calls.at(-1)).toEqual({ fn: 'finish', args: ['Order MP-2026-ABC1234 is placed', 'Pay by bank transfer to finish.'] });
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('notifications refused: "Keep this screen open", as before; it still sends', async () => {
    mockKeeper.ask = false;
    mockKeeper.native = fakeNative({ allowed: false });
    const sent = { order: { id: 'o-1', order_number: 'MP-1', status: 'pending_payment' }, paidByTester: false };
    mockSend.run = async () => sent;
    const onSent = jest.fn();
    await renderSending(onSent);
    expect(await screen.findByText(KEEP_OPEN_NOTE)).toBeOnTheScreen();
    await new Promise((r) => setImmediate(r));
    expect(onSent).toHaveBeenCalledWith(sent);
  });

  it('failed: the notification says why, and the screen goes back with the same words', async () => {
    const why = "We couldn't send your album's cover. Your order is saved: check your internet, then tap Place order again.";
    mockSend.run = async () => { throw new Error(why); };
    const onFailed = jest.fn();
    await renderSending(jest.fn(), onFailed);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(mockKeeper.native!.calls.at(-1)).toEqual({ fn: 'finish', args: [FAILED_TITLE, why] });
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('an older APK: the screen as before', async () => {
    mockKeeper.native = null;
    mockSend.run = () => new Promise(() => {});
    await renderSending();
    expect(await screen.findByText(KEEP_OPEN_NOTE)).toBeOnTheScreen();
  });
});

/* ── The native half, as far as it can be read here (it is built on the PC) ── */
describe('the native half', () => {
  const MOD = 'mobile/modules/order-keeper';
  const KT = `${MOD}/android/src/main/java/expo/modules/megyorderkeeper`;

  it('autolinking finds it, and both halves use the same names', () => {
    const cfg = JSON.parse(read(`${MOD}/expo-module.config.json`)) as { platforms: string[]; android: { modules: string[] } };
    expect(cfg).toEqual({ platforms: ['android'], android: { modules: ['expo.modules.megyorderkeeper.OrderKeeperModule'] } });
    const kt = read(`${KT}/OrderKeeperModule.kt`);
    const js = read(`${MOD}/index.ts`);
    expect(kt).toContain('Name("MegyOrderKeeper")');
    expect(js).toContain("requireOptionalNativeModule<OrderKeeperNative>('MegyOrderKeeper')");
    expect(kt).toContain('const val TASK_KEY = "MegyOrderKeeper"');
    expect(js).toContain("export const KEEPER_TASK = 'MegyOrderKeeper';");
    for (const fn of ['notificationsAllowed', 'start', 'update', 'finish']) expect(kt).toMatch(new RegExp(`Function\\("${fn}"\\)`));
  });

  it('the service is declared as Android 14+ asks (dataSync, its permissions), and the app does not block them', () => {
    const manifest = read(`${MOD}/android/src/main/AndroidManifest.xml`);
    for (const p of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'POST_NOTIFICATIONS']) {
      expect(manifest).toContain(`<uses-permission android:name="android.permission.${p}" />`);
    }
    expect(manifest).toMatch(/<service\s+android:name="expo\.modules\.megyorderkeeper\.OrderKeeperService"\s+android:exported="false"\s+android:foregroundServiceType="dataSync" \/>/);
    expect(read(`${KT}/OrderKeeperService.kt`)).toContain('ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC');
    const app = JSON.parse(read('mobile/app.json')) as { expo: { android: { blockedPermissions: string[] } } };
    for (const p of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'POST_NOTIFICATIONS']) {
      expect(app.expo.android.blockedPermissions).not.toContain(`android.permission.${p}`);
    }
  });

  it('the processor stays awake while an order is sent (a partial wake lock, at most 2 hours), and is let go when it ends', () => {
    const manifest = read(`${MOD}/android/src/main/AndroidManifest.xml`);
    expect(manifest).toContain('<uses-permission android:name="android.permission.WAKE_LOCK" />');
    const app = JSON.parse(read('mobile/app.json')) as { expo: { android: { blockedPermissions: string[] } } };
    expect(app.expo.android.blockedPermissions).not.toContain('android.permission.WAKE_LOCK');
    const kt = read(`${KT}/OrderKeeperService.kt`);
    expect(kt).toContain('pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MegyPrints:order")');
    expect(kt).toContain('acquire(WAKE_MS)');
    expect(kt).toContain('const val WAKE_MS = 2L * 60 * 60 * 1000');
    // Taken once the service is in front; let go when it ends (finish, timeout, swipe away all end in onDestroy).
    expect(kt).toMatch(/ServiceCompat\.startForeground\([^)]*\)\s*keepAwake\(\)/);
    expect(kt).toMatch(/override fun onDestroy\(\) \{\s*letSleep\(\)/);
  });

  it('the headless task keeps the app\'s timers going: started on the main thread, allowed while the app is in front', () => {
    const kt = read(`${KT}/OrderKeeperModule.kt`);
    expect(kt).toContain('HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0L, true)');
    expect(kt).toMatch(/AsyncFunction\("start"\) Coroutine \{[^}]*withContext\(Dispatchers\.Main\)/);
    // React Native stops timers for an app out of sight unless a headless task runs.
    expect(read('mobile/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt')).toContain('if (isPaused.get() && !isRunningTasks.get()) {');
  });
});
