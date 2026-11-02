/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES, WALKED (Phase 6: src/app/memories.tsx): the QR memories
   printed in your albums, the website's My Memories page on the phone.
     • every memory, newest first: the address its printed QR opens, its
       scans, how long a video is kept ("Live until …", "Hosting ended …"),
       a longer term waiting on payment, in the website's words;
     • a link memory: "Points to", changed and saved (the same printed QR,
       a new place to go), the website's words when the link isn't allowed;
     • a video memory: it plays here; "Replace video" puts a new video
       behind the same QR (a new address, so phones that played the old one
       don't keep showing it); the website's words when it can't;
     • "Delete" asks first, saying where the QR is, then takes it off the
       account's albums; "Keep it" keeps it;
     • "Share link" shares the QR's address;
     • not signed in: the way to sign in.
   The database is a stand-in (helpers/fakeMemories.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';
import Memories from '../src/app/memories';
import { mem, resetMemories } from './helpers/fakeMemories';

const mockAuth: { session: { user: { id: string } } | null } = { session: { user: { id: 'user-1' } } };
const mockRouter = { push: jest.fn() };
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeMemories').memoriesClient, supabaseConfigured: true, supabaseUrl: 'https://example.supabase.co' }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockRouter.push(...a) } }));
const mockPicks: unknown[] = [];
jest.mock('../src/editor/memories/pickVideo', () => ({ pickVideoFromPhone: async () => mockPicks.shift() ?? null }));
jest.mock('../src/editor/memories/VideoPreview', () => ({ VideoPreview: ({ uri, testID }: { uri: string; testID?: string }) => jest.requireActual('react').createElement('VideoPreview', { uri, testID }) }));
const mockUploads: unknown[] = [];
const mockUploadError = { value: null as string | null };
jest.mock('../src/lib/memories/clipStore', () => ({
  clipStore: { uploadClip: async (c: unknown) => { if (mockUploadError.value) throw new Error(mockUploadError.value); mockUploads.push(c); } },
}));

const CLIP = 'https://example.supabase.co/storage/v1/object/public/memory-clips/wxyz6789.mp4';
const ROWS = [
  { code: 'abcd2345', destination: 'https://youtu.be/one', title: null, scan_count: 3, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', kind: 'link', expires_at: null, user_id: 'user-1' },
  { code: 'wxyz6789', destination: CLIP, title: null, scan_count: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', kind: 'clip', expires_at: '2031-10-01T00:00:00Z', user_id: 'user-1' },
  { code: 'oldc2345', destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/oldc2345.mp4', title: null, scan_count: 0, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z', kind: 'clip', expires_at: '2025-01-01T00:00:00Z', user_id: 'user-1' },
];

let share: jest.SpyInstance;
let openUrl: jest.SpyInstance;
beforeEach(() => {
  resetMemories();
  mem.memories = ROWS.map((r) => ({ ...r }));
  mockAuth.session = { user: { id: 'user-1' } };
  mockRouter.push.mockClear();
  mockPicks.length = 0;
  mockUploads.length = 0;
  mockUploadError.value = null;
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => { share.mockRestore(); openUrl.mockRestore(); });

async function open() {
  await render(<Memories />);
  await screen.findByTestId('memory-abcd2345');
}

describe('My Memories', () => {
  it('every memory, newest first, with its QR\'s address, its scans and how long a video is kept', async () => {
    await open();
    expect(screen.getByText('Each QR printed in your album points here. Re-point it anytime — the printed code stays the same, the video updates. No reprint.')).toBeOnTheScreen();
    const order = screen.getAllByTestId(/^memory-[a-z0-9]{8}$/).map((n) => n.props.testID);
    expect(order).toEqual(['memory-wxyz6789', 'memory-abcd2345', 'memory-oldc2345']);
    expect(screen.getByTestId('memory-address-abcd2345')).toHaveTextContent('https://megyprints.vercel.app/m/abcd2345');
    expect(screen.getByTestId('memory-scans-abcd2345')).toHaveTextContent('3 scans');
    expect(screen.getByTestId('memory-scans-wxyz6789')).toHaveTextContent('1 scan');
    expect(screen.getByTestId('memory-term-wxyz6789')).toHaveTextContent('Live until October 2031');
    expect(screen.getByTestId('memory-term-oldc2345')).toHaveTextContent('Hosting ended January 2025 — renew to bring it back');
  });

  it('a longer term bought with an order not confirmed yet: said, as on the website', async () => {
    mem.orders = [{ user_id: 'user-1', status: 'pending_payment', order_number: 'MP-2026-WAIT001', hosting_years: 10, album_snapshot: { pages: [{ qrFills: [{ code: 'wxyz6789' }] }] } }];
    await open();
    expect(await screen.findByTestId('memory-pending-wxyz6789')).toHaveTextContent('Your 10-year term (to October 2036) starts once we confirm your payment for order MP-2026-WAIT001.');
  });

  it('a link memory: changed and saved; the same QR, a new place to go', async () => {
    await open();
    expect(screen.queryByTestId('memory-save-abcd2345')).toBeNull(); // nothing changed: no Save
    await fireEvent.changeText(screen.getByTestId('memory-dest-abcd2345'), 'https://youtu.be/two');
    await fireEvent.press(screen.getByTestId('memory-save-abcd2345'));
    expect(await screen.findByText('Re-pointed ✓ — same QR, new video')).toBeOnTheScreen();
    expect(mem.memories.find((r) => r.code === 'abcd2345')?.destination).toBe('https://youtu.be/two');
  });

  it('a link that isn\'t allowed: the website\'s words, nothing saved', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('memory-dest-abcd2345'), 'https://evil.example/x');
    await fireEvent.press(screen.getByTestId('memory-save-abcd2345'));
    expect(await screen.findByText('Supported: YouTube, Vimeo, Spotify, Instagram, Facebook, TikTok, Google Drive/Photos.')).toBeOnTheScreen();
    expect(mem.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('a video memory plays here; "Replace video": the same QR, the new video at a new address', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_762_000_000_000);
    try {
      await open();
      expect(screen.queryByTestId('memory-dest-wxyz6789')).toBeNull();
      expect(screen.getByTestId('memory-video-wxyz6789').props.uri).toBe(CLIP);
      mockPicks.push({ uri: 'file:///cache/new.mp4', name: 'new.mp4', size: 5_000_000, type: 'video/mp4', durationSec: 30 });
      await fireEvent.press(screen.getByTestId('memory-replace-wxyz6789'));
      expect(await screen.findByText('Video replaced ✓ — same QR, new memory')).toBeOnTheScreen();
      expect(mockUploads).toEqual([expect.objectContaining({ code: 'wxyz6789', ext: 'mp4', uri: 'file:///cache/new.mp4', replace: true })]);
      const next = `${CLIP}?v=1762000000000`;
      expect(mem.memories.find((r) => r.code === 'wxyz6789')?.destination).toBe(next);
      expect(screen.getByTestId('memory-video-wxyz6789').props.uri).toBe(next);
    } finally {
      now.mockRestore();
    }
  });

  it('"Replace video" that can\'t: the website\'s words, the memory as it was', async () => {
    await open();
    mockPicks.push({ uri: 'file:///cache/long.mp4', name: 'long.mp4', size: 5_000_000, type: 'video/mp4', durationSec: 300 });
    await fireEvent.press(screen.getByTestId('memory-replace-wxyz6789'));
    expect(await screen.findByText('That video is 300 seconds — memories are up to 2 minutes. Trim it to the best moment.')).toBeOnTheScreen();
    mockUploadError.value = 'Could not upload your memory video (offline).';
    mockPicks.push({ uri: 'file:///cache/ok.mp4', name: 'ok.mp4', size: 5_000_000, type: 'video/mp4', durationSec: 30 });
    await fireEvent.press(screen.getByTestId('memory-replace-wxyz6789'));
    expect(await screen.findByText('Could not upload your memory video (offline).')).toBeOnTheScreen();
    expect(mem.memories.find((r) => r.code === 'wxyz6789')?.destination).toBe(CLIP);
  });

  it('"Delete" asks first, saying where the QR is; "Keep it" keeps it; "Delete the video" takes it off the albums', async () => {
    mem.albums = [{
      id: 'a1', user_id: 'user-1', title: 'HK Trip', album_type: 'standard', album_size: '8x8', selected_template: 'classic', photos_per_page: null,
      pages: [{ id: 'p1', qrFills: [null] }, { id: 'p2', qrFills: [{ code: 'abcd2345' }] }], photos: [], cover_photo: null, cover_front: null, occasion: 'Trip', updated_at: '2026-11-01T00:00:00.000Z',
    }];
    await open();
    await fireEvent.press(screen.getByTestId('memory-delete-abcd2345'));
    expect(await screen.findByText('It comes off page 2 of “HK Trip” too, so the next order doesn\'t print or charge it. Delete it?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('memory-delete-keep-abcd2345'));
    expect(screen.queryByTestId('memory-delete-ask-abcd2345')).toBeNull();
    expect(mem.memories.some((r) => r.code === 'abcd2345')).toBe(true);
    await fireEvent.press(screen.getByTestId('memory-delete-abcd2345'));
    await screen.findByTestId('memory-delete-warning-abcd2345');
    await fireEvent.press(await screen.findByText('Delete the video'));
    expect(await screen.findByTestId('memory-deleted')).toHaveTextContent('Deleted. Its QR came off page 2 of “HK Trip”.');
    expect(screen.queryByTestId('memory-abcd2345')).toBeNull();
    expect(mem.memories.some((r) => r.code === 'abcd2345')).toBe(false);
    expect((mem.albums[0].pages as { qrFills: unknown[] }[])[1].qrFills).toEqual([null]);
  });

  it('a delete that can\'t: the website\'s words, the memory kept', async () => {
    await open();
    mem.deleteError = { message: 'denied' };
    await fireEvent.press(screen.getByTestId('memory-delete-abcd2345'));
    await screen.findByText('This QR isn’t in any of your albums or orders. Delete it?');
    await fireEvent.press(screen.getByText('Delete the video'));
    expect(await screen.findByText('Could not delete. Try again.')).toBeOnTheScreen();
    expect(screen.getByTestId('memory-abcd2345')).toBeOnTheScreen();
  });

  it('the words are the website\'s (MyMemories.tsx)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src/pages/MyMemories.tsx'), 'utf8') as string;
    for (const w of ['Video replaced ✓ — same QR, new memory', 'Uploaded, but could not re-point the QR. Try again.', 'Could not replace the video.', 'Could not delete. Try again.']) expect(src).toContain(`'${w}'`);
    for (const w of ['Replace video', 'Delete the video', 'Keep it', 'Delete']) expect(src).toContain(` ${w}\n`);
    expect(src).toContain("{confirmDel || 'Checking where this QR is\\u2026'}");
    expect(src).toContain('const next = versionedClipUrl(row.code, v.ext, Date.now());');
    expect(src).toContain('await uploadClip(row.code, v.ext, f, { replace: true });');
  });

  it('"Share link" shares the address its printed QR opens', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('memory-share-abcd2345'));
    expect(share).toHaveBeenCalledWith({ message: 'https://megyprints.vercel.app/m/abcd2345' });
  });

  it('none yet: said', async () => {
    mem.memories = [];
    await render(<Memories />);
    expect(await screen.findByTestId('memories-none')).toHaveTextContent('No QR memories yet.');
  });

  it('not signed in: the way to sign in, nothing read', async () => {
    mockAuth.session = null;
    await render(<Memories />);
    await fireEvent.press(await screen.findByTestId('memories-sign-in'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/sign-in', params: { then: 'back' } });
    expect(mem.calls).toHaveLength(0);
  });
});
