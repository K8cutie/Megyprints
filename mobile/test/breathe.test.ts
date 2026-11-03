/* ══════════════════════════════════════════════════════════════════════════
   THE PAUSE BETWEEN PRINT PAGES (src/lib/breathe.ts). Owner's phone test:
   with the app out of sight, about 3 pages a minute, many more on screen.
   React Native runs timers on the screen's refresh (JavaTimerManager posts
   them on the Choreographer), which Android all but stops for an app out of
   sight, and every page waited on one. So:
     • on screen: a timer (the progress bar gets drawn between pages);
     • out of sight: no timer, the next page as soon as JavaScript is free;
     • both places that pause between pages use it.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { breathe } from '../src/lib/breathe';

afterEach(() => { jest.useRealTimers(); });

describe('the pause', () => {
  it('on screen: a timer', async () => {
    jest.useFakeTimers();
    let done = false;
    void breathe(() => 'active').then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    expect(done).toBe(true);
  });

  for (const state of ['background', 'inactive']) {
    it(`out of sight (${state}): no timer, the next step as soon as JavaScript is free`, async () => {
      const timer = jest.spyOn(global, 'setTimeout');
      try {
        await breathe(() => state);
        expect(timer).not.toHaveBeenCalled();
      } finally {
        timer.mockRestore();
      }
    });
  }
});

describe('the print files use it between pages', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  it('printFiles (each page of the album) and sheetRaster (each press sheet)', () => {
    for (const f of ['src/print/printFiles.ts', 'src/print/sheetRaster.ts']) {
      const src = read(f);
      expect(src).toContain("import { breathe } from '../lib/breathe';");
      expect(src).toContain('await breathe();');
      expect(src).not.toMatch(/new Promise\(\(r\) => setTimeout\(r, 0\)\)/);
    }
  });
});
