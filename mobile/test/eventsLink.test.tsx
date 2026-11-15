/* ══════════════════════════════════════════════════════════════════════════
   MEGYPRINTS EVENTS FROM THE APP (Phase 6: src/app/index.tsx). Events are
   booked and run on the website (src/pages/Events.tsx and the event pages;
   guests take part by scanning the event's QR, nothing to download). The
   start screen has the website's Events card, whose "Book your event ›"
   opens the website's Events page, signed in or not (and "Megyprints
   Events" in the menu, test/homeLook.test.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Start from '../src/app/index';
import { EVENTS_LABEL, EVENTS_PAGE } from '../src/lib/events';
import { EVENTS_CARD } from '../src/home/homeWords';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const mockAuth: { session: unknown } = { session: null };
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ loading: false, session: mockAuth.session, signOut: jest.fn() }) }));
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({ builder: { uploadedPhotos: [], reset: jest.fn() }, platform: { deviceStore: {} } }),
}));
jest.mock('../src/builder/albumFlow', () => ({ albumInProgress: () => false, resumeRoute: () => '/', startNewNote: () => '' }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ draft: { photos: [] }, clear: jest.fn() }) }));
jest.mock('../modules/photo-files', () => ({ releasePickedFiles: jest.fn(async () => 0) }));
// Events on (as built) or off (owner, 2026-11-16: lib/events.ts EVENTS_ON), per test.
// A getter (defined, not spread: a spread would read it once, too early).
const mockEvents = { on: true };
jest.mock('../src/lib/events', () => {
  const m = { ...jest.requireActual('../src/lib/events') };
  Object.defineProperty(m, 'EVENTS_ON', { get: () => mockEvents.on, enumerable: true });
  return m;
});

let openUrl: jest.SpyInstance;
beforeEach(() => { mockEvents.on = true; openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never); });
afterEach(() => openUrl.mockRestore());

describe('while Events is off (owner, 2026-11-16: "for now events is disabled as a feature until we work something out")', () => {
  it('it is off now, and nothing is deleted: turning it back on is one line', () => {
    expect((jest.requireActual('../src/lib/events') as { EVENTS_ON: boolean }).EVENTS_ON).toBe(false);
  });

  it.each([
    ['signed out', null],
    ['signed in', { user: { id: 'u1', email: 'maria@example.test' } }],
  ])('%s: no Events card, no Events in the menu, nothing opens the Events page', async (_n, session) => {
    mockEvents.on = false;
    mockAuth.session = session;
    await render(<Start />);
    expect(screen.queryByTestId('home-events-card', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('go-events')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-menu'));
    expect(screen.queryByTestId('menu-events')).toBeNull();
    expect(screen.getByTestId(session ? 'menu-albums' : 'menu-sign-in')).toBeOnTheScreen();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('Megyprints Events, while it is on', () => {
  it('the website\'s name for it and its page', () => {
    expect(read('src/pages/homeCopy.ts')).toContain(`label: '${EVENTS_LABEL}',`);
    expect(read('src/App.tsx')).toContain('<Route path="/events" element={<Events />} />');
    expect(EVENTS_PAGE).toBe('https://megyprints.vercel.app/#/events');
  });

  it.each([
    ['signed out', null],
    ['signed in', { user: { id: 'u1', email: 'maria@example.test' } }],
  ])('%s: the button opens the website\'s Events page', async (_n, session) => {
    mockAuth.session = session;
    await render(<Start />);
    await fireEvent.press(screen.getByTestId('go-events'));
    expect(screen.getByTestId('go-events')).toHaveTextContent(`${EVENTS_CARD.cta} ›`);
    expect(EVENTS_CARD.label).toBe(EVENTS_LABEL);
    expect(openUrl).toHaveBeenCalledWith('https://megyprints.vercel.app/#/events');
  });
});
