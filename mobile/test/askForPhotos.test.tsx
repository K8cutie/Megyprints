/* ══════════════════════════════════════════════════════════════════════════
   ANDROID'S PHOTO QUESTION CLOSED WITHOUT AN ANSWER IS NOT "OFF FOR GOOD"
   (beta round 2, Mother: tap outside Android's photo dialog, or Back on it,
   and Pick photos said "Photo access is off" with only Files and Open
   Settings, for good, though Android had recorded no answer and would have
   asked again. Expo saves "blocked" after ANY denied answer whose rationale
   is false, and a closed dialog is one).

   "Off" keeps a way to ask again. Whether Android showed its question is
   seen by how long the app was away for it: Android opens its permission
   screen on EVERY ask, so the app always steps aside (AppState and window
   focus both leave), but with no question it is back in 130-360 ms (Mother,
   round 4, Android's event log), while a question shown waits for a person.
   Round 3 timed the whole ask (a cold phone: 556 ms, past its 0.4 s line, a
   dead tap); round 4 took any step aside as a question (every tap dead).
   Once Android won't ask, the phone remembers it until access changes, and
   the screen says so; before that, it says "not allowed", not "off".
   ══════════════════════════════════════════════════════════════════════════ */
import { AppState, type AppStateStatus } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AskForPhotos, forgetWontAsk, QUESTION_SHOWN_MS, WONT_ASK_LINE } from '../src/components/AskForPhotos';
import { SETTINGS_HOW } from '../src/lib/pickWords';

/** What the app hears while it asks: Android's permission screen puts it in
 *  the background, for `ms`. The phone's clock, moved by hand. */
let listeners: ((s: AppStateStatus) => void)[] = [];
let clock = Date.UTC(2026, 10, 4, 7, 0);
const away = (ms: number) => { for (const l of listeners) l('background'); clock += ms; for (const l of listeners) l('active'); };
/** Android's question on screen, closed by a person after `ms`. */
const questionShown = (ms = 1500) => { clock += 150; away(ms); };
/** No question: Android's permission screen opens and closes at once (cold: 200 ms to start it, 360 ms away). */
const noQuestion = (startMs = 200, awayMs = 360) => { clock += startMs; away(awayMs); clock += 20; };
beforeEach(() => {
  listeners = [];
  forgetWontAsk();
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
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

  it('Android answers with no question, though the app stepped aside for it, cold: the button goes on that one tap, and the screen says Android won\'t ask', async () => {
    // Cold: 580 ms in all (past round 3's 0.4 s line), 360 ms of it away (Mother, round 4).
    const onAsk = jest.fn(async () => { noQuestion(); });
    await render(<AskForPhotos access={OFF} onAsk={onAsk} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    expect(screen.getByText('Photo access is off')).toBeOnTheScreen();
    expect(screen.getByText(WONT_ASK_LINE)).toBeOnTheScreen();
    expect(screen.getByText(SETTINGS_HOW)).toBeOnTheScreen();
    expect(screen.getByTestId('open-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('files-main')).toBeOnTheScreen();
  });

  it('warm (130 ms away), or a phone that never says it stepped aside: the button goes too', async () => {
    const warm = await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => { noQuestion(15, 130); })} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    await warm.unmount();
    forgetWontAsk();
    await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => { clock += 300; })} onFiles={files()} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    expect(QUESTION_SHOWN_MS).toBe(1000);
  });

  it('remembered on the next visit (it came back on every one), until access changes', async () => {
    const first = await render(<AskForPhotos access={OFF} onAsk={jest.fn(async () => { noQuestion(); })} onFiles={files()} />);
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
