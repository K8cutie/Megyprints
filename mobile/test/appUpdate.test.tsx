/* ══════════════════════════════════════════════════════════════════════════
   A NEW VERSION FROM GOOGLE PLAY, ASKED FOR IN THE APP (src/lib/appUpdate.ts,
   modules/app-update).

   1.x has asked since 1.4.0 (android-native AppUpdatePrompt.java), so each new
   version reaches testers soon after it is out; 2.0 had nothing, so 2.0.1 →
   2.0.2 would have waited for Play's own updating (owner, 2026-11-04: "Yes,
   add it"). The same rules and the same words as 1.x:
     • the app comes on screen and Play has a newer version: Google's sheet
       asks, once per launch (a no holds until the next launch);
     • the download in, the app back on screen: "A new version of Megy Prints
       is ready." — Restart to update / Later (Later, or Back, waits 4 hours);
     • nothing while the app is out of sight, never two boxes at once;
     • new in 2.0: nothing while an order is being made and sent (a restart
       would stop it half-way);
     • not installed from Play, or an APK without the module: nothing.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { act, render } from '@testing-library/react-native';
import { AppState, type AlertButton, type AlertOptions } from 'react-native';
import type { AppUpdateInfo, AppUpdateNative } from '../modules/app-update';
import { orderBeingSent, startSending } from '../src/lib/checkout/backgroundSend';
import {
  createUpdatePrompt, DOWNLOADED, DOWNLOADING, INSTALLING, LATER, LATER_WAIT_MS, laterHolds, NEVER, PENDING, RESTART,
  shouldShowReadyBox, shouldStartFlow, UPDATE_AVAILABLE, UPDATE_READY, useAppUpdatePrompt, type PromptDeps,
} from '../src/lib/appUpdate';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// Play's other numbers (UpdateAvailability, InstallStatus), for the cases below.
const UNKNOWN = 0;
const UPDATE_NOT_AVAILABLE = 1;
const DEVELOPER_TRIGGERED = 3;
const INSTALLED = 4;
const FAILED = 5;
const CANCELED = 6;

const NOW = 50_000_000;
const NEWER = { availability: UPDATE_AVAILABLE, installStatus: UNKNOWN, flexibleAllowed: true };

describe('the same as 1.x', () => {
  it('the words: 1.x\'s own (android-native strings.xml)', () => {
    const xml = read('android-native/app/src/main/res/values/strings.xml');
    expect(xml).toContain(`<string name="update_ready">${UPDATE_READY}</string>`);
    expect(xml).toContain(`<string name="update_restart">${RESTART}</string>`);
    expect(xml).toContain(`<string name="update_later">${LATER}</string>`);
    expect([UPDATE_READY, RESTART, LATER]).toEqual(['A new version of Megy Prints is ready.', 'Restart to update', 'Later']);
  });

  it('Play\'s numbers and the 4 hours: 1.x\'s UpdateDecision.java (its JUnit test holds them to Play\'s library)', () => {
    const java = read('android-native/app/src/main/java/com/megyprints/app/UpdateDecision.java');
    const n = (name: string) => Number(new RegExp(`static final int ${name} = (\\d+);`).exec(java)![1]);
    expect([UPDATE_AVAILABLE, PENDING, DOWNLOADING, INSTALLING, DOWNLOADED]).toEqual([n('UPDATE_AVAILABLE'), n('PENDING'), n('DOWNLOADING'), n('INSTALLING'), n('DOWNLOADED')]);
    expect(java).toContain('static final long LATER_WAIT_MS = 4L * 60 * 60 * 1000;');
    expect(LATER_WAIT_MS).toBe(4 * 60 * 60 * 1000);
    expect(java).toContain('static final long NEVER = -1;');
    expect(NEVER).toBe(-1);
  });
});

describe('asking about a new version (Google\'s sheet)', () => {
  it('asks when a new version is out', () => {
    expect(shouldStartFlow(NEWER, true, false, false)).toBe(true);
  });
  it('not when the app is out of sight (the photo picker, the sign-in tab): the next return asks', () => {
    expect(shouldStartFlow(NEWER, false, false, false)).toBe(false);
  });
  it('once per launch: a no holds until the next launch', () => {
    expect(shouldStartFlow(NEWER, true, true, false)).toBe(false);
  });
  it('not without a new version', () => {
    for (const availability of [UNKNOWN, UPDATE_NOT_AVAILABLE, DEVELOPER_TRIGGERED]) {
      expect(shouldStartFlow({ ...NEWER, availability }, true, false, false)).toBe(false);
    }
  });
  it('not when Play doesn\'t allow the flexible way', () => {
    expect(shouldStartFlow({ ...NEWER, flexibleAllowed: false }, true, false, false)).toBe(false);
  });
  it('not while a download is under way (they already said yes)', () => {
    for (const installStatus of [PENDING, DOWNLOADING, DOWNLOADED, INSTALLING]) {
      expect(shouldStartFlow({ ...NEWER, installStatus }, true, false, false)).toBe(false);
    }
  });
  it('again after a failed or canceled download, on the next launch', () => {
    expect(shouldStartFlow({ ...NEWER, installStatus: FAILED }, true, false, false)).toBe(true);
    expect(shouldStartFlow({ ...NEWER, installStatus: CANCELED }, true, false, false)).toBe(true);
  });
  it('not while an order is being made and sent', () => {
    expect(shouldStartFlow(NEWER, true, false, true)).toBe(false);
  });
});

describe('"A new version of Megy Prints is ready."', () => {
  it('once downloaded', () => {
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NEVER, NOW, false)).toBe(true);
  });
  it('not before the download is in', () => {
    for (const s of [UNKNOWN, PENDING, DOWNLOADING, INSTALLING, INSTALLED, FAILED, CANCELED]) {
      expect(shouldShowReadyBox(s, true, false, NEVER, NOW, false)).toBe(false);
    }
  });
  it('waits until the app is on screen', () => {
    expect(shouldShowReadyBox(DOWNLOADED, false, false, NEVER, NOW, false)).toBe(false);
  });
  it('never two boxes at once', () => {
    expect(shouldShowReadyBox(DOWNLOADED, true, true, NEVER, NOW, false)).toBe(false);
  });
  it('Later holds for 4 hours', () => {
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NOW, NOW + 60_000, false)).toBe(false);
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NOW, NOW + LATER_WAIT_MS - 1, false)).toBe(false);
  });
  it('Later ends after 4 hours even if the app was never closed', () => {
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NOW, NOW + LATER_WAIT_MS, false)).toBe(true);
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NOW, NOW + 3 * 24 * 60 * 60 * 1000, false)).toBe(true);
  });
  it('Later holds only after it was tapped', () => {
    expect(laterHolds(NEVER, NOW)).toBe(false);
    expect(laterHolds(NEVER, 0)).toBe(false);
    expect(laterHolds(NOW, NOW)).toBe(true);
  });
  it('not while an order is being made and sent: Restart would stop it half-way', () => {
    expect(shouldShowReadyBox(DOWNLOADED, true, false, NEVER, NOW, true)).toBe(false);
  });
});

/** Play's side, written down. */
function fakePlay(info: Partial<AppUpdateInfo> = {}) {
  const calls: string[] = [];
  const play = { info: { availability: UPDATE_NOT_AVAILABLE, installStatus: UNKNOWN, flexibleAllowed: true, versionCode: 0, ...info } as AppUpdateInfo, fails: false };
  const native: AppUpdateNative = {
    check: async () => {
      calls.push('check');
      if (play.fails) throw new Error('Install Error(-10): The app is not owned by any user on this device.');
      return { ...play.info };
    },
    startFlexible: async () => { calls.push('startFlexible'); return true; },
    completeUpdate: async () => { calls.push('completeUpdate'); },
  };
  return { native, calls, play };
}

