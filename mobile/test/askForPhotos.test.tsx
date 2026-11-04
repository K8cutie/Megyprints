/* ══════════════════════════════════════════════════════════════════════════
   ANDROID'S PHOTO QUESTION CLOSED WITHOUT AN ANSWER IS NOT "OFF FOR GOOD"
   (beta round 2, Mother: tap outside Android's photo dialog, or Back on it,
   and Pick photos said "Photo access is off" with only Files and Open
   Settings, for good, though Android had recorded no answer and would have
   asked again. Expo saves "blocked" after ANY denied answer whose rationale
   is false, and a closed dialog is one).

   "Off" keeps a way to ask again. Whether Android showed its question is
   seen by the app stepping aside for it (AppState leaves "active"), not by
   how long the answer took: a slow phone answered "won't ask" in 556 ms,
   past the old 0.4 s line, and the button stayed as a dead tap (round 3).
   Once Android won't ask, the phone remembers it until access changes, and
   the screen says so; before that, it says "not allowed", not "off".
   ══════════════════════════════════════════════════════════════════════════ */
import { AppState, type AppStateStatus } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AskForPhotos, forgetWontAsk, WONT_ASK_LINE } from '../src/components/AskForPhotos';
import { SETTINGS_HOW } from '../src/lib/pickWords';

/** What the app hears while it asks: Android's question puts it in the background. */
let listeners: ((s: AppStateStatus) => void)[] = [];
const questionShown = () => { for (const l of listeners) l('background'); for (const l of listeners) l('active'); };
beforeEach(() => {
  listeners = [];
  forgetWontAsk();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, l) => {
    listeners.push(l as (s: AppStateStatus) => void);
    return { remove: () => { listeners = listeners.filter((x) => x !== l); } } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

const OFF = { canAskAgain: false, refused: true };
const files = () => jest.fn(async () => {});

describe('Expo says "off" (a closed question, or a real block: it can\'t tell)', () => {
  it('says not allowed, not "off": ask again, Files and Settings', async () => {
    await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    expect(screen.getByText('Photo access was not allowed')).toBeOnTheScreen();
    expect(screen.queryByText('Photo access is off')).toBeNull();
    expect(screen.queryByText(SETTINGS_HOW)).toBeNull();
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
    expect(screen.getByTestId('open-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('files-main')).toBeOnTheScreen();
  });

  it('Android shows its question and it is closed again: ask again stays', async () => {
    const onAsk = jest.fn(async () => { questionShown(); });
    await render(<AskForPhotos access={OFF} onAsk={onAsk} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
    expect(screen.queryByText(WONT_ASK_LINE)).toBeNull();
  });

  it('Android answers with no question, however slowly: the button goes, and the screen says Android won\'t ask', async () => {
    // A cold phone took 556 ms to answer, with no question (Mother, round 3).
    const onAsk = jest.fn(() => new Promise<void>((r) => setTimeout(r, 600)));
    await render(<AskForPhotos access={OFF} onAsk={onAsk} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    expect(screen.getByText('Photo access is off')).toBeOnTheScreen();
    expect(screen.getByText(WONT_ASK_LINE)).toBeOnTheScreen();
    expect(screen.getByText(SETTINGS_HOW)).toBeOnTheScreen();
    expect(screen.getByTestId('open-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('files-main')).toBeOnTheScreen();
  });

  it('remembered on the next visit (it came back on every one), until access changes', async () => {
    const first = await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    await first.unmount();
    // Back, then Pick photos again.
    const again = await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    expect(screen.queryByTestId('ask-again')).toBeNull();
    expect(screen.getByText(WONT_ASK_LINE)).toBeOnTheScreen();
    await again.unmount();
    // Access turned back on (Settings), then off again: Android may ask again.
    const on = await render(<AskForPhotos access={{ canAskAgain: true, refused: true }} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    await on.unmount();
    await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
  });
});

describe('the other ways in, as before', () => {
  it('never asked: Allow access to photos, or Files instead', async () => {
    const onAsk = jest.fn(async () => {});
    await render(<AskForPhotos access={{ canAskAgain: true, refused: false }} onAsk={onAsk} onFiles={files()} />);
    expect(screen.getByText('Pick photos from your phone')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('allow-photos'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('files-instead')).toBeOnTheScreen();
  });

  it('"Don\'t allow" once: not allowed, ask again', async () => {
    await render(<AskForPhotos access={{ canAskAgain: true, refused: true }} onAsk={jest.fn(async () => {})} onFiles={files()} />);
    expect(screen.getByText('Photo access was not allowed')).toBeOnTheScreen();
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
    expect(screen.queryByTestId('open-settings')).toBeNull();
  });
});
