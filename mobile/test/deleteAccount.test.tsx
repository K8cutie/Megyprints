/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Delete my account must say what the website says
   (src/components/DeleteAccountSection.tsx), read the same preflight, and
   call the website's own endpoint (api/delete-account.mjs) exactly as the
   website does: the same POST, the same headers, the same body, by its full
   address. NOTHING HERE REACHES A NETWORK: fetch is a jest stand-in that
   writes down the call and answers what the test says, and the global fetch
   fails the test if anything else calls it.
   ══════════════════════════════════════════════════════════════════════════ */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockingSentence, readPreflight, type DeletionFetch, type DeletionPreflight } from '@web/lib/accountDeletionRules';
import DeleteAccount from '../src/app/delete-account';
import {
  DELETE_BY_EMAIL,
  DeleteByEmailError,
  deleteAccountEndpoint,
  deleteAccountFromApp,
  EMAIL_DELETE_URL,
  hostedUntilMonth,
  isLocalServer,
  LIVE_DELETE_ACCOUNT_URL,
  OFFLINE,
} from '../src/lib/account/deleteAccount';
import * as words from '../src/lib/account/deletionWords';
import { answers, calls, resetOrdersFake } from './helpers/fakeOrders';

const mockAuth: { session: { user: { id: string; email: string } } | null } = { session: null };
const mockRouter = { replace: jest.fn(), back: jest.fn() };
const mockBuilder = { reset: jest.fn() };
const mockDraft = { clear: jest.fn(), photos: [] as { source: string; uri: string }[] };
const mockRelease = jest.fn(async (_uris: string[]) => 0);
const mockEnv = { supabaseUrl: 'https://example-project.supabase.co' };

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false }) }));
jest.mock('../src/lib/supabase', () => ({
  supabase: jest.requireActual('./helpers/fakeOrders').ordersClient,
  supabaseConfigured: true,
  get supabaseUrl() { return mockEnv.supabaseUrl; },
}));
jest.mock('../src/builder/BuilderProvider', () => ({ useBuilder: () => ({ builder: mockBuilder }) }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ draft: { photos: mockDraft.photos }, clear: mockDraft.clear }) }));
jest.mock('../modules/photo-files', () => ({ releasePickedFiles: (uris: string[]) => mockRelease(uris) }));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => true, canDismiss: () => false, dismissAll: jest.fn() },
  Redirect: ({ href }: { href: string }) => { const { Text } = jest.requireActual('react-native'); return <Text>{`redirect:${href}`}</Text>; },
}));

const WEB = path.resolve(__dirname, '../..');
const SECTION = readFileSync(path.join(WEB, 'src/components/DeleteAccountSection.tsx'), 'utf8')
  .replace(/\{' '\}/g, ' ').replace(/&apos;/g, "'").replace(/\s+/g, ' ');

/** The only fetch allowed: answers what a test sets and writes the call down. */
const sent: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
let reply: { status: number; body: unknown } | Error = { status: 200, body: { deleted_albums: 2, deleted_memories: 1, anonymized_orders: 1 } };
const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    sent.push({ url: String(url), init: init as never });
    if (reply instanceof Error) throw reply;
    const r = reply;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; });

const PRE: DeletionPreflight = { albums: 2, memories: 1, orders: 3, videos: 0, videos_hosted_until: null, blocking: [] };

beforeEach(() => {
  resetOrdersFake();
  sent.length = 0;
  reply = { status: 200, body: { deleted_albums: 2, deleted_memories: 1, anonymized_orders: 3, deleted_videos: 0 } };
  mockAuth.session = { user: { id: 'user-1', email: 'maria@example.test' } };
  mockEnv.supabaseUrl = 'https://example-project.supabase.co';
  delete process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL;
  mockRouter.replace.mockReset(); mockRouter.back.mockReset();
  mockBuilder.reset.mockReset(); mockDraft.clear.mockReset(); mockRelease.mockClear();
  mockDraft.photos = [{ source: 'files', uri: 'content://docs/1' }, { source: 'gallery', uri: 'content://media/2' }];
  answers.rpc.account_deletion_preflight = { data: PRE, error: null };
});