type Asked = { title: string; message: string | undefined; buttons: AlertButton[]; options: AlertOptions | undefined };
function deps(native: AppUpdateNative | null) {
  const asked: Asked[] = [];
  const clock = { now: NOW, sending: false };
  const d: PromptDeps = {
    native,
    sending: () => clock.sending,
    now: () => clock.now,
    ask: (title, message, buttons, options) => { asked.push({ title, message, buttons: buttons ?? [], options }); },
  };
  return { d, asked, clock };
}
const press = (a: Asked, text: string) => a.buttons.find((b) => b.text === text)!.onPress!();

describe('the app asks, the way 1.x does', () => {
  it('a newer version: Google\'s sheet when the app comes on screen, once per launch', async () => {
    const { native, calls } = fakePlay({ availability: UPDATE_AVAILABLE, versionCode: 103 });
    const { d, asked } = deps(native);
    const p = createUpdatePrompt(d);
    await p.cameOnScreen();
    expect(calls).toEqual(['check', 'startFlexible']);
    // Back from the sheet (they said no), or from the photo picker: checked, not asked again.
    p.leftScreen();
    await p.cameOnScreen();
    expect(calls).toEqual(['check', 'startFlexible', 'check']);
    expect(asked).toEqual([]);
  });

  it('no newer version, or Play not allowing the flexible way: nothing', async () => {
    for (const info of [{}, { availability: UPDATE_AVAILABLE, flexibleAllowed: false }]) {
      const { native, calls } = fakePlay(info);
      const { d, asked } = deps(native);
      await createUpdatePrompt(d).cameOnScreen();
      expect(calls).toEqual(['check']);
      expect(asked).toEqual([]);
    }
  });

  it('the download in: the box, in 1.x\'s words; Restart to update installs it', async () => {
    const { native, calls } = fakePlay({ availability: UPDATE_AVAILABLE, installStatus: DOWNLOADED });
    const { d, asked } = deps(native);
    await createUpdatePrompt(d).cameOnScreen();
    expect(asked).toHaveLength(1);
    // The line alone, no title, as 1.x's box (a title left an empty gap under it).
    expect([asked[0].title, asked[0].message]).toEqual(['', 'A new version of Megy Prints is ready.']);
    // Later first (Android's left button), then the one that acts.
    expect(asked[0].buttons.map((b) => [b.text, b.style])).toEqual([['Later', 'cancel'], ['Restart to update', undefined]]);
    expect(asked[0].options).toMatchObject({ cancelable: true });
    expect(calls).toEqual(['check']); // no sheet: the download is already in
    press(asked[0], RESTART);
    await act(async () => {});
    expect(calls).toEqual(['check', 'completeUpdate']);
  });

  it.each([
    ['Later', (a: Asked) => press(a, LATER)],
    ['Back (or a tap beside the box)', (a: Asked) => a.options!.onDismiss!()],
  ])('%s: quiet for 4 hours, then the box again', async (_n, answer) => {
    const { native, calls } = fakePlay({ availability: UPDATE_AVAILABLE, installStatus: DOWNLOADED });
    const { d, asked, clock } = deps(native);
    const p = createUpdatePrompt(d);
    await p.cameOnScreen();
    answer(asked[0]);
    p.leftScreen();
    clock.now = NOW + 60_000; // back from the photo picker a minute later
    await p.cameOnScreen();
    p.leftScreen();
    clock.now = NOW + LATER_WAIT_MS - 1;
    await p.cameOnScreen();
    expect(asked).toHaveLength(1);
    p.leftScreen();
    clock.now = NOW + LATER_WAIT_MS;
    await p.cameOnScreen();
    expect(asked).toHaveLength(2);
    expect(calls).not.toContain('completeUpdate');
  });

  it('never two boxes at once', async () => {
    const { native } = fakePlay({ availability: UPDATE_AVAILABLE, installStatus: DOWNLOADED });
    const { d, asked } = deps(native);
    const p = createUpdatePrompt(d);
    await p.cameOnScreen();
    p.leftScreen();
    await p.cameOnScreen();
    expect(asked).toHaveLength(1);
  });

  it('while an order is being made and sent: no sheet, no box; after it, they come', async () => {
    const { native, calls, play } = fakePlay({ availability: UPDATE_AVAILABLE });
    const { d, asked, clock } = deps(native);
    const p = createUpdatePrompt(d);
    clock.sending = true;
    await p.cameOnScreen();
    expect(calls).toEqual(['check']);
    clock.sending = false;
    p.leftScreen();
    await p.cameOnScreen();
    expect(calls).toEqual(['check', 'check', 'startFlexible']);
    play.info.installStatus = DOWNLOADED;
    clock.sending = true;
    p.leftScreen();
    await p.cameOnScreen();
    expect(asked).toEqual([]);
    clock.sending = false;
    p.leftScreen();
    await p.cameOnScreen();
    expect(asked).toHaveLength(1);
  });

  it('Play answered after the person left (the photo picker opened): nothing until they are back', async () => {
    const { native, calls } = fakePlay({ availability: UPDATE_AVAILABLE });
    let answer: (i: AppUpdateInfo) => void = () => {};
    native.check = () => { calls.push('check'); return new Promise((r) => { answer = r; }); };
    const { d } = deps(native);
    const p = createUpdatePrompt(d);
    const asking = p.cameOnScreen();
    p.leftScreen();
    answer({ availability: UPDATE_AVAILABLE, installStatus: UNKNOWN, flexibleAllowed: true, versionCode: 103 });
    await asking;
    expect(calls).toEqual(['check']);
  });

  it('not installed from Google Play (the dev build, the emulator): the check fails, nothing shows', async () => {
    const { native, calls, play } = fakePlay({ availability: UPDATE_AVAILABLE });
    play.fails = true;
    const { d, asked } = deps(native);
    await expect(createUpdatePrompt(d).cameOnScreen()).resolves.toBeUndefined();
    expect(calls).toEqual(['check']);
    expect(asked).toEqual([]);
  });

  it('an APK without the module: nothing', async () => {
    const { d, asked } = deps(null);
    await expect(createUpdatePrompt(d).cameOnScreen()).resolves.toBeUndefined();
    expect(asked).toEqual([]);
  });
});

