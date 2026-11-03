/* ══════════════════════════════════════════════════════════════════════════
   THE PAY CARD (src/components/checkout/PayCard.tsx): the website's PayCard
   (#234, the owner's design of 2026-10-31) in the app.
     • its words are the website's, each one still in src/components/PayCard.tsx;
     • the ✓ and "Order … is placed." / "Pay by bank transfer to finish." (two
       lines) once there is an order;
     • Copy puts the order number on the phone's clipboard and says "Copied"
       for 2 s; a phone that won't copy says to type it in the note;
     • step 2 says how to pay with this phone (screenshot, Upload QR).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { COPIED_MS, PayCard } from '../src/components/checkout/PayCard';

const mockClip = { ok: true, calls: [] as string[] };
jest.mock('expo-clipboard', () => ({
  setStringAsync: async (t: string) => { mockClip.calls.push(t); if (mockClip.ok === null) throw new Error('no clipboard'); return mockClip.ok; },
}));

const WEB = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src/components/PayCard.tsx'), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => { mockClip.ok = true; mockClip.calls = []; });
afterEach(() => { jest.useRealTimers(); });

describe("the pay card's words are the website's (PayCard.tsx)", () => {
  it('every line, as the website says it', () => {
    for (const w of [
      'Open your bank or e-wallet app', 'GCash, Maya, BPI, BDO, UnionBank…',
      '<>Choose <b>Scan QR</b> / <b>InstaPay</b></>', 'and scan the code above.',
      'Paying with this phone?</b> Take a screenshot of the QR, then choose <b>Upload QR</b> in your bank app.',
      '<>Send exactly <span', 'in the note if your app asks.', 'Attach your receipt below', 'It speeds up confirmation.',
      "Your app may charge a small InstaPay fee. We don't add any.",
      "The QR code isn't available right now — message us and we'll send the account details.",
      '<Check size={16} /> Copied', '<Copy size={16} /> Copy', "This phone didn't let us copy it. Type {orderNumber} in the note instead.",
      'aria-label={`Copy order number ${orderNumber}`}', '<span aria-hidden="true">•••••• </span><span className="sr-only">Account ending in </span>{PAYEE.accountLast4}',
      '{PAYEE.bank} · {PAYEE.rail}', 'h-56 w-56', // the QR's full size on a phone: 224
    ]) expect(WEB).toContain(w);
    expect(WEB).toContain('window.setTimeout(() => setCopied(null), 2000)');
    expect(COPIED_MS).toBe(2000);
  });
});

describe('the pay card in the app', () => {
  it('who you pay, the QR, the four steps; with an order: Copy and "paste … in the note"', async () => {
    await render(<PayCard amountLabel="₱1,288" orderNumber="MP-2026-ABC1234" testOnly={false} />);
    expect(screen.getByTestId('pay-bank')).toHaveTextContent('GoTyme Bank · InstaPay · QR Ph');
    expect(screen.getByTestId('pay-name')).toHaveTextContent('ARCHIE GARCIA');
    expect(screen.getByLabelText('Account ending in 2370')).toHaveTextContent('•••••• 2370');
    expect(screen.getByLabelText('GoTyme Bank InstaPay QR for ARCHIE GARCIA')).toBeOnTheScreen();
    expect(screen.queryByTestId('pay-qr-test-band')).toBeNull();
    expect(screen.getAllByTestId('pay-how-step')).toHaveLength(4);
    expect(screen.getByText('Open your bank or e-wallet app')).toBeOnTheScreen();
    expect(screen.getByText('Send exactly ₱1,288')).toBeOnTheScreen();
    expect(screen.getByTestId('pay-note-line')).toHaveTextContent('and paste MP-2026-ABC1234 in the note if your app asks.');
    expect(screen.getByTestId('pay-same-phone')).toHaveTextContent('Paying with this phone? Take a screenshot of the QR, then choose Upload QR in your bank app.');
    expect(screen.getByText('Attach your receipt below')).toBeOnTheScreen();
    expect(screen.getByLabelText('Copy order number MP-2026-ABC1234')).toBeOnTheScreen();
  });

  it('Copy: the number goes on the clipboard, "Copied" for 2 s, then "Copy" again', async () => {
    jest.useFakeTimers();
    await render(<PayCard amountLabel="₱1,288" orderNumber="MP-2026-ABC1234" testOnly={false} />);
    expect(screen.getByTestId('pay-copy-label')).toHaveTextContent('Copy');
    await fireEvent.press(screen.getByTestId('pay-copy-order'));
    expect(mockClip.calls).toEqual(['MP-2026-ABC1234']);
    expect(screen.getByTestId('pay-copy-label')).toHaveTextContent('Copied');
    await act(async () => { jest.advanceTimersByTime(COPIED_MS - 1); });
    expect(screen.getByTestId('pay-copy-label')).toHaveTextContent('Copied');
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(screen.getByTestId('pay-copy-label')).toHaveTextContent('Copy');
    expect(screen.queryByTestId('pay-copy-failed')).toBeNull();
  });

  it.each([['says no', false], ['throws', null]])('a phone whose clipboard %s: type the number in the note instead', async (_n, ok) => {
    mockClip.ok = ok as boolean;
    await render(<PayCard amountLabel="₱1,288" orderNumber="MP-2026-ABC1234" testOnly={false} />);
    await fireEvent.press(screen.getByTestId('pay-copy-order'));
    expect(screen.getByTestId('pay-copy-failed')).toHaveTextContent("This phone didn't let us copy it. Type MP-2026-ABC1234 in the note instead.");
    expect(screen.getByTestId('pay-copy-label')).toHaveTextContent('Copy');
  });

  it('no order behind it (the test album): no Copy, no note line, and the "do not pay" band on the QR', async () => {
    await render(<PayCard amountLabel="₱1,288" orderNumber={null} testOnly />);
    expect(screen.queryByTestId('pay-copy-order')).toBeNull();
    expect(screen.queryByTestId('pay-note-line')).toBeNull();
    expect(screen.getByTestId('pay-qr-test-band')).toHaveTextContent('Test only. Do not pay.');
  });

  it('an order with no saved total: "Send the total we tell you", never a made-up amount', async () => {
    await render(<PayCard amountLabel={null} orderNumber="MP-2026-OLD0001" testOnly={false} />);
    expect(screen.getByText('Send the total we tell you')).toBeOnTheScreen();
    expect(screen.queryByText(/₱/)).toBeNull();
  });
});
