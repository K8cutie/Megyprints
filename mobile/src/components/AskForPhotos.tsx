/* Pick photos without access yet: the way in (Android's question, or
   Files), and what to do when it was not allowed.

   Expo's "off" (canAskAgain false) can't tell a real block from Android's
   question closed without an answer (a tap outside it, or Back): Expo saves
   both as "blocked", though after a closed question Android recorded
   nothing and would ask again (beta round 2, Mother). So "off" says "not
   allowed" and still offers to ask. Whether Android then shows its question
   is seen by how long the app was away for it (QUESTION_SHOWN_MS). Android
   opens its permission screen on every ask, so the app always steps aside
   (AppState and window focus both leave), but with no question it is back
   in 130-360 ms (beta round 4, Android's event log), while a question shown
   waits for a person to read and tap. Timing the whole ask instead counted
   the start of Android's screen too (a cold phone: 556 ms, past the 0.4 s
   line, a dead tap: round 3); taking any step aside as a question made every
   tap dead (round 4). When Android answers with no question, it won't ask
   again: the button goes, the screen says so, and the phone remembers it
   (it came back on every visit) until access changes. Settings and Files
   are the ways. */
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALLOW_PHOTOS, ASK_LINE, FILES, FILES_INSTEAD, FILES_WORKS, SETTINGS_HOW } from '../lib/pickWords';
import { colors, space } from '../lib/theme';
import { Button } from './Button';

export const WONT_ASK_LINE = 'Your phone will not ask again.';

/** Away for Android's question less than this: it was not shown (no one
 *  reads and answers it this fast; with no question the app is back in
 *  130-360 ms). */
export const QUESTION_SHOWN_MS = 1000;

/** Android answered "ask again" with no question, while access is off. */
let wontAskKnown = false;
/** Access changed (or a test starts): Android may ask again. */
export function forgetWontAsk(): void { wontAskKnown = false; }

export function AskForPhotos({ access, onAsk, onFiles }: { access: { canAskAgain: boolean; refused: boolean }; onAsk: () => Promise<void>; onFiles: () => Promise<void> }) {
  const blocked = !access.canAskAgain;
  const [wontAsk, setWontAsk] = useState(() => blocked && wontAskKnown);
  useEffect(() => { if (!blocked) forgetWontAsk(); }, [blocked]);
  const off = blocked && wontAsk;
  const refused = (access.refused || blocked) && !off;
  const askAgain = async () => {
    // How long the app was away for Android's permission screen (the whole
    // ask, on a phone that doesn't say it stepped aside).
    const asked = Date.now();
    let left: number | null = null;
    let back: number | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') left ??= Date.now();
      else if (left !== null) back = Date.now();
    });
    try { await onAsk(); } finally { sub.remove(); }
    const away = (back ?? Date.now()) - (left ?? asked);
    if (blocked && away < QUESTION_SHOWN_MS) { wontAskKnown = true; setWontAsk(true); }
  };
  return (
    <SafeAreaView edges={['bottom']} style={styles.ask}>
      <View style={styles.askText}>
        <Text style={styles.heading}>{off ? 'Photo access is off' : refused ? 'Photo access was not allowed' : 'Pick photos from your phone'}</Text>
        <Text style={styles.body}>{ASK_LINE}</Text>
        {off && <Text style={styles.body}>{WONT_ASK_LINE}</Text>}
        {off && <Text style={styles.body}>{SETTINGS_HOW}</Text>}
        <Text style={styles.small}>{FILES_WORKS}</Text>
      </View>
      <View style={styles.askButtons}>
        {off || refused ? (
          <>
            <Button label={FILES} onPress={() => { void onFiles(); }} testID="files-main" />
            {!off && <Button label="Ask for photo access again" kind="plain" onPress={() => { void askAgain(); }} testID="ask-again" />}
            {blocked && <Button label="Open Settings" kind="plain" onPress={() => { void Linking.openSettings(); }} testID="open-settings" />}
          </>
        ) : (
          <>
            <Button label={ALLOW_PHOTOS} onPress={() => { void onAsk(); }} testID="allow-photos" />
            <Button label={FILES_INSTEAD} kind="plain" onPress={() => { void onFiles(); }} testID="files-instead" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' },
  small: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  ask: { flex: 1, backgroundColor: colors.background, padding: space.lg, justifyContent: 'space-between' },
  askText: { flex: 1, justifyContent: 'center', gap: space.md },
  askButtons: { gap: space.md, paddingBottom: space.md },
});
