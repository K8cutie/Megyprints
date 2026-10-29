/* Where "Next" on Your photos goes. The album steps (name, size, cover, Make
   my album) are Phase 3; until then this says so, and the way on is back. */
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useDraft } from '../lib/draftStore';
import { formatCount } from '../lib/photoDays';
import { colors, space } from '../lib/theme';

export default function AlbumNext() {
  const { draft } = useDraft();
  const n = draft.photos.length;
  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Your {formatCount(n)} photos are ready</Text>
      <Text style={styles.body}>
        Next you will name your album, pick its size and its cover, and we make the pages. That part comes in the next test version of this app.
      </Text>
      <Text style={styles.small}>Your photos stay picked, even if you close the app.</Text>
      <Button label="Back to your photos" onPress={() => (router.canGoBack() ? router.back() : router.replace('/photos'))} style={styles.button} testID="back-to-photos" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, padding: space.lg, justifyContent: 'center', gap: space.md },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  small: { fontSize: 15, color: colors.muted },
  button: { marginTop: space.md },
});
