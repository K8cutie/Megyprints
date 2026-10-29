/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: My Profile and Change password, walked with the real
   screens (the database and the sign-in a stand-in). The name is saved the
   website's way (updateUser, full_name); the phone and address come from
   the newest order; Change password is the website's emailed link
   (resetPasswordForEmail, back to the website, as the 1.x Android app
   does), in the website's words; Sign out drops the sign-in and goes to the
   start screen. Every sentence is held against the website's source.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sendLinkErrorText } from '@web/lib/passwordReset';
import ChangePassword from '../src/app/change-password';
import Profile from '../src/app/profile';
import * as pw from '../src/lib/account/passwordLink';
import * as prof from '../src/lib/account/profile';
import { answers, calls, orderRow, resetOrdersFake } from './helpers/fakeOrders';

type Sess = { user: { id: string; email: string; user_metadata: Record<string, unknown> } } | null;
const mockAuth: { session: Sess; signOut: jest.Mock } = { session: null, signOut: jest.fn(async () => {}) };
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: mockAuth.session, loading: false, signOut: mockAuth.signOut }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: jest.requireActual('./helpers/fakeOrders').ordersClient, supabaseConfigured: true, supabaseUrl: 'https://example-project.supabase.co' }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouter.push(...a), replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => true, canDismiss: () => false, dismissAll: jest.fn() },
  Redirect: ({ href }: { href: string }) => { const { Text } = jest.requireActual('react-native'); return <Text>{`redirect:${href}`}</Text>; },
}));

const WEB = path.resolve(__dirname, '../..');
const read = (f: string) => readFileSync(path.join(WEB, f), 'utf8').replace(/\{' '\}/g, ' ').replace(/&apos;/g, "'").replace(/\s+/g, ' ');
const PROFILE_SRC = read('src/pages/Profile.tsx');
const LOGIN_SRC = read('src/pages/auth/LoginModal.tsx');

beforeEach(() => {
  resetOrdersFake();
  mockAuth.session = { user: { id: 'user-1', email: 'maria@example.test', user_metadata: { full_name: 'Maria Santos' } } };
  mockAuth.signOut.mockClear();
  mockRouter.push.mockReset(); mockRouter.replace.mockReset(); mockRouter.back.mockReset();
  answers.orders = [
    orderRow({ id: 'o1', order_number: 'MP-2026-OLD0001', status: 'delivered', created_at: '2026-08-01T01:00:00Z', ship_name: 'Maria Santos', ship_phone: '+639170000000', ship_address: 'Old St, Old Town' }),
    orderRow({ id: 'o2', order_number: 'MP-2026-NEW0002', status: 'pending_payment', created_at: '2026-10-25T01:00:00Z', ship_name: 'Maria Santos', ship_phone: '+639171234567', ship_address: '12 Mabini St, Canlalay, Biñan City, Laguna, 4024' }),
  ];
});

describe("My Profile: the website's words", () => {
  it('every label is the website Profile page\'s', () => {
    for (const w of [prof.EDIT, prof.NAME_LABEL, prof.SAVE, prof.SAVING, prof.SAVED, prof.SAVE_FAILED, prof.CANCEL, prof.NO_NAME, prof.PROFILE_TITLE]) {
      expect(PROFILE_SRC).toContain(w);
    }
    expect(PROFILE_SRC).toContain(`placeholder="${prof.NAME_PLACEHOLDER}"`);
    expect(PROFILE_SRC).toContain('data: { full_name: fullName.trim(), },');
    expect(PROFILE_SRC).toContain("fullName.trim() || (user.user_metadata?.full_name as string) || 'Photo Enthusiast'");
    expect(prof.initials('Maria Santos')).toBe('MS');
    expect(prof.initials('Photo Enthusiast')).toBe('PE');
    expect(prof.initials('Cher')).toBe('C');
  });
});

