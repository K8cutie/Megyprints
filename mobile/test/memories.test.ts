/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES' RULES, THE WEBSITE'S (Phase 6: src/lib/memories/memories.ts).

   The website's qrMemories.ts reads the database itself, and qrMemory.ts /
   memoryClips.ts hold their rules next to browser-only code (the QR maker,
   the video upload), so the app keeps a copy of the rules My Memories needs.
   This test holds each copy to the website:
     • the database calls (the list, re-pointing a memory, the terms waiting
       on payment) run beside the WEBSITE's own functions on the same
       stand-in database (helpers/fakeMemories.ts): the same calls, the same
       answers;
     • the pure rules (which links are allowed and the words when one isn't,
       the printed QR's address, a video kept by Megy Prints) are held to the
       website's source, word for word.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_HOSTS, isHostedClip, listMyMemories, MEMORY_BASE, memoryCodesInSnapshot, memoryUrl, pendingTermsByCode, pendingUntil,
  relinkMemory, validateDestination,
} from '../src/lib/memories/memories';
import { mem, memoriesClient, resetMemories } from './helpers/fakeMemories';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeMemories').webSupabaseModule);
type AnyFn = (...args: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const web = require('@web/lib/qrMemories') as Record<string, AnyFn>;

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const client = memoriesClient as never;

const ROWS = [
  { code: 'abcd2345', destination: 'https://youtu.be/one', title: null, scan_count: 3, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', kind: 'link', expires_at: null, user_id: 'user-1' },
  { code: 'wxyz6789', destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/wxyz6789.mp4', title: null, scan_count: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', kind: 'clip', expires_at: '2031-10-01T00:00:00Z', user_id: 'user-1' },
];

beforeEach(() => {
  resetMemories();
  mem.memories = ROWS.map((r) => ({ ...r }));
});

describe('the database calls are the website\'s', () => {
  it('the list: the same read, the same rows (newest first)', async () => {
    const webRows = await web.listMemories();
    const webCalls = mem.calls.splice(0);
    const appRows = await listMyMemories(client);
    expect(appRows).toEqual(webRows);
    expect(mem.calls).toEqual(webCalls);
    expect(appRows.map((r) => r.code)).toEqual(['wxyz6789', 'abcd2345']);
  });

  it('a list that fails: the same error', async () => {
    mem.listError = { message: 'permission denied' };
    await expect(web.listMemories()).rejects.toThrow('permission denied');
    await expect(listMyMemories(client)).rejects.toThrow('permission denied');
  });

  it('re-pointing a memory: the same update; a code with no row is created, as on the website', async () => {
    expect(await web.updateMemoryDestination('abcd2345', 'https://youtu.be/two')).toBe(true);
    const webCalls = mem.calls.splice(0);
    mem.memories = ROWS.map((r) => ({ ...r }));
    expect(await relinkMemory(client, 'abcd2345', 'https://youtu.be/two')).toBe(true);
    expect(mem.calls).toEqual(webCalls);
    expect(mem.memories.find((r) => r.code === 'abcd2345')?.destination).toBe('https://youtu.be/two');
    // No row for this code (added while signed out): inserted, by both.
    mem.calls = [];
    expect(await web.updateMemoryDestination('newc2345', 'https://youtu.be/three')).toBe(true);
    const webInsert = mem.calls.splice(0);
    mem.memories = ROWS.map((r) => ({ ...r })); // as before the website's try
    expect(await relinkMemory(client, 'newc2345', 'https://youtu.be/three')).toBe(true);
    expect(mem.calls).toEqual(webInsert);
    expect(webInsert.map((c) => c.op)).toEqual(['update', 'insert']);
    // A failed update: false, by both.
    mem.updateError = { message: 'nope' };
    expect(await web.updateMemoryDestination('abcd2345', 'https://youtu.be/x')).toBe(false);
    expect(await relinkMemory(client, 'abcd2345', 'https://youtu.be/x')).toBe(false);
  });

  it('the terms waiting on payment: the same read, the same answer', async () => {
    mem.orders = [
      { user_id: 'user-1', status: 'pending_payment', order_number: 'MP-1', hosting_years: 10, album_snapshot: { pages: [{ qrFills: [{ code: 'wxyz6789' }] }] } },
      { user_id: 'user-1', status: 'pending_payment', order_number: 'MP-2', hosting_years: 15, album_snapshot: { pages: [{ textSlotQr: [{ code: 'wxyz6789' }] }] } },
      { user_id: 'user-1', status: 'paid', order_number: 'MP-3', hosting_years: 20, album_snapshot: { pages: [{ qrFills: [{ code: 'wxyz6789' }] }] } },
    ];
    const webTerms = await web.pendingTermsByCode('user-1');
    const webCalls = mem.calls.splice(0);
    const appTerms = await pendingTermsByCode(client, 'user-1');
    expect(appTerms).toEqual(webTerms);
    expect(mem.calls).toEqual(webCalls);
    expect(appTerms).toEqual({ wxyz6789: { years: 15, orderNumber: 'MP-2' } });
  });
});

describe('the pure rules are the website\'s', () => {
  it('the codes in an order\'s album and the term waiting: the same answers on many inputs', () => {
    const snaps = [null, {}, { pages: 'x' }, { pages: [{ qrFills: [{ code: 'abcd2345' }, null, { code: 'BAD!' }] }, { qr_fills: [{ code: 'efgh2345' }], text_slot_qr: [{ code: 'ijkm2345' }] }] }];
    for (const s of snaps) expect(memoryCodesInSnapshot(s)).toEqual(web.memoryCodesInSnapshot(s));
    const rows = [
      { created_at: '2026-10-01T00:00:00Z', expires_at: '2031-10-01T00:00:00Z', kind: 'clip' as const },
      { created_at: '2026-10-01T00:00:00Z', expires_at: null, kind: 'clip' as const },
      { created_at: 'bad', expires_at: null, kind: 'clip' as const },
      { created_at: '2026-10-01T00:00:00Z', expires_at: null, kind: 'link' as const },
    ];
    for (const r of rows) for (const p of [undefined, { years: 5, orderNumber: 'A' }, { years: 10, orderNumber: 'B' }]) {
      expect(pendingUntil(r, p)).toBe(web.pendingUntil(r, p));
    }
  });

  it('which links a memory may point at, and the words when one can\'t: the website\'s (qrMemory.ts)', () => {
    const src = read('src/lib/qrMemory.ts');
    for (const host of ALLOWED_HOSTS) expect(src).toContain(`'${host}'`);
    expect(src.match(/export const ALLOWED_HOSTS = \[([\s\S]*?)\];/)![1].match(/'[^']+'/g)).toHaveLength(ALLOWED_HOSTS.length);
    for (const words of ['Enter a full link, e.g. https://youtu.be/…', 'Link must start with https://', 'Supported: YouTube, Vimeo, Spotify, Instagram, Facebook, TikTok, Google Drive/Photos.']) {
      expect(src).toContain(`'${words}'`);
    }
    expect(validateDestination('youtu.be/x')).toEqual({ error: 'Enter a full link, e.g. https://youtu.be/…' });
    expect(validateDestination('http://youtu.be/x')).toEqual({ error: 'Link must start with https://' });
    expect(validateDestination('https://evil.example/x')).toEqual({ error: 'Supported: YouTube, Vimeo, Spotify, Instagram, Facebook, TikTok, Google Drive/Photos.' });
    expect(validateDestination('  https://www.youtube.com/watch?v=abc ')).toEqual({ url: 'https://www.youtube.com/watch?v=abc' });
    expect(validateDestination('https://m.facebook.com/x')).toEqual({ url: 'https://m.facebook.com/x' });
  });

  it('the printed QR\'s address and a video kept by Megy Prints: the website\'s', () => {
    expect(read('src/lib/qrMemory.ts')).toContain(`'${MEMORY_BASE}'`);
    expect(memoryUrl('abcd2345')).toBe('https://megyprints.vercel.app/m/abcd2345');
    expect(read('src/lib/memoryClips.ts')).toContain('u.origin === b.origin && u.pathname.startsWith(`/storage/v1/object/public/${CLIP_BUCKET}/`)');
    expect(isHostedClip(ROWS[1].destination, 'https://example.supabase.co')).toBe(true);
    expect(isHostedClip('https://youtu.be/one', 'https://example.supabase.co')).toBe(false);
    expect(isHostedClip(ROWS[1].destination, '')).toBe(false);
  });
});
