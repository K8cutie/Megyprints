import { router } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { releasePickedFiles } from '../../modules/photo-files';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { albumInProgress, resumeRoute, startNewNote } from '../builder/albumFlow';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draftStore';
import { colors, space } from '../lib/theme';

/** The start screen. */
export default function Start() {
  const { loading, session, signOut } = useAuth();
  const email = session?.user.email;
  const { builder, platform } = useBuilder();
  const { draft, clear } = useDraft();
  const inProgress = albumInProgress(builder, draft.photos.length);

  const startNew = () => {
    // Signed out the album is deleted (reset forgets it): the access kept to
    // photos picked with "Choose from Files" is given back too (Android keeps
    // at most 512 such grants per app). Signed in it stays in the account,
    // and so does its access to its photos.
    if (!session) void releasePickedFiles(draft.photos.filter((p) => p.source === 'files').map((p) => p.uri)).catch(() => 0);
    builder.reset();
    clear();
    router.push('/album-name');
  };
  const askStartNew = () => {
    Alert.alert('Start a new album?', startNewNote(!!session, builder.uploadedPhotos.length + draft.photos.length > 0), [
      { text: 'Keep my album', style: 'cancel' },
      { text: 'Start a new album', style: 'destructive', onPress: startNew },
    ]);
  };
  const albumButtons = inProgress ? (
    <>
      <Button label="Continue my album" onPress={() => router.push(resumeRoute(builder, platform.deviceStore) as never)} testID="continue-album" />
      <Button label="Start a new album" kind="plain" onPress={askStartNew} testID="new-album" />
    </>
  ) : (
    <Button label="Make an album" onPress={() => router.push('/album-name')} testID="make-album" />
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.top}>
        {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
        <Image source={require('../../assets/android-icon-foreground.png')} style={styles.mascot} accessibilityIgnoresInvertColors />
        <Text style={styles.title}>Megy Prints</Text>
        <Text style={styles.lead}>Make a photo album from the photos on your phone. We print it and send it to you.</Text>
      </View>

      <View style={styles.actions}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : session ? (
          <>
            {albumButtons}
            <Text style={styles.who}>Signed in as {email ?? 'your account'}</Text>
            <Button label="See my albums" kind="plain" onPress={() => router.push('/albums')} testID="see-albums" />
            <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.link}>
              <Text style={styles.linkText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            {albumButtons}
            <Button label="Sign in" kind="plain" onPress={() => router.push('/sign-in')} testID="go-sign-in" />
          </>
        )}
        <Button label="Shared code check" kind="plain" onPress={() => router.push('/shared-check')} testID="go-check" />
        <Button label="Checkout with a test album" kind="plain" onPress={() => router.push('/order')} testID="go-order" />
      </View>

      <Text style={styles.note}>Test version 2.0 (dev). You can make an album from your photos and see it as a book. You can also try checkout with a test album (nothing is ordered). Editing pages and real orders come in later versions.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.lg, justifyContent: 'space-between' },
  top: { alignItems: 'center', marginTop: space.xl },
  mascot: { width: 160, height: 160 },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, marginTop: space.sm },
  lead: { fontSize: 17, lineHeight: 24, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  actions: { gap: space.md },
  who: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  link: { alignSelf: 'center', padding: space.sm },
  linkText: { fontSize: 16, color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: space.md },
});
