/* "Write a line for this photo" from the app (src/editor/text/photoQuotes.ts),
   answer for answer the website's lib/photoQuotes, with every piece that
   reaches out handed in as a fake: the live endpoint is never called. Also
   the small rules around it: coming back from the sign-in, "Any color", and
   what the words part registers with the editor. */
import type { AlbumPage, UploadedPhoto } from '@web/pages/builder/types';
import { MAX_PAGE_PHOTOS, PHOTO_QUOTES_URL, pagePhotoUris, writeLinesForPhotos, type PhotoQuoteDeps } from '../src/editor/text/photoQuotes';
import { askToResume, forgetResume, takeResume } from '../src/editor/text/resumeQuote';
import { ANY_COLORS, hslHex, parseColourCode, tickOn } from '../src/editor/text/anyColour';
import { editorParts, ORDER } from '../src/editor/registry';
import '../src/editor/parts';

const photo = (i: number, here = true) => ({ id: `p${i}`, name: `p${i}.jpg`, previewUrl: here ? `content://media/${i}` : '', width: 100, height: 100 } as unknown as UploadedPhoto);

describe("the page's photos that go with the request (lib/photoQuotes pagePhotoUrls)", () => {
  it('frames first, then caption boxes; each photo once; only photos on this phone; at most 6', () => {
    const photos = Array.from({ length: 12 }, (_, i) => photo(i, i !== 3));
    const page = { slotFills: [2, 3, null, 2, 5], textSlotFills: [7, 5, 1] } as unknown as AlbumPage;
    expect(pagePhotoUris(page, photos)).toEqual(['content://media/2', 'content://media/5', 'content://media/7', 'content://media/1']);
    const busy = { slotFills: [0, 1, 2, 4, 5, 6, 7, 8] } as unknown as AlbumPage;
    expect(pagePhotoUris(busy, photos)).toHaveLength(MAX_PAGE_PHOTOS);
    expect(pagePhotoUris(null, photos)).toEqual([]);
  });
});

function deps(over: Partial<PhotoQuoteDeps> & { answer?: { status: number; body?: unknown; bad?: boolean } } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const d: PhotoQuoteDeps = {
    token: over.token ?? (async () => 'tok'),
    shrink: over.shrink ?? (async (u) => `b64:${u}`),
    fetch: over.fetch ?? (async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      const a = over.answer ?? { status: 200, body: { lines: ['a'] } };
      return { status: a.status, ok: a.status < 300, json: async () => { if (a.bad) throw new Error('not json'); return a.body; } };
    }),
  };
  return { d, calls };
}

describe('asking for lines (lib/photoQuotes writeLinesForPhotos)', () => {
  it('signed out: asks for the sign-in and sends nothing', async () => {
    const { d, calls } = deps({ token: async () => null });
    expect(await writeLinesForPhotos(d, ['u1'], 'Wedding')).toEqual({ error: 'sign_in' });
    expect(calls).toHaveLength(0);
  });

  it("posts the website's body to the website's endpoint by its full address", async () => {
    const { d, calls } = deps({ answer: { status: 200, body: { lines: ['One', 2, 'Two'], left: 12 } } });
    expect(await writeLinesForPhotos(d, ['u1', 'u2'], 'Wedding', ['Old'], 64)).toEqual({ lines: ['One', 'Two'], left: 12 });
    expect(calls).toEqual([{ url: 'https://megyprints.vercel.app/api/photo-quotes', body: { photos: ['b64:u1', 'b64:u2'], theme: 'Wedding', avoid: ['Old'], maxChars: 64 } }]);
    expect(PHOTO_QUOTES_URL.startsWith('https://')).toBe(true);
    // No room measured: no maxChars (the server's caption cap).
    await writeLinesForPhotos(d, ['u1'], 'Wedding');
    expect(calls[1].body).toEqual({ photos: ['b64:u1'], theme: 'Wedding', avoid: [] });
  });

  it('every answer becomes one the picker has words for, and it never throws', async () => {
    const cases: [{ status: number; body?: unknown; bad?: boolean }, unknown][] = [
      [{ status: 401, body: {} }, { error: 'sign_in' }],
      [{ status: 429, body: { error: 'limit_all' } }, { error: 'limit_all' }],
      [{ status: 429, body: {} }, { error: 'limit_user' }],
      [{ status: 503, body: {} }, { error: 'failed' }],
      [{ status: 200, body: { lines: [], reason: 'refused' } }, { error: 'refused' }],
      [{ status: 200, body: { lines: [] } }, { error: 'failed' }],
      [{ status: 200, bad: true }, { error: 'failed' }],
    ];
    for (const [answer, want] of cases) expect(await writeLinesForPhotos(deps({ answer }).d, ['u'], 't')).toEqual(want);
    expect(await writeLinesForPhotos(deps({ fetch: async () => { throw new Error('offline'); } }).d, ['u'], 't')).toEqual({ error: 'failed' });
    expect(await writeLinesForPhotos(deps({ shrink: async () => { throw new Error('photo gone'); } }).d, ['u'], 't')).toEqual({ error: 'failed' });
  });
});

