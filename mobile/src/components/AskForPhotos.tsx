/* Pick photos without access yet: the way in (Android's question, or
   Files), and what to do when it was not allowed.

   "Off" (Expo says Android won't ask again) still offers to ask: closing
   Android's question without an answer (a tap outside it, or Back) is saved
   by Expo as "blocked", though Android recorded nothing and would ask again
   (beta round 2, Mother). When Android really won't, its answer comes back
   at once with no question shown: then that button goes, and Settings is
   the way. */
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALLOW_PHOTOS, ASK_LINE, FILES, FILES_INSTEAD, FILES_WORKS, SETTINGS_HOW } from '../lib/pickWords';
import { colors, space } from '../lib/theme';
import { Button } from './Button';

/** Faster than anyone answers Android's question: it was not shown. */
export const NO_QUESTION_MS = 400;

export function AskForPhotos({ access, onAsk, onFiles }: { access: { canAskAgain: boolean; refused: boolean }; onAsk: () => Promise<void>; onFiles: () => Promise<void> }) {
  const off = !access.canAskAgain;
  const refused = access.refused && !off;
  // Asked again while off, and Android answered without asking.
  const [wontAsk, setWontAsk] = useState(false);
  const askAgain = async () => {
    const asked = Date.now();
    await onAsk();
    if (off && Date.now() - asked < NO_QUESTION_MS) setWontAsk(true);
  };
  return (
    <SafeAreaView edges={['bottom']} style={styles.ask}>
      <View style={styles.askText}>
        <Text style={styles.heading}>{off ? 'Photo access is off' : refused ? 'Photo access was not allowed' : 'Pick photos from your phone'}</Text>
        <Text style={styles.body}>{ASK_LINE}</Text>
        {off && <Text style={styles.body}>{SETTINGS_HOW}</Text>}
        <Text style={styles.small}>{FILES_WORKS}</Text>
      </View>
      <View style={styles.askButtons}>
        {off || refused ? (
          <>
            <Button label={FILES} onPress={() => { void onFiles(); }} testID="files-main" />
            {!(off && wontAsk) && <Button label="Ask for photo access again" kind="plain" onPress={() => { void askAgain(); }} testID="ask-again" />}
            {off && <Button label="Open Settings" kind="plain" onPress={() => { void Linking.openSettings(); }} testID="open-settings" />}
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
