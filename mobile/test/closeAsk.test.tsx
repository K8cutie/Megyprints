/* ══════════════════════════════════════════════════════════════════════════
   BACK NEVER CLOSES THE APP WITHOUT ASKING (src/lib/closeAsk.ts):
     • a screen to go back to: Back goes back, nothing asked;
     • none: "Close Megy Prints?" — Stay (the default) keeps the app open,
       Close closes it;
     • the app's root listens for Back the whole time it is open.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react-native';
import { BackHandler, type AlertButton } from 'react-native';
import { askBeforeClosing, CLOSE, CLOSE_TITLE, STAY, useAskBeforeClosing } from '../src/lib/closeAsk';

type Asked = { title: string; message: string | undefined; buttons: AlertButton[]; options: { cancelable: boolean } };
function recorder() {
  const asked: Asked[] = [];
  const ask = (title: string, message: string | undefined, buttons: AlertButton[], options: { cancelable: boolean }) => { asked.push({ title, message, buttons, options }); };
  return { asked, ask };
}

describe('Back', () => {
  it('a screen to go back to: it goes back, nothing is asked', () => {
    const { asked, ask } = recorder();
    const close = jest.fn();
    expect(askBeforeClosing(() => true, ask, close)).toBe(false);
    expect(asked).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('nothing to go back to: "Close Megy Prints?" first; Stay keeps the app open, Close closes it', () => {
    const { asked, ask } = recorder();
    const close = jest.fn();
    expect(askBeforeClosing(() => false, ask, close)).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(asked).toHaveLength(1);
    expect(asked[0].title).toBe(CLOSE_TITLE);
    expect(asked[0].title).toBe('Close Megy Prints?');
    expect(asked[0].options).toEqual({ cancelable: true });
    expect(asked[0].buttons.map((b) => [b.text, b.style])).toEqual([[STAY, 'cancel'], [CLOSE, 'destructive']]);
    expect(asked[0].buttons[0].onPress).toBeUndefined();
    asked[0].buttons[1].onPress!();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('the app listens for Back while it is open', () => {
  function Probe({ canGoBack }: { canGoBack: () => boolean }) {
    useAskBeforeClosing(canGoBack);
    return null;
  }

  it('listens from the start and stops when closed; on the last screen Back is taken (asked)', async () => {
    const handlers: ((e: never) => boolean | null | undefined)[] = [];
    const removed = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => { handlers.push(h); return { remove: removed }; });
    const alert = jest.spyOn(jest.requireActual('react-native').Alert, 'alert').mockImplementation(() => {});
    try {
      const shown = await render(<Probe canGoBack={() => false} />);
      expect(spy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      expect(handlers[0]({} as never)).toBe(true);
      expect(alert).toHaveBeenCalledWith(CLOSE_TITLE, undefined, expect.any(Array), { cancelable: true });
      await shown.unmount();
      expect(removed).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      alert.mockRestore();
    }
  });

  it('the app\'s root layout has it, under every screen', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/_layout.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toContain('const canGoBack = () => router.canGoBack();');
    expect(src).toContain('useAskBeforeClosing(canGoBack);');
    expect(src).toContain('<AskBeforeClosing />');
  });
});
