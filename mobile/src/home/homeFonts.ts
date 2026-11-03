/* The start screen's type, the website's (tailwind.config.js): Playfair
   Display for the headlines and the "Megy" of the wordmark, DM Sans for the
   rest. Both are already in the app (the page fonts, builder/fontAssets.ts),
   so nothing is downloaded. Until they are in (a moment, on the first start)
   the phone's own font shows, in the same sizes. On Android a font of our own
   is named by its exact file (one name per weight and style), and a
   fontWeight on top of it would make the phone fake a bold, so a loaded face
   carries no fontWeight. */
import { useFonts } from 'expo-font';
import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';
import { FONT_ASSETS } from '../builder/fontAssets';

const PF = '@expo-google-fonts/playfair-display';
const DM = '@expo-google-fonts/dm-sans';

/** The names the start screen registers its faces under. */
export const HOME_FACES = {
  display: 'megy-home-playfair-700',
  displayItalic: 'megy-home-playfair-700i',
  displayItalicLight: 'megy-home-playfair-400i',
  body: 'megy-home-dmsans-400',
  bodyBold: 'megy-home-dmsans-700',
} as const;

const FILES: Record<string, string> = {
  [HOME_FACES.display]: `${PF}/700Bold/PlayfairDisplay_700Bold.ttf`,
  [HOME_FACES.displayItalic]: `${PF}/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf`,
  [HOME_FACES.displayItalicLight]: `${PF}/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf`,
  [HOME_FACES.body]: `${DM}/400Regular/DMSans_400Regular.ttf`,
  [HOME_FACES.bodyBold]: `${DM}/700Bold/DMSans_700Bold.ttf`,
};

export type HomeType = Record<keyof typeof HOME_FACES, TextStyle>;

/** The phone's own font, until ours are in. */
const FALLBACK: HomeType = {
  display: { fontFamily: 'serif', fontWeight: '700' },
  displayItalic: { fontFamily: 'serif', fontWeight: '700', fontStyle: 'italic' },
  displayItalicLight: { fontFamily: 'serif', fontStyle: 'italic' },
  body: {},
  bodyBold: { fontWeight: '700' },
};

const LOADED = Object.fromEntries(Object.entries(HOME_FACES).map(([k, name]) => [k, { fontFamily: name }])) as HomeType;

/** The faces to use: ours once they are in. */
export function useHomeType(): HomeType {
  const [loaded] = useFonts(Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, FONT_ASSETS[file]])));
  return loaded ? LOADED : FALLBACK;
}

/** The start screen hands its faces down to the cards (HomeCards.tsx). */
export const HomeTypeContext = createContext<HomeType>(FALLBACK);
export const useType = (): HomeType => useContext(HomeTypeContext);