describe("Delete my account: the website's words", () => {
  it('the section, the title, the list, what is kept, the buttons and the end', () => {
    for (const w of [words.SECTION_TEXT, words.DIALOG_TITLE, words.LIST_LEAD, words.KEEP, words.DELETE_FOREVER, words.DELETING, words.DONE_TITLE, words.DONE_TEXT]) {
      expect(SECTION).toContain(w);
    }
    expect(SECTION).toContain(`>${words.SECTION_TITLE}</h3>`);
    expect(SECTION).toContain(`'${words.LOAD_FAILED}'`);
    expect(SECTION).toContain("const CONFIRM_WORD = 'DELETE';");
    expect(SECTION).toContain("typed.trim().toUpperCase() === CONFIRM_WORD");
    expect(SECTION).toContain("Type <b className=\"text-ink-warm\">{CONFIRM_WORD}</b> to confirm.");
    expect(SECTION).toContain("{blocked ? 'Close' : 'Keep my account'}");
    expect(SECTION).toContain("const CONTACT = 'megyprintsph@gmail.com';");
    // The list, line by line (each line's fixed words, around the counts).
    expect(SECTION).toContain('<li>your sign-in and profile</li>');
    expect(SECTION).toContain("saved album{preflight?.albums === 1 ? '' : 's'} and the photos in them");
    expect(SECTION).toContain("QR memory link{preflight?.memories === 1 ? '' : 's'} — printed codes will stop working");
    expect(SECTION).toContain("memory video{videos === 1 ? '' : 's'} — deleted from our servers");
    expect(SECTION).toContain(', even though hosting runs until <b>{hostedUntil}</b>');
    expect(SECTION).toContain('<li>every print file we hold for your past orders, and any payment receipt you attached</li>');
    expect(SECTION).toContain("We keep a receipt-only record of your {preflight?.orders} past order {preflight?.orders === 1 ? '' : 's'} — order number, amount and status — because Philippine tax rules require it. Your name, phone number and address are erased from it, and it's no longer linked to you.");
    expect(SECTION).toContain("We need your details to finish it, so we can't delete the account while it's in progress.");
    expect(SECTION).toContain("Once it's done you can delete the account here. To cancel it instead, email");
  });

  it('the counts, one and many, and the hosting month (Manila time, the website\'s toLocaleDateString)', () => {
    expect(words.deletionItems(PRE)).toEqual([
      'your sign-in and profile',
      '2 saved albums and the photos in them',
      '1 QR memory link — printed codes will stop working',
      'every print file we hold for your past orders, and any payment receipt you attached',
    ]);
    const one = readPreflight({ albums: 1, memories: 0, orders: 1, videos: 1, videos_hosted_until: '2031-10-31T16:30:00Z' });
    expect(words.deletionItems(one)).toEqual([
      'your sign-in and profile',
      '1 saved album and the photos in them',
      '0 QR memory links — printed codes will stop working',
      '1 memory video — deleted from our servers, even though hosting runs until November 2031',
      'every print file we hold for your past orders, and any payment receipt you attached',
    ]);
    expect(words.keptNote(one)).toBe("We keep a receipt-only record of your 1 past order — order number, amount and status — because Philippine tax rules require it. Your name, phone number and address are erased from it, and it's no longer linked to you.");
    expect(words.keptNote({ ...PRE, orders: 0 })).toBe('');
    expect(SECTION).toContain("d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })");
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Manila';
    try {
      for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2036, 0, 1); t += 3 * 86_400_000 + 7 * 3_600_000) {
        const iso = new Date(t).toISOString();
        expect(hostedUntilMonth(iso)).toBe(new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }));
      }
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
    expect(hostedUntilMonth(null)).toBe('');
  });

  it("an order or booking that is paid and not finished blocks it, named the shared way", () => {
    const blocked = readPreflight({ ...PRE, blocking: [{ order_number: 'MP-2026-PAID001', status: 'in_production' }] });
    expect(words.blockedWords(blocked).first).toBe(`${blockingSentence(blocked.blocking).lead} — MP-2026-PAID001. We need your details to finish it, so we can't delete the account while it's in progress.`);
    expect(words.blockedWords(blocked).first.startsWith('You have an order that’s paid and not delivered yet — ')).toBe(true);
    expect(words.blockedWords(blocked).second).toBe("Once it's done you can delete the account here. To cancel it instead, email megyprintsph@gmail.com.");
  });
});

