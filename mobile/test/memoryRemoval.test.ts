/* ══════════════════════════════════════════════════════════════════════════
   DELETING A MEMORY (src/lib/memories/removal.ts), beside the website's own
   src/lib/memoryRemoval.ts on the same stand-in database
   (helpers/fakeMemories.ts):
     • where the QR is (albums and pages, orders that printed it) and the
       question's words: the same answers;
     • a confirmed delete: the row first, then the QR off every album that
       carries it, each on its own version (once more after another device
       saved), the same writes as the website's; the row can't go: nothing
       else changes;
     • the line after it.
   (The website also fixes its browser's draft; the app has none.)
   ══════════════════════════════════════════════════════════════════════════ */
import { deletedNotice, deleteMemoryEverywhere, memoryDeleteWarning, memoryPlaces, pagesWithMemory, withoutMemory } from '../src/lib/memories/removal';
import { mem, memoriesClient, resetMemories } from './helpers/fakeMemories';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeMemories').webSupabaseModule);
jest.mock('@web/lib/localDraft', () => ({ DRAFT_STORAGE_KEY: 'megy-test-no-draft' }));
jest.mock('@web/lib/useAlbumSync', () => {
  const cloud = jest.requireActual('@web/lib/albumCloud');
  const { memoriesClient: client } = jest.requireActual('./helpers/fakeMemories');
  return { ...cloud, saveAlbumRow: (u: string, d: unknown, o: unknown) => cloud.saveAlbumRowWith(client, u, d, o) };
});
type AnyFn = (...args: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const web = require('@web/lib/memoryRemoval') as Record<string, AnyFn>;
const client = memoriesClient as never;

const qr = (code: string) => ({ code, destination: `https://x/${code}`, qrPngDataUrl: 'data:QR', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind: 'clip' });
function album(id: string, title: string, pages: unknown[]) {
  return {
    id, user_id: 'user-1', title, album_type: 'standard', album_size: '8x8', selected_template: 'classic', photos_per_page: null,
    pages, photos: [], cover_photo: null, cover_front: null, occasion: 'Wedding', updated_at: '2026-11-01T00:00:00.000Z',
  };
}
let pageNo = 0;
const page = (over: Record<string, unknown> = {}) => ({ id: `p${++pageNo}`, templateId: 't', slotFills: [0], ...over });

function seed() {
  resetMemories();
  pageNo = 0;
  mem.memories = [{ code: 'abcd2345', destination: 'https://x/abcd2345', kind: 'clip', user_id: 'user-1' }, { code: 'keep2345', destination: 'https://x/keep', kind: 'link', user_id: 'user-1' }];
  mem.albums = [
    album('a1', 'HK Trip', [page(), page(), page({ qrFills: [qr('abcd2345'), null] }), ...Array.from({ length: 36 }, () => page()), page({ textSlotQr: [qr('abcd2345')], textSlotQrGeom: [{ x: 1 }] })]),
    album('a2', 'Debut', [page({ qrFills: [qr('keep2345')] })]),
    album('a3', '', [page({ qrFills: [null, qr('abcd2345')] })]),
  ];
  mem.orders = [
    { user_id: 'user-1', order_number: 'MP-2026-AAA', status: 'paid', album_snapshot: { pages: [{ qrFills: [{ code: 'abcd2345' }] }] } },
    { user_id: 'user-1', order_number: 'MP-2026-BBB', status: 'cancelled', album_snapshot: { pages: [{ qrFills: [{ code: 'abcd2345' }] }] } },
  ];
}
const strip = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('where the QR is, and the question: the website\'s', () => {
  it('the pages, the pages without it: the same answers', () => {
    seed();
    for (const a of mem.albums) {
      expect(pagesWithMemory(a.pages as unknown[], 'abcd2345')).toEqual(web.pagesWithMemory(a.pages, 'abcd2345'));
      expect(withoutMemory(a.pages as unknown[], 'abcd2345')).toEqual(web.withoutMemory(a.pages, 'abcd2345'));
    }
    expect(pagesWithMemory(mem.albums[0].pages as unknown[], 'abcd2345')).toEqual([3, 40]);
  });

  it('the places and the warning: the same reads and words', async () => {
    seed();
    const w = await web.memoryPlaces('user-1', 'abcd2345');
    const webCalls = strip(mem.calls.splice(0));
    const a = await memoryPlaces(client, 'user-1', 'abcd2345');
    expect(a).toEqual(w);
    expect(strip(mem.calls)).toEqual(webCalls);
    expect(memoryDeleteWarning(a)).toBe(web.memoryDeleteWarning(w));
    expect(memoryDeleteWarning(a)).toBe('This QR is printed in your order MP-2026-AAA. Deleting the video makes that printed QR show “Memory not found”. To change the video, use Replace video instead. It comes off pages 3 and 40 of “HK Trip” and page 1 of “Untitled album” too, so the next order doesn\'t print or charge it. Delete it?');
    const none = { albums: [], orders: [] };
    expect(memoryDeleteWarning(none)).toBe(web.memoryDeleteWarning(none));
  });
});

describe('a confirmed delete: the website\'s writes', () => {
  it('the row, then the QR off each album on its own version', async () => {
    seed();
    const w = await web.deleteMemoryEverywhere('user-1', 'abcd2345');
    const webCalls = strip(mem.calls.splice(0));
    const webAlbums = strip(mem.albums);
    seed();
    const a = await deleteMemoryEverywhere(client, 'user-1', 'abcd2345');
    expect(a).toEqual(w);
    expect(strip(mem.calls)).toEqual(webCalls);
    expect(strip(mem.albums)).toEqual(webAlbums);
    expect(mem.memories.map((m) => m.code)).toEqual(['keep2345']);
    expect(pagesWithMemory(mem.albums[0].pages as unknown[], 'abcd2345')).toEqual([]);
    expect(deletedNotice(a.albums)).toBe('Deleted. Its QR came off pages 3, 40 of “HK Trip” and page 1 of “Untitled album”.');
  });

  it('another device saved in between: once more on a fresh read, as the website does', async () => {
    seed();
    mem.movedOn.add('a1');
    const w = await web.deleteMemoryEverywhere('user-1', 'abcd2345');
    const webCalls = strip(mem.calls.splice(0));
    seed();
    mem.movedOn.add('a1');
    const a = await deleteMemoryEverywhere(client, 'user-1', 'abcd2345');
    expect(a).toEqual(w);
    expect(strip(mem.calls)).toEqual(webCalls);
  });

  it('the row can\'t be deleted: nothing else changes', async () => {
    seed();
    mem.deleteError = { message: 'denied' };
    const before = strip(mem.albums);
    expect(await deleteMemoryEverywhere(client, 'user-1', 'abcd2345')).toEqual({ ok: false, albums: [] });
    expect(strip(mem.albums)).toEqual(before);
  });

  it('the line after it: the website\'s (MyMemories.tsx)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src/pages/MyMemories.tsx'), 'utf8') as string;
    expect(src).toContain("const where = albums.map((a) => `${a.pages.length === 1 ? `page ${a.pages[0]}` : `pages ${a.pages.join(', ')}`} of \\u201c${a.title}\\u201d`).join(' and ');");
    expect(src).toContain("setNotice(`Deleted.${where ? ` Its QR came off ${where}.` : ''}`);");
    expect(deletedNotice([])).toBe('Deleted.');
  });
});
