/* The page fonts' files inside the app (render/fontTable.ts BUNDLED_FONTS):
   Metro bundles each TTF as an asset (a raw resource in a release build),
   expo-asset gives it a file on the phone, and its bytes go to the page
   renderer (PageText) and so to the caption measurer. Metro needs each
   require() written out, so the list is here; test/fontAssets.test.ts checks
   it names exactly the files fontTable.ts lists. */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { BUNDLED_FONTS } from '../render/fontTable';
import type { FontFile } from '../render/pageText';

/* eslint-disable @typescript-eslint/no-require-imports */
export const FONT_ASSETS: Record<string, number> = {
  '@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf': require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
  '@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf': require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  '@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf': require('@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf'),
  '@expo-google-fonts/playfair-display/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf': require('@expo-google-fonts/playfair-display/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf'),
  '@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf': require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
  '@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf': require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
  '@expo-google-fonts/dm-sans/400Regular_Italic/DMSans_400Regular_Italic.ttf': require('@expo-google-fonts/dm-sans/400Regular_Italic/DMSans_400Regular_Italic.ttf'),
  '@expo-google-fonts/dm-sans/700Bold_Italic/DMSans_700Bold_Italic.ttf': require('@expo-google-fonts/dm-sans/700Bold_Italic/DMSans_700Bold_Italic.ttf'),
  '@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf': require('@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf'),
  '@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf': require('@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf'),
  '@expo-google-fonts/cinzel/400Regular/Cinzel_400Regular.ttf': require('@expo-google-fonts/cinzel/400Regular/Cinzel_400Regular.ttf'),
  '@expo-google-fonts/cinzel/700Bold/Cinzel_700Bold.ttf': require('@expo-google-fonts/cinzel/700Bold/Cinzel_700Bold.ttf'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Every bundled font file's bytes, in BUNDLED_FONTS order. */
export async function loadPageFonts(): Promise<FontFile[]> {
  return Promise.all(BUNDLED_FONTS.map(async (font) => {
    const asset = Asset.fromModule(FONT_ASSETS[font.file]);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    return { font, bytes: await new File(uri).bytes() };
  }));
}
