/* ══════════════════════════════════════════════════════════════════════════
   WHICH SCREENS TURN WITH THE PHONE (src/lib/screenTurning.ts).

   Every screen of the app is upright (app.json "orientation": "portrait",
   written into the Android manifest). The Preview alone turns with the phone
   (owner, 2026-11: turning the phone shows the open book full screen):
     • while it is the screen on top, the phone may turn it: the phone's own
       auto-rotate setting decides, as in every app (OrientationLock.DEFAULT);
     • when it is left (the editor opens over it, or it closes), the app is
       upright again (OrientationLock.PORTRAIT_UP);
     • an app built before expo-screen-orientation was added (its native half
       missing) just stays upright: nothing breaks.
   ══════════════════════════════════════════════════════════════════════════ */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderHook } from '@testing-library/react-native';

const mockOrientation = {
  present: true,
  calls: [] as number[],
};
jest.mock('expo-screen-orientation', () => {
  if (!mockOrientation.present) throw new Error("Cannot find native module 'ExpoScreenOrientation'");
  return {
    OrientationLock: { DEFAULT: 0, ALL: 1, PORTRAIT: 2, PORTRAIT_UP: 3 },
    lockAsync: async (lock: number) => { mockOrientation.calls.push(lock); },
  };
});

// After the mock.
import { keepTheScreenUpright, letTheScreenTurn, mayTurn, screenCanTurn, SCREENS_THAT_TURN, useTurnsWithThePhone } from '../src/lib/screenTurning';

const DEFAULT = 0;
const PORTRAIT_UP = 3;
const MOBILE = path.join(__dirname, '..');
const APP_DIR = path.join(MOBILE, 'src');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockOrientation.present = true;
  mockOrientation.calls = [];
});

describe('which screens turn with the phone', () => {
  it('every screen is upright unless it says otherwise (app.json, the Android manifest)', () => {
    const app = JSON.parse(readFileSync(path.join(MOBILE, 'app.json'), 'utf8')) as { expo: { orientation: string } };
    expect(app.expo.orientation).toBe('portrait');
  });

  it('the Preview alone', () => {
    expect([...SCREENS_THAT_TURN]).toEqual(['preview']);
    expect(mayTurn('preview')).toBe(true);
    for (const other of ['index', 'albums', 'photos', 'album-cover', 'making', 'edit-pages', 'edit-cover', 'order', 'sign-in']) {
      expect(mayTurn(other)).toBe(false);
    }
  });

  it('only the Preview screen asks to turn, and only screenTurning.ts talks to expo-screen-orientation', () => {
    const files = filesUnder(APP_DIR).map((f) => ({ f: rel(f), text: readFileSync(f, 'utf8') }));
    expect(files.filter((x) => /useTurnsWithThePhone\(/.test(x.text) && !x.f.endsWith('lib/screenTurning.ts')).map((x) => x.f))
      .toEqual(['src/app/preview.tsx']);
    expect(readFileSync(path.join(APP_DIR, 'app', 'preview.tsx'), 'utf8')).toContain("useTurnsWithThePhone('preview', ");
    expect(files.filter((x) => x.text.includes("'expo-screen-orientation'")).map((x) => x.f)).toEqual(['src/lib/screenTurning.ts']);
  });

  it('every screen file that turns is a real screen (src/app/<name>.tsx)', () => {
    for (const name of SCREENS_THAT_TURN) expect(statSync(path.join(APP_DIR, 'app', `${name}.tsx`)).isFile()).toBe(true);
  });

  it('the app starts upright, even after a reload on the Preview (the root layout)', () => {
    const layout = readFileSync(path.join(APP_DIR, 'app', '_layout.tsx'), 'utf8');
    expect(layout).toContain('keepTheScreenUpright()');
  });
});

describe('the Preview on top: the phone may turn it; left: upright again', () => {
  it('turns while on top, upright when another screen opens over it, turns again when back on top', async () => {
    const { rerender, unmount } = await renderHook(({ focused }: { focused: boolean }) => useTurnsWithThePhone('preview', focused), { initialProps: { focused: true } });
    await flush();
    expect(mockOrientation.calls).toEqual([DEFAULT]);
    await rerender({ focused: false });
    await flush();
    expect(mockOrientation.calls).toEqual([DEFAULT, PORTRAIT_UP]);
    await rerender({ focused: true });
    await flush();
    expect(mockOrientation.calls).toEqual([DEFAULT, PORTRAIT_UP, DEFAULT]);
    await unmount();
    await flush();
    expect(mockOrientation.calls).toEqual([DEFAULT, PORTRAIT_UP, DEFAULT, PORTRAIT_UP]);
  });

  it('not on top: asks for nothing', async () => {
    const { unmount } = await renderHook(() => useTurnsWithThePhone('preview', false));
    await flush();
    await unmount();
    await flush();
    expect(mockOrientation.calls).toEqual([]);
  });

  it('a screen not in the list never turns', async () => {
    const { unmount } = await renderHook(() => useTurnsWithThePhone('edit-pages', true));
    await flush();
    await unmount();
    await flush();
    expect(mockOrientation.calls).toEqual([]);
  });

  it('the plain calls', async () => {
    await letTheScreenTurn();
    await keepTheScreenUpright();
    expect(mockOrientation.calls).toEqual([DEFAULT, PORTRAIT_UP]);
    expect(screenCanTurn()).toBe(true);
  });
});

describe('an app built before this (no native screen turning)', () => {
  it('stays upright, nothing breaks, and the Preview does not offer to turn', async () => {
    mockOrientation.present = false;
    jest.resetModules();
    const fresh = jest.requireActual<typeof import('../src/lib/screenTurning')>('../src/lib/screenTurning');
    expect(fresh.screenCanTurn()).toBe(false);
    await expect(fresh.letTheScreenTurn()).resolves.toBeUndefined();
    await expect(fresh.keepTheScreenUpright()).resolves.toBeUndefined();
    expect(mockOrientation.calls).toEqual([]);
  });
});
