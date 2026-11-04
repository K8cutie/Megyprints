/* The order files this phone sent are known to the next checkout visit
   (beta round 3): after the app was closed on a stopped order, finishing it
   sent the cover again, its duplicate answer broke the connection, and the
   pages file after it waited ~40 s for a 502 before its retry went through. */
import { memoryStore } from '../src/builder/deviceStore';
import { KEEP_SENT_MS, SENT_FILES_KEY, sentFiles } from '../src/lib/checkout/sentFiles';

describe('sentFiles', () => {
  it('a file sent is known to the next checkout visit (the app closed in between)', () => {
    const store = memoryStore();
    const visit = sentFiles(store);
    expect(visit.has('order-9-cover.pdf')).toBe(false);
    visit.add('order-9-cover.pdf');
    expect(visit.has('order-9-cover.pdf')).toBe(true);
    const next = sentFiles(store);
    expect(next.has('order-9-cover.pdf')).toBe(true);
    expect(next.has('order-9.pdf')).toBe(false);
  });

  it('forgotten after a while, so an old order\'s files are sent again rather than taken as sent', () => {
    const store = memoryStore();
    let now = 1_000_000;
    sentFiles(store, () => now).add('order-9-cover.pdf');
    now += KEEP_SENT_MS - 1;
    expect(sentFiles(store, () => now).has('order-9-cover.pdf')).toBe(true);
    now += 2;
    expect(sentFiles(store, () => now).has('order-9-cover.pdf')).toBe(false);
  });

  it('an unreadable record counts as nothing sent', () => {
    const store = memoryStore();
    store.setItem(SENT_FILES_KEY, '{not json');
    const visit = sentFiles(store);
    expect(visit.has('order-9-cover.pdf')).toBe(false);
    visit.add('order-9-cover.pdf');
    expect(sentFiles(store).has('order-9-cover.pdf')).toBe(true);
  });

  it('no store (a checkout outside the album): this visit only, as before', () => {
    const visit = sentFiles(null);
    visit.add('order-9-cover.pdf');
    expect(visit.has('order-9-cover.pdf')).toBe(true);
    expect(sentFiles(null).has('order-9-cover.pdf')).toBe(false);
  });

  it('keeps the newest few', () => {
    const store = memoryStore();
    const visit = sentFiles(store);
    for (let i = 0; i < 60; i++) visit.add(`order-${i}.pdf`);
    const next = sentFiles(store);
    expect(next.has('order-59.pdf')).toBe(true);
    expect(next.has('order-0.pdf')).toBe(false);
  });
});
