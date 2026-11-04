/* ══════════════════════════════════════════════════════════════════════════
   "ADD TO THIS BOX" OPENS ONLY WHEN THE CUSTOMER MEANT IT (owner, 2026-11-04:
   "the combo box add photo quote own text appeared during editing").

   Reproduced on the emulator, two ways, both a second tap landing on an empty
   frame the finger was never aimed at:
     1. A tap on a layout in "Choose a layout" closes the sheet at once, and a
        second tap (a double tap, or an impatient one while the phone catches
        up) falls through onto the page under it.
     2. A tap on a photo selects it: its buttons appear, so the page shrinks
        and moves up by about 50 px, and a second tap on the photo's lower edge
        is now on the empty frame below it.
   As settleGuard.ts says of the website's double taps: the first tap changes
   what's under the finger, and the second lands on it.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react-native';
import { AFTER_MOVE_MS, AFTER_SHEET_MS, usePageTapGuard } from '../src/editor/pageTapGuard';

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { jest.restoreAllMocks(); });

type Props = { selected: string | null; covered: boolean };
const open = (first: Props) => renderHook((p: Props) => usePageTapGuard(p.selected, p.covered), { initialProps: first });
const OPEN: Props = { selected: null, covered: false };

describe('after a sheet closes', () => {
  it('a tap on the page is the tail of the tap that closed it: ignored for a moment, then taps work again', async () => {
    const g = await open({ selected: null, covered: true });
    expect(g.result.current.afterSheet()).toBe(false); // nothing has closed yet
    await g.rerender(OPEN);
    expect(g.result.current.afterSheet()).toBe(true);
    clock += AFTER_SHEET_MS - 1;
    expect(g.result.current.afterSheet()).toBe(true);
    clock += 1;
    expect(g.result.current.afterSheet()).toBe(false);
  });

  it('a sheet opening is not a sheet closing', async () => {
    const g = await open(OPEN);
    await g.rerender({ selected: null, covered: true });
    expect(g.result.current.afterSheet()).toBe(false);
  });

  it('long enough for an impatient second tap (measured: 0.7 s still fell through), short enough that nobody waits on it', () => {
    expect(AFTER_SHEET_MS).toBeGreaterThanOrEqual(700);
    expect(AFTER_SHEET_MS).toBeLessThanOrEqual(1000);
  });
});

describe('after the page moved (what is selected changed: its buttons came or went)', () => {
  it('held for a moment, then not', async () => {
    const g = await open(OPEN);
    expect(g.result.current.afterMove()).toBe(false); // the screen just opened: nothing moved
    await g.rerender({ selected: 'slot:0', covered: false });
    expect(g.result.current.afterMove()).toBe(true);
    clock += AFTER_MOVE_MS;
    expect(g.result.current.afterMove()).toBe(false);
  });

  it('putting a photo down moves the page too', async () => {
    const g = await open({ selected: 'slot:0', covered: false });
    await g.rerender(OPEN);
    expect(g.result.current.afterMove()).toBe(true);
  });

  it('the same photo still selected: nothing moved', async () => {
    const g = await open({ selected: 'slot:0', covered: false });
    await act(async () => { await g.rerender({ selected: 'slot:0', covered: false }); });
    expect(g.result.current.afterMove()).toBe(false);
  });
});

describe('Edit pages uses it', () => {
  const screen = fs.readFileSync(path.join(__dirname, '..', 'src/editor/EditPagesScreen.tsx'), 'utf8').split(String.fromCharCode(13)).join('');

  it('a tap right after a sheet closes does nothing; right after the page moved, only one that would open the chooser is ignored', () => {
    expect(screen).toContain('const tapGuard = usePageTapGuard(selected?.key ?? null, !!sheet || picking);');
    expect(screen).toContain('if (!ctx || tapGuard.afterSheet()) return;');
    expect(screen).toContain('if (hit && EMPTY_KINDS.includes(hit.kind) && tapGuard.afterMove()) return;');
  });

  it('TalkBack\'s tap is meant: it goes straight through', () => {
    expect(screen).toContain('onActivate={(t) => runTap(t, ctx)}');
  });
});