describe('back from the sign-in the picker asked for', () => {
  afterEach(() => forgetResume());
  it('opens again on that box, once, only signed in and on that page, within 10 minutes', () => {
    askToResume({ pageIndex: 3, target: { kind: 'box', boxIndex: 1 } }, 1000);
    expect(takeResume(3, false, 2000)).toBeNull();
    expect(takeResume(2, true, 2000)).toBeNull();
    expect(takeResume(3, true, 2000)).toEqual({ kind: 'box', boxIndex: 1 });
    expect(takeResume(3, true, 3000)).toBeNull();
    askToResume({ pageIndex: 3, target: { kind: 'slot', slotIndex: 0 } }, 0);
    expect(takeResume(3, true, 11 * 60 * 1000)).toBeNull();
  });
});

describe('"Any color"', () => {
  it('offers 42 different shades, takes a colour code however it is typed, and ticks in a colour that shows', () => {
    expect(ANY_COLORS).toHaveLength(42);
    expect(new Set(ANY_COLORS).size).toBe(42);
    expect(ANY_COLORS.every((c) => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
    expect(hslHex(0, 1, 0.5)).toBe('#FF0000');
    expect(parseColourCode('3a6ea5')).toBe('#3A6EA5');
    expect(parseColourCode(' #fff ')).toBe('#FFFFFF');
    expect(parseColourCode('blue')).toBeNull();
    expect(parseColourCode('#12345')).toBeNull();
    expect(tickOn('#FFFFFF')).toBe('#2D2D2D');
    expect(tickOn('#1A1A1A')).toBe('#FFFFFF');
  });
});

describe('what the words part adds to the editor', () => {
  it('its taps, its "Add to this box" lines, its tool and its sheets, in the website’s order', () => {
    const part = editorParts().find((p) => p.id === 'text')!;
    expect(part.taps?.map((t) => [...t.kinds])).toEqual([['boxText', 'slotText', 'freeText', 'emptyBox']]);
    expect(part.addChoices?.map((c) => [c.id, c.order, [...c.kinds]])).toEqual([
      ['quote', ORDER.addChoices.quote, ['emptySlot', 'emptyBox']],
      ['text', ORDER.addChoices.text, ['emptySlot', 'emptyBox']],
    ]);
    expect(part.tools?.map((t) => [t.id, t.label, t.order])).toEqual([['pageColour', 'Page colour', ORDER.tools.pageColour]]);
    expect(Object.keys(part.sheets ?? {}).sort()).toEqual(['edit', 'pageColour', 'quotes']);
    // Its two banners show nothing (they reopen the quotes after a sign-in, and fetch a page's fonts).
    expect(part.banners?.map((b) => b.id)).toEqual(['text-resume-quote', 'text-page-fonts']);
  });
});
