/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: signing in from checkout must come back to the order. It
   went to My albums, and checkout, opened again, still said "You must be
   signed in" (review of the checkout screens). Opened from anywhere else,
   sign-in still opens My albums, as in Phase 1.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import SignIn from '../src/app/sign-in';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockParams: { then?: string } = {};
const mockSignIn = jest.fn(async () => ({ ok: true as const }));

jest.mock('expo-router', () => ({
  router: { back: () => mockRouter.back(), replace: (h: unknown) => mockRouter.replace(h), canGoBack: () => mockRouter.canGoBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock('../src/lib/supabase', () => ({ supabaseConfigured: true }));

beforeEach(() => {
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockImplementation(() => true);
  delete mockParams.then;
});

async function signInNow() {
  await render(<SignIn />);
  await fireEvent.changeText(screen.getByTestId('email'), 'tester@example.com');
  await fireEvent.changeText(screen.getByTestId('password'), 'not-a-real-password');
  await fireEvent.press(screen.getByTestId('sign-in'));
}

describe('where sign-in goes after it works', () => {
  it('from checkout (then=back): back to the order', async () => {
    mockParams.then = 'back';
    await signInNow();
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('from the start screen: My albums, as before', async () => {
    await signInNow();
    expect(mockRouter.replace).toHaveBeenCalledWith('/albums');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('then=back with nothing to go back to: My albums', async () => {
    mockParams.then = 'back';
    mockRouter.canGoBack.mockImplementation(() => false);
    await signInNow();
    expect(mockRouter.replace).toHaveBeenCalledWith('/albums');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