describe('My Profile', () => {
  it('shows the name, the email, and the phone and address from the newest order', async () => {
    await render(<Profile />);
    expect(screen.getByTestId('profile-name').props.children).toBe('Maria Santos');
    expect(screen.getByTestId('profile-email').props.children).toBe('maria@example.test');
    expect((await screen.findByTestId('profile-delivery-phone')).props.children).toBe('+63 917 123 4567');
    expect(screen.getByTestId('profile-delivery-address').props.children).toBe('12 Mabini St, Canlalay, Biñan City, Laguna, 4024');
    expect(screen.getByText('From your last order, MP-2026-NEW0002. You can change them when you order.')).toBeTruthy();
    expect(calls.rpcs).toEqual([]);
    expect(calls.auth).toEqual([]);
  });

  it('no orders yet: says where they will come from; a failed read says so, with Try again', async () => {
    const rows = answers.orders;
    answers.orders = [];
    await render(<Profile />);
    expect(await screen.findByTestId('profile-no-delivery')).toBeTruthy();
    await screen.unmount();
    answers.orders = rows;
    answers.ordersError = { message: 'Network request failed' };
    await render(<Profile />);
    expect(await screen.findByText("We couldn't load your delivery details.")).toBeTruthy();
    answers.ordersError = null;
    await fireEvent.press(screen.getByTestId('profile-delivery-retry'));
    expect(await screen.findByTestId('profile-delivery-phone')).toBeTruthy();
  });

  it('an account with no name is "Photo Enthusiast", as on the website', async () => {
    mockAuth.session = { user: { id: 'user-1', email: 'maria@example.test', user_metadata: {} } };
    await render(<Profile />);
    expect(screen.getByTestId('profile-name').props.children).toBe('Photo Enthusiast');
  });

  it('Edit Profile → Save Changes saves the name the website\'s way; a failure says "Error saving"', async () => {
    await render(<Profile />);
    await fireEvent.press(screen.getByTestId('profile-edit'));
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), '  Maria Clara Santos ');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(calls.auth).toEqual([{ fn: 'updateUser', args: [{ data: { full_name: 'Maria Clara Santos' } }] }]);
    expect(await screen.findByTestId('profile-saved')).toBeTruthy();

    answers.updateUser = { data: null, error: { message: 'boom' } };
    await fireEvent.press(screen.getByTestId('profile-edit'));
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText('Error saving')).toBeTruthy();
    expect(screen.getByTestId('profile-name-input')).toBeTruthy(); // still editing: nothing lost
  });

  it('Sign out drops the sign-in and goes to the start screen; the other buttons open their screens', async () => {
    await render(<Profile />);
    await fireEvent.press(screen.getByTestId('profile-orders'));
    await fireEvent.press(screen.getByTestId('profile-change-password'));
    await fireEvent.press(screen.getByTestId('profile-delete-account'));
    expect(mockRouter.push.mock.calls).toEqual([['/orders'], ['/change-password'], ['/delete-account']]);
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it("shows the website's Delete my account section", async () => {
    await render(<Profile />);
    const DELETE_SRC = read('src/components/DeleteAccountSection.tsx');
    expect(DELETE_SRC).toContain("Permanently deletes your account, your albums, your saved photos, your memory videos and any QR memory links. This can't be undone.");
    expect(screen.getByText("Permanently deletes your account, your albums, your saved photos, your memory videos and any QR memory links. This can't be undone.")).toBeTruthy();
  });

  it('signed out: goes to sign in', async () => {
    mockAuth.session = null;
    await render(<Profile />);
    expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
  });
});

describe("Change password: the website's emailed link", () => {
  it("the words are the website's sign-in box", () => {
    for (const w of [pw.CHANGE_SUB, pw.EMAIL_LABEL, pw.SEND, pw.SENDING, pw.SENT_TITLE, pw.SENT_SUB, pw.SENT_HELP, pw.DONE]) expect(LOGIN_SRC).toContain(w);
    expect(LOGIN_SRC).toContain('We sent a link to <span className="font-semibold break-all">{email.trim()}</span>. Open it to make a new password.');
    expect(pw.sentTo(' maria@example.test ')).toBe('We sent a link to maria@example.test. Open it to make a new password.');
  });

  it('the link comes back to the website, as it does from the 1.x Android app', () => {
    expect(read('src/lib/nativeAuth.ts')).toContain("return isNativeShell() ? 'https://megyprints.vercel.app/' : `${window.location.origin}/`;");
    expect(read('src/lib/passwordRecovery.ts')).toContain('resetPasswordForEmail(email.trim(), { redirectTo: emailLinkReturnUrl(), });');
    expect(pw.passwordLinkReturn()).toBe('https://megyprints.vercel.app/');
  });

  it("emails the account's own address, then says to check the email", async () => {
    await render(<ChangePassword />);
    expect(screen.getByTestId('password-email').props.children).toBe('maria@example.test');
    await fireEvent.press(screen.getByTestId('password-send'));
    expect(calls.auth).toEqual([{ fn: 'resetPasswordForEmail', args: ['maria@example.test', { redirectTo: 'https://megyprints.vercel.app/' }] }]);
    expect(await screen.findByText('Check your email')).toBeTruthy();
    expect(screen.getByText('We sent a link to maria@example.test. Open it to make a new password.')).toBeTruthy();
    expect(screen.getByText(pw.OPENS_WEBSITE)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('password-done'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it.each([
    ['too many tries', { message: 'rate', code: 'over_email_send_rate_limit', status: 429 }],
    ['no email set up', { message: 'nope', code: 'email_address_not_authorized' }],
    ['anything else', { message: 'x' }],
  ])("a failed send (%s) says the website's words", async (_n, error) => {
    answers.resetPassword = { data: null, error };
    await render(<ChangePassword />);
    await fireEvent.press(screen.getByTestId('password-send'));
    expect((await screen.findByTestId('password-error')).props.children).toBe(sendLinkErrorText(error));
    expect(screen.queryByText('Check your email')).toBeNull();
  });
});
