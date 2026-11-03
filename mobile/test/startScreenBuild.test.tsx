/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN IN EACH BUILD (src/app/index.tsx, src/lib/buildKind.ts).
   The Play build is the app customers get: no test buttons ("Shared code
   check", "Checkout with a test album") and no "Test version" note. The dev
   build keeps them. The build says which it is (app.config.js extra.build).
   ══════════════════════════════════════════════════════════════════════════ */
import { render, screen } from '@testing-library/react-native';
import Start from '../src/app/index';
import { buildKind } from '../src/lib/buildKind';

/* eslint-disable @typescript-eslint/no-require-imports */
const appConfig = require('../app.config.js') as (arg: { config: Record<string, unknown> }, env?: Record<string, string>) => Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const appJson = require('../app.json') as { expo: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-require-imports */

const mockConfig: { value: unknown } = { value: null };
jest.mock('expo-constants', () => ({ __esModule: true, default: { get expoConfig() { return mockConfig.value; } } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ loading: false, session: null, signOut: jest.fn() }) }));
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({ builder: { uploadedPhotos: [], reset: jest.fn() }, platform: { deviceStore: {} } }),
}));
jest.mock('../src/builder/albumFlow', () => ({ albumInProgress: () => false, resumeRoute: () => '/', startNewNote: () => '' }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ draft: { photos: [] }, clear: jest.fn() }) }));
jest.mock('../modules/photo-files', () => ({ releasePickedFiles: jest.fn(async () => 0) }));

const play = appConfig({ config: appJson.expo }, { MEGY_PLAY: '1' });
const dev = appConfig({ config: appJson.expo }, {});

const startScreen = () => render(<Start />);

describe('which build this is', () => {
  it('the Play build says so; the dev build, and a build that says nothing, are dev', () => {
    expect(play.extra).toEqual(expect.objectContaining({ build: 'play' }));
    expect(buildKind(play)).toBe('play');
    expect(buildKind(dev)).toBe('dev');
    expect(buildKind(null)).toBe('dev');
    expect(buildKind({ extra: { build: 'something' } })).toBe('dev');
  });
});

describe('the start screen', () => {
  it('Play build: no test buttons, no "Test version" note', async () => {
    mockConfig.value = play;
    await startScreen();
    expect(screen.getByTestId('make-album')).toBeOnTheScreen();
    expect(screen.getByTestId('go-sign-in')).toBeOnTheScreen();
    expect(screen.queryByTestId('go-check')).toBeNull();
    expect(screen.queryByTestId('go-order')).toBeNull();
    expect(screen.queryByText(/Test version/)).toBeNull();
  });

  it('dev build: the test buttons and the note stay', async () => {
    mockConfig.value = dev;
    await startScreen();
    expect(screen.getByTestId('go-check')).toBeOnTheScreen();
    expect(screen.getByTestId('go-order')).toBeOnTheScreen();
    expect(screen.getByText(/^Test version 2\.0 \(dev\)/)).toBeOnTheScreen();
  });
});
