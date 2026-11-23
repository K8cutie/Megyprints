/* The print pages made while checkout is open (src/lib/checkout/earlyPages.ts).

   WHY THIS TEST: the owner's 5-year-old phone spent about 78 seconds of Place
   order making a Mini's 16 pages (MP-2026-9XS7BVA, 2026-11-23). They are now
   made while the customer fills in the form. That must never make a wrong
   print file (another album, another cover margin), never be in the way of
   typing (it waits while the keyboard is up), and Place order must take what
   is there and finish it, or make the pages itself when there is nothing. */
import type { AlbumPage } from '@web/pages/builder/types';
import { earlyPagesKey, earlyPagesNow, EarlyPagesStopped, startEarlyPages, stopEarlyPages, takeEarlyPages, type MakePages } from '../src/lib/checkout/earlyPages';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const wait = () => tick();
const page = (id: string) => ({ id, layout: 'single', photos: [0] } as unknown as AlbumPage);
const album = (pages = [page('a'), page('b')]) => ({ albumSize: '5.8x8.3', pages, photoUris: ['file:///1.jpg'], photoIds: ['p1'] });

/** A pages file of `n` pages; each page is one tick, then `between`. */
function maker(n: number, log: string[] = []): MakePages {
  return async (onPage, between) => {
    for (let i = 1; i <= n; i++) {
      await tick();
      log.push(`page ${i}`);
      onPage(i, n, false);
      await between();
    }
    return new Uint8Array([n]);
  };
}

afterEach(() => stopEarlyPages());

describe('the key: which pages file it is', () => {
  it('the same album and cover type → the same key; the pages, the photos, or the binding margin change it', () => {
    const a = album();
    expect(earlyPagesKey(a, 'staple')).toBe(earlyPagesKey(album(), 'staple'));
    expect(earlyPagesKey(a, 'staple')).not.toBe(earlyPagesKey(album([page('a'), page('c')]), 'staple'));
    expect(earlyPagesKey(a, 'staple')).not.toBe(earlyPagesKey({ ...a, photoUris: ['file:///2.jpg'] }, 'staple'));
    expect(earlyPagesKey(a, 'softcover')).not.toBe(earlyPagesKey(a, 'hardboundLeather'));
    // Both hardbound covers have the same margin: the same pages file.
    expect(earlyPagesKey(a, 'hardboundLeather')).toBe(earlyPagesKey(a, 'hardboundLinen'));
  });
});

describe('made while the customer fills in the form', () => {
  it('waits while the keyboard is up, goes on when it is down, and Place order takes the finished file', async () => {
    let quiet = false;
    const log: string[] = [];
    startEarlyPages('k1', maker(3, log), { quiet: () => quiet, wait });
    for (let i = 0; i < 5; i++) await tick();
    expect(log).toEqual([]); // typing: not even the first page
    quiet = true;
    for (let i = 0; i < 20; i++) await tick();
    expect(log).toEqual(['page 1', 'page 2', 'page 3']);
    const early = takeEarlyPages('k1');
    expect(early).not.toBeNull();
    const heard: number[] = [];
    await expect(early!.wait((d) => heard.push(d))).resolves.toEqual(new Uint8Array([3]));
    expect(heard).toEqual([3]); // the last page, at once
  });

  it('a page already started finishes; the next waits for the keyboard', async () => {
    let quiet = true;
    const log: string[] = [];
    startEarlyPages('k1', maker(5, log), { quiet: () => quiet, wait });
    while (log.length < 1) await tick();
    quiet = false; // the customer starts typing while page 2 is being made
    for (let i = 0; i < 10; i++) await tick();
    const made = log.length;
    expect(made).toBeLessThanOrEqual(2); // only the page already started
    for (let i = 0; i < 20; i++) await tick();
    expect(log.length).toBe(made); // and then nothing while the keyboard is up
  });

  it('Place order takes it half-made: no more waiting for the keyboard, every page heard', async () => {
    let quiet = true;
    startEarlyPages('k1', maker(4), { quiet: () => quiet, wait });
    await tick(); await tick();
    quiet = false; // the customer types again… then taps Place order
    const early = takeEarlyPages('k1')!;
    const heard: number[] = [];
    await expect(early.wait((d) => heard.push(d))).resolves.toEqual(new Uint8Array([4]));
    expect(heard[heard.length - 1]).toBe(4);
    expect(heard[0]).toBeGreaterThanOrEqual(1);
  });

  it('another album or cover type: nothing for Place order (it makes its own)', async () => {
    startEarlyPages('k1', maker(2), { quiet: () => true, wait });
    expect(takeEarlyPages('k2')).toBeNull();
    expect(takeEarlyPages('k1')).not.toBeNull();
    expect(takeEarlyPages('k1')).toBeNull(); // used once
  });

  it('the same key again does not start the work twice', async () => {
    const make = jest.fn(maker(2));
    startEarlyPages('k1', make, { quiet: () => true, wait });
    startEarlyPages('k1', make, { quiet: () => true, wait });
    for (let i = 0; i < 10; i++) await tick();
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('a new key stops the old work at its next page', async () => {
    const log: string[] = [];
    startEarlyPages('k1', maker(5, log), { quiet: () => true, wait });
    await tick(); await tick();
    startEarlyPages('k2', maker(1), { quiet: () => true, wait });
    for (let i = 0; i < 20; i++) await tick();
    expect(log.length).toBeLessThan(5);
    expect(earlyPagesNow()?.key).toBe('k2');
  });

  it('leaving checkout stops it: the next page throws EarlyPagesStopped, and nothing is left to take', async () => {
    let thrown: unknown = null;
    const make: MakePages = async (onPage, between) => {
      onPage(1, 3, false);
      try { await between(); } catch (e) { thrown = e; throw e; }
      return new Uint8Array();
    };
    let quiet = false;
    startEarlyPages('k1', make, { quiet: () => quiet, wait });
    quiet = true;
    await tick(); await tick();
    stopEarlyPages();
    for (let i = 0; i < 10; i++) await tick();
    expect(takeEarlyPages('k1')).toBeNull();
    expect(thrown === null || thrown instanceof EarlyPagesStopped).toBe(true);
  });

  it('work that failed is not handed to Place order', async () => {
    startEarlyPages('k1', async () => { throw new Error('photo gone'); }, { quiet: () => true, wait });
    for (let i = 0; i < 5; i++) await tick();
    expect(takeEarlyPages('k1')).toBeNull();
  });
});
