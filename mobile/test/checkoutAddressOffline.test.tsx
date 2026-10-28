/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: with no internet, or while the provinces were still
   loading, a tap on City / Municipality or Barangay opened an EMPTY
   Province list that said "No name has those letters" with nothing typed.
   The Province box's own "Couldn't load the list. Tap to try again." was
   skipped (review of the checkout screens).

   Now those taps go through the same checks as a tap on Province: still
   loading does nothing yet, a list that didn't load is tried again. The
   real address boxes (AddressFields) with the real lists (public/psgc/),
   the internet switched off and on by a stand-in fetch.

   Its own file: the app reads each list once and keeps it, so a file that
   already loaded the provinces could not show them failing.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { EMPTY_ADDRESS, type AddressValue } from '@web/lib/contact';
import { AddressFields } from '../src/components/checkout/AddressFields';
import { BASE, fetchFromDisk } from './helpers/psgcFiles';

const FAILED = "Couldn't load the list. Tap to try again.";
const EMPTY_WORDS = 'No name has those letters. Check the spelling.';

let online = false;
const fetchMock = jest.fn((url: string) =>
  online ? fetchFromDisk(String(url).replace('https://megyprints.vercel.app/psgc/', BASE)) : Promise.reject(new Error('Network request failed')),
);

function Host() {
  const [value, setValue] = useState<AddressValue>(EMPTY_ADDRESS);
  return <AddressFields value={value} onChange={setValue} errors={{}} />;
}

beforeAll(() => { global.fetch = fetchMock as unknown as typeof fetch; });

describe('address lists that did not load', () => {
  it('City and Barangay try the provinces again, and never open an empty list', async () => {
    await render(<Host />);
    expect(await screen.findByText(FAILED)).toBeOnTheScreen();
    expect(screen.getAllByText('Choose the province first')).toHaveLength(2);
    const calls = fetchMock.mock.calls.length;

    // Barangay, still offline: the provinces are tried again; no sheet opens.
    await fireEvent.press(screen.getByTestId('address-barangay'));
    expect(screen.queryByTestId('choice-search')).toBeNull();
    expect(screen.queryByText(EMPTY_WORDS)).toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    expect(await screen.findByText(FAILED)).toBeOnTheScreen();

    // Back online: a tap on City loads the provinces (no sheet yet) ...
    online = true;
    await fireEvent.press(screen.getByTestId('address-city'));
    expect(await screen.findByText('Select province…')).toBeOnTheScreen();
    expect(screen.queryByTestId('choice-search')).toBeNull();

    // ... and the next tap opens the Province list, full.
    await fireEvent.press(screen.getByTestId('address-city'));
    expect(await screen.findByTestId('choice-search')).toBeOnTheScreen();
    expect(screen.getAllByText('Province')).toHaveLength(2); // the box's label and the list's title
    expect(screen.queryByText(EMPTY_WORDS)).toBeNull();
    await fireEvent.changeText(screen.getByTestId('choice-search'), 'metro');
    await fireEvent.press(await screen.findByText('Metro Manila'));
    expect(screen.getByText('Select city / municipality…')).toBeOnTheScreen();
  });

  it('typing a name that is in no list says so', async () => {
    online = true;
    await render(<Host />);
    expect(await screen.findByText('Select province…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('address-province'));
    expect(await screen.findByTestId('choice-search')).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_WORDS)).toBeNull();
    await fireEvent.changeText(screen.getByTestId('choice-search'), 'zzzz');
    expect(screen.getByText(EMPTY_WORDS)).toBeOnTheScreen();
  });
});
