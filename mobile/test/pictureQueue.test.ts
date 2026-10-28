/* The order page pictures are drawn in (src/builder/pictureQueue.ts): one at
   a time, the most wanted first, a picture asked for twice drawn once, and
   one nobody wants any more dropped before it is drawn. */
import { createPictureQueue, PictureDropped } from '../src/builder/pictureQueue';

/** A drawing the test finishes by hand. */
function drawing(log: string[], key: string) {
  let finish!: () => void;
  const done = new Promise<void>((r) => { finish = r; });
  return {
    run: async () => { log.push(`start ${key}`); await done; log.push(`end ${key}`); return key; },
    finish: async () => { finish(); await flush(); },
  };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('the page picture queue', () => {
  it('draws one at a time, the most wanted first, then in the order asked', async () => {
    const q = createPictureQueue<string>();
    const log: string[] = [];
    const a = drawing(log, 'ahead'), t = drawing(log, 'thumb'), e = drawing(log, 'edit'), s = drawing(log, 'shown');
    q.request('ahead', a.run, 0);
    q.request('thumb', t.run, 1);
    q.request('edit', e.run, 3);
    q.request('shown', s.run, 2);
    await flush();
    expect(q.drawing()).toBe('edit'); // asked third, wanted most
    expect(q.waiting()).toEqual(['shown', 'thumb', 'ahead']);
    await e.finish();
    expect(q.drawing()).toBe('shown');
    await s.finish(); await t.finish(); await a.finish();
    expect(log).toEqual(['start edit', 'end edit', 'start shown', 'end shown', 'start thumb', 'end thumb', 'start ahead', 'end ahead']);
  });

  it('a picture asked for twice is drawn once, and both get it', async () => {
    const q = createPictureQueue<string>();
    const log: string[] = [];
    const d = drawing(log, 'p1');
    const first = q.request('p1', d.run, 1);
    const second = q.request('p1', async () => { log.push('second run'); return 'other'; }, 2);
    await flush();
    await d.finish();
    expect(await first.promise).toBe('p1');
    expect(await second.promise).toBe('p1');
    expect(log).toEqual(['start p1', 'end p1']);
  });

  it('a picture nobody wants any more is dropped before it is drawn; one being drawn is finished', async () => {
    const q = createPictureQueue<string>();
    const log: string[] = [];
    const busy = drawing(log, 'busy');
    const b = q.request('busy', busy.run, 3);
    const thumbs = Array.from({ length: 5 }, (_v, i) => q.request(`thumb${i}`, async () => { log.push(`thumb${i}`); return `thumb${i}`; }, 1));
    await flush();
    expect(q.drawing()).toBe('busy');
    b.release(); // the screen went while it was being drawn: finished anyway
    thumbs.forEach((t, i) => { if (i !== 2) t.release(); }); // the sheet scrolled or closed
    for (const [i, t] of thumbs.entries()) if (i !== 2) await expect(t.promise).rejects.toBeInstanceOf(PictureDropped);
    await busy.finish();
    expect(await b.promise).toBe('busy');
    expect(await thumbs[2].promise).toBe('thumb2');
    expect(log).toEqual(['start busy', 'end busy', 'thumb2']);
    expect(q.waiting()).toEqual([]);
  });

  it('kept while anyone still wants it; a failed drawing is said to who asked, and the next one goes on', async () => {
    const q = createPictureQueue<string>();
    const one = q.request('p', async () => 'p', 1);
    const two = q.request('p', async () => 'p', 1);
    one.release();
    expect(await two.promise).toBe('p');
    const bad = q.request('bad', async () => { throw new Error('no photo'); }, 2);
    const next = q.request('next', async () => 'next', 1);
    await expect(bad.promise).rejects.toThrow('no photo');
    expect(await next.promise).toBe('next');
  });

  it('whenIdle runs once the drawing under way is done, before the next one', async () => {
    const q = createPictureQueue<string>();
    const log: string[] = [];
    const d = drawing(log, 'a');
    q.request('a', d.run, 1);
    await flush();
    q.request('b', async () => { log.push('b'); return 'b'; }, 1);
    q.whenIdle(() => log.push('idle'));
    await flush();
    expect(log).toEqual(['start a']);
    await d.finish();
    await flush();
    expect(log).toEqual(['start a', 'end a', 'idle', 'b']);
  });
});
