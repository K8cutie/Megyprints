/* ══════════════════════════════════════════════════════════════════════════
   ANDROID'S PHOTO QUESTION CLOSED WITHOUT AN ANSWER IS NOT "OFF FOR GOOD"
   (beta round 2, Mother: tap outside Android's photo dialog, or Back on it,
   and Pick photos said "Photo access is off" with only Files and Open
   Settings, for good, though Android had recorded no answer and would have
   asked again. Expo saves "blocked" after ANY denied answer whose rationale
   is false, and a closed dialog is one).

   "Off" keeps a way to ask again. When Android really won't ask any more,
   its answer comes back at once with no question shown: then the button
   goes, and Settings is the way.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AskForPhotos, NO_QUESTION_MS } from '../src/components/AskForPhotos';
import { SETTINGS_HOW } from '../src/lib/pickWords';

let clock = Date.UTC(2026, 10, 4, 2, 0);
beforeEach(() => { jest.spyOn(Date, 'now').mockImplementation(() => clock); });
afterEach(() => { jest.restoreAllMocks(); });

describe('Photo access is off', () => {
  it('still offers to ask again, beside Settings and Files', async () => {
    const onAsk = jest.fn(async () => { clock += 3_000; });
    await render(<AskForPhotos access={{ canAskAgain: false, refused: true }} onAsk={onAsk} onFiles={jest.fn(async () => {})} />);
    expect(screen.getByText('Photo access is off')).toBeOnTheScreen();
    expect(screen.getByText(SETTINGS_HOW)).toBeOnTheScreen();
    expect(screen.getByTestId('open-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('files-main')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ask-again'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    // Android showed its question (it took a while) and it was closed again: ask again stays.
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
  });

  it('Android answered at once, with no question: the button goes, and Settings is the way', async () => {
    const onAsk = jest.fn(async () => { clock += 40; });
    await render(<AskForPhotos access={{ canAskAgain: false, refused: true }} onAsk={onAsk} onFiles={jest.fn(async () => {})} />);
    await fireEvent.press(screen.getByTestId('ask-again'));
    await waitFor(() => expect(screen.queryByTestId('ask-again')).toBeNull());
    expect(screen.getByTestId('open-settings')).toBeOnTheScreen();
    expect(NO_QUESTION_MS).toBe(400);
  });
});

describe('the other ways in, as before', () => {
  it('never asked: Allow access to photos, or Files instead', async () => {
    const onAsk = jest.fn(async () => {});
    await render(<AskForPhotos access={{ canAskAgain: true, refused: false }} onAsk={onAsk} onFiles={jest.fn(async () => {})} />);
    expect(screen.getByText('Pick photos from your phone')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('allow-photos'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('files-instead')).toBeOnTheScreen();
  });

  it('"Don\'t allow" once: not allowed, ask again', async () => {
    await render(<AskForPhotos access={{ canAskAgain: true, refused: true }} onAsk={jest.fn(async () => {})} onFiles={jest.fn(async () => {})} />);
    expect(screen.getByText('Photo access was not allowed')).toBeOnTheScreen();
    expect(screen.getByTestId('ask-again')).toBeOnTheScreen();
    expect(screen.queryByTestId('open-settings')).toBeNull();
  });
});
