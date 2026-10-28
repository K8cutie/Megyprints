import { router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useAuth } from '../lib/auth';
import { colors, space } from '../lib/theme';

/** The start screen. */
export default function Start() {
  const { loading, session, signOut } = useAuth();
  const email = session?.user.email;

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
            <Button label="Make an album" onPress={() => router.push('/photos')} testID="make-album" />
            <Text style={styles.who}>Signed in as {email ?? 'your account'}</Text>
            <Button label="See my albums" kind="plain" onPress={() => router.push('/albums')} testID="see-albums" />
            <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.link}>
              <Text style={styles.linkText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button label="Make an album" onPress={() => router.push('/photos')} testID="make-album" />
            <Button label="Sign in" kind="plain" onPress={() => router.push('/sign-in')} testID="go-sign-in" />
          </>
        )}
        <Button label="Shared code check" kind="plain" onPress={() => router.push('/shared-check')} testID="go-check" />
        <Button label="Checkout with a test album" kind="plain" onPress={() => router.push('/order')} testID="go-order" />
      </View>

      <Text style={styles.note}>Test version 2.0 (dev). You can pick the photos for an album, and see checkout with a test album (nothing is ordered). Making the pages comes in a later version.</Text>
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