describe('an order being made and sent', () => {
  it('from Place order to its end (two at once: until both end)', () => {
    expect(orderBeingSent()).toBe(false);
    const a = startSending();
    const b = startSending();
    expect(orderBeingSent()).toBe(true);
    a();
    a(); // ending twice counts once
    expect(orderBeingSent()).toBe(true);
    b();
    expect(orderBeingSent()).toBe(false);
  });

  it('the sending screen marks it until the send settles, not when the screen goes', () => {
    const src = read('mobile/src/components/checkout/Sending.tsx').replace(/\r\n/g, '\n');
    expect(src).toContain('const sendDone = startSending();');
    expect(src).toContain('.finally(sendDone);');
  });
});

describe('the app listens while it is open', () => {
  it('on screen at the start: checks; out of sight and back: checks again; closed: stops listening', async () => {
    const listeners: ((s: string) => void)[] = [];
    const removed = jest.fn();
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, h) => { listeners.push(h as (s: string) => void); return { remove: removed }; });
    const was = AppState.currentState;
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
    const { native, calls } = fakePlay();
    const { d } = deps(native);
    function Probe() { useAppUpdatePrompt(d); return null; }
    try {
      const shown = await render(<Probe />);
      await act(async () => {});
      expect(calls).toEqual(['check']);
      expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
      await act(async () => { listeners[0]('background'); });
      await act(async () => { listeners[0]('active'); });
      expect(calls).toEqual(['check', 'check']);
      await shown.unmount();
      expect(removed).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      Object.defineProperty(AppState, 'currentState', { value: was, configurable: true, writable: true });
    }
  });

  it('the app\'s root layout has it, under every screen', () => {
    const src = read('mobile/src/app/_layout.tsx').replace(/\r\n/g, '\n');
    expect(src).toContain('useAppUpdatePrompt();');
    expect(src).toContain('<AskAboutUpdates />');
  });
});
