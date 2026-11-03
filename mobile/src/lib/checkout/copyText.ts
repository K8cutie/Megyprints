/* The website's copyText (src/lib/copyText.ts) on the phone: the pay card's
   Copy for the order number. Expo's clipboard (expo-clipboard, the SDK's own
   module): false when the phone won't let us, so the card can say to type
   the number in the note instead. */
import * as Clipboard from 'expo-clipboard';

/** Copies `text`; false when this phone won't let us. */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
