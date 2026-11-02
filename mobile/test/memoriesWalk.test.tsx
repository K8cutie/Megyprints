/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES, WALKED (Phase 6: src/app/memories.tsx): the QR memories
   printed in your albums, the website's My Memories page on the phone.
     • every memory, newest first: the address its printed QR opens, its
       scans, how long a video is kept ("Live until …", "Hosting ended …"),
       a longer term waiting on payment, in the website's words;
     • a link memory: "Points to", changed and saved (the same printed QR,
       a new place to go), the website's words when the link isn't allowed;
     • a video memory: watch it; changing the video is on the website;
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

  it('a video memory: watch it; changing the video is on the website', async () => {
    await open();
    expect(screen.queryByTestId('memory-dest-wxyz6789')).toBeNull();
    await fireEvent.press(screen.getByTestId('memory-watch-wxyz6789'));
    expect(openUrl).toHaveBeenCalledWith(CLIP);
    await fireEvent.press(screen.getByTestId('memory-website-wxyz6789'));
    expect(openUrl).toHaveBeenCalledWith('https://megyprints.vercel.app/#/memories');
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