describe("the call: the website's endpoint, the website's request", () => {
  it('a build on the live server uses the website\'s endpoint by its full address; a local build never does', () => {
    expect(LIVE_DELETE_ACCOUNT_URL).toBe('https://megyprints.vercel.app/api/delete-account');
    expect(deleteAccountEndpoint('https://lvbsrbmikunynphlbckt.supabase.co', undefined)).toEqual({ url: LIVE_DELETE_ACCOUNT_URL });
    for (const local of ['http://127.0.0.1:59321', 'http://10.0.2.2:59321', 'http://localhost:54321', 'http://api.megy.test']) {
      expect(isLocalServer(local)).toBe(true);
      expect('problem' in deleteAccountEndpoint(local, undefined)).toBe(true);
      expect(deleteAccountEndpoint(local, ' http://10.0.2.2:59390/api/delete-account ')).toEqual({ url: 'http://10.0.2.2:59390/api/delete-account' });
    }
    expect(isLocalServer('https://megyprints.vercel.app')).toBe(false);
    expect(isLocalServer('not a url')).toBe(false);
  });

  it("sends exactly what the website's deleteMyAccount sends (method, headers, body), with the sign-in token", async () => {
    // The website's own function, with its database and browser storage stand-ins.
    const g = global as unknown as Record<string, unknown>;
    const store = () => ({ length: 0, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    g.localStorage = store(); g.sessionStorage = store();
    g.indexedDB = { deleteDatabase: () => { const r: Record<string, () => void> = {}; setTimeout(() => r.onsuccess?.(), 0); return r; } };
    try {
      let web: { deleteMyAccount: () => Promise<unknown> } | undefined;
      jest.isolateModules(() => {
        jest.doMock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeOrders').webSupabaseModule);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        web = require('@web/lib/accountDeletion');
      });
      const webResult = await web!.deleteMyAccount();
      const appResult = await deleteAccountFromApp({
        endpoint: LIVE_DELETE_ACCOUNT_URL,
        token: async () => 'token-abc',
        fetch: (u, i) => fetch(u, i) as never,
        wipe: async () => {},
        signOut: async () => {},
      });
      expect(sent).toHaveLength(2);
      expect(sent[0].url).toBe('/api/delete-account');
      expect(sent[1].url).toBe('https://megyprints.vercel.app/api/delete-account');
      expect(sent[1].init).toEqual(sent[0].init);
      expect(sent[1].init).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-abc' }, body: '{}' });
      expect(appResult).toEqual(webResult);
    } finally {
      delete g.localStorage; delete g.sessionStorage; delete g.indexedDB;
    }
  });

  it('the server\'s own refusal is shown as it is; its abuse guard and a lost connection get plain words; no sign-in sends nothing', async () => {
    const deps = (over: Partial<Parameters<typeof deleteAccountFromApp>[0]> = {}) => ({
      endpoint: LIVE_DELETE_ACCOUNT_URL, token: async () => 'token-abc', fetch: ((u, i) => fetch(u, i)) as DeletionFetch,
      wipe: jest.fn(async () => {}), signOut: jest.fn(async () => {}), ...over,
    });
    reply = { status: 409, body: { error: 'Order MP-2026-PAID001 is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.' } };
    const d1 = deps();
    await expect(deleteAccountFromApp(d1)).rejects.toThrow('Order MP-2026-PAID001 is paid and not yet delivered');
    expect(d1.wipe).not.toHaveBeenCalled();
    expect(d1.signOut).not.toHaveBeenCalled();

    for (const guard of ['origin not allowed', 'too many requests']) {
      reply = { status: guard === 'origin not allowed' ? 403 : 429, body: { error: guard } };
      await expect(deleteAccountFromApp(deps())).rejects.toBeInstanceOf(DeleteByEmailError);
    }
    expect(DELETE_BY_EMAIL).toContain('megyprintsph@gmail.com');
    expect(EMAIL_DELETE_URL).toBe('mailto:megyprintsph@gmail.com?subject=Delete%20my%20account');

    reply = new TypeError('Network request failed');
    await expect(deleteAccountFromApp(deps())).rejects.toThrow(OFFLINE);

    reply = { status: 500, body: 'not json' };
    await expect(deleteAccountFromApp(deps())).rejects.toThrow('Deletion failed. Please try again.');

    const before = sent.length;
    await expect(deleteAccountFromApp(deps({ token: async () => null }))).rejects.toThrow('You are not signed in.');
    expect(sent.length).toBe(before);
  });
});

describe('the screen', () => {
  it('reads first, shows the real counts, and deletes only after DELETE is typed; then lets go of the album on the phone and signs out', async () => {
    jest.useFakeTimers();
    try {
      await render(<DeleteAccount />);
      expect(await screen.findByText('2 saved albums and the photos in them')).toBeTruthy();
      expect(calls.rpcs).toEqual([{ name: 'account_deletion_preflight', args: undefined }]);
      expect(screen.getByTestId('delete-kept').props.children).toContain('your 3 past orders');

      // Never greyed out: a tap before DELETE is typed says what is missing, and sends nothing.
      await fireEvent.press(screen.getByTestId('delete-forever'));
      expect(screen.getByTestId('delete-error').props.children).toBe('Type DELETE in the box first.');
      await fireEvent.changeText(screen.getByTestId('delete-typed'), 'delet');
      await fireEvent.press(screen.getByTestId('delete-forever'));
      expect(sent).toHaveLength(0);

      await fireEvent.changeText(screen.getByTestId('delete-typed'), ' delete ');
      await fireEvent.press(screen.getByTestId('delete-forever'));
      expect(sent).toEqual([{ url: 'https://megyprints.vercel.app/api/delete-account', init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-abc' }, body: '{}' } }]);
      expect(await screen.findByText('Your account is deleted')).toBeTruthy();
      expect(screen.getByText('Your albums, photos, videos and memory links are gone. Thanks for using Megy Prints.')).toBeTruthy();
      // On the phone: the photo grants of "Choose from Files" photos, the album, the sign-in.
      expect(mockRelease).toHaveBeenCalledWith(['content://docs/1']);
      expect(mockBuilder.reset).toHaveBeenCalledTimes(1);
      expect(mockDraft.clear).toHaveBeenCalledTimes(1);
      expect(calls.auth.filter((c) => c.fn === 'signOut')).toEqual([{ fn: 'signOut', args: [{ scope: 'local' }] }]);
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(2200); });
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a paid order not delivered yet: says so, names it, and offers only Close', async () => {
    answers.rpc.account_deletion_preflight = { data: { ...PRE, blocking: [{ order_number: 'MP-2026-PAID001', status: 'in_production' }] }, error: null };
    await render(<DeleteAccount />);
    expect((await screen.findByTestId('delete-blocked')).props.children).toContain('MP-2026-PAID001');
    expect(screen.queryByTestId('delete-forever')).toBeNull();
    await fireEvent.press(screen.getByTestId('delete-close'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("the server refuses: its message, nothing let go of on the phone; its guard: the email way", async () => {
    reply = { status: 409, body: { error: 'This is a shop owner account, so it cannot be deleted from the app. Deleting it would lock the shop out of its own console.' } };
    await render(<DeleteAccount />);
    await screen.findByTestId('delete-list');
    await fireEvent.changeText(screen.getByTestId('delete-typed'), 'DELETE');
    await fireEvent.press(screen.getByTestId('delete-forever'));
    expect((await screen.findByTestId('delete-error')).props.children).toBe('This is a shop owner account, so it cannot be deleted from the app. Deleting it would lock the shop out of its own console.');
    expect(mockBuilder.reset).not.toHaveBeenCalled();
    expect(calls.auth.filter((c) => c.fn === 'signOut')).toEqual([]);
    expect(screen.queryByTestId('delete-by-email')).toBeNull();

    reply = { status: 403, body: { error: 'origin not allowed' } };
    await fireEvent.press(screen.getByTestId('delete-forever'));
    expect((await screen.findByTestId('delete-error')).props.children).toBe(DELETE_BY_EMAIL);
    expect(screen.getByTestId('delete-by-email')).toBeTruthy();
  });

  it('a build on a local server without a local endpoint refuses, and sends nothing', async () => {
    mockEnv.supabaseUrl = 'http://10.0.2.2:59321';
    await render(<DeleteAccount />);
    await screen.findByTestId('delete-list');
    await fireEvent.changeText(screen.getByTestId('delete-typed'), 'DELETE');
    await fireEvent.press(screen.getByTestId('delete-forever'));
    expect((await screen.findByTestId('delete-error')).props.children).toBe('This test build uses a test copy of the shop, so it cannot delete accounts through the website.');
    expect(sent).toHaveLength(0);
  });

  it('the preflight fails: says so, with Try again (nothing to delete blind)', async () => {
    answers.rpc.account_deletion_preflight = { data: null, error: { message: 'Network request failed' } };
    await render(<DeleteAccount />);
    expect((await screen.findByTestId('delete-load-failed')).props.children.join('')).toBe('Could not load your account details. Network request failed');
    expect(screen.queryByTestId('delete-forever')).toBeNull();
    answers.rpc.account_deletion_preflight = { data: PRE, error: null };
    await fireEvent.press(screen.getByTestId('delete-retry'));
    expect(await screen.findByTestId('delete-list')).toBeTruthy();
  });
});
