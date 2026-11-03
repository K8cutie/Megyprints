/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN, the website's home at phone width (owner, 2026-11-03:
   "1.x looks more 2.0 than 2.0"): the albums photo behind everything, gently
   zooming; "Megy · Prints" and the menu over it; the Albums and Events cards
   (src/home/HomeCards.tsx). The app's own parts stay: Continue my album /
   Start a new album in the Albums card, Sign in at the top, the account's
   places in their own card when signed in, and, in the dev build only, the
   test buttons and the "Test version" note at the bottom.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Alert, Animated, type ImageSourcePropType, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { releasePickedFiles } from '../../modules/photo-files';
import { useBuilder } from '../builder/BuilderProvider';
import { albumInProgress, resumeRoute, startNewNote } from '../builder/albumFlow';
import { AlbumsCard, CardButton, EventsCard, INK, StartCreating } from '../home/HomeCards';
import { HomeMenu, type MenuItem } from '../home/HomeMenu';
import { HomeTypeContext, useHomeType, useType } from '../home/homeFonts';
import { MenuBars } from '../home/homeIcons';
import { HomeMotionProvider, useHomeMotion } from '../home/homeMotion';
import { HOME } from '../home/homeWords';
import { useAuth } from '../lib/auth';
import { buildKind } from '../lib/buildKind';
import { EVENTS_LABEL, EVENTS_PAGE } from '../lib/events';
import { useDraft } from '../lib/draftStore';
import { useReduceMotion } from '../lib/reduceMotion';

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const HERO: ImageSourcePropType = require('../../assets/home/hero.jpg');

/** The photo behind the screen, under the website's light veil. */
function Backdrop() {
  const m = useHomeMotion();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.Image source={HERO} resizeMode="cover" style={[StyleSheet.absoluteFill, m.kenBurns]} testID="home-photo" />
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
    </View>
  );
}

/** "Megy · Prints", the website's header. */
function Wordmark() {
  const t = useType();
  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Megy Prints">
      <Text style={[t.displayItalic, styles.megy]}>Megy</Text>
      <View style={styles.dot} />
      <Text style={[t.body, styles.prints]}>Prints</Text>
    </View>
  );
}

/** The account's places, signed in (the website's projects under the cards). */
function AccountCard({ email, signOut }: { email: string | undefined; signOut: () => void }) {
  const t = useType();
  const place = (label: string, to: string, testID: string) => (
    <CardButton label={label} onPress={() => router.push(to as never)} testID={testID} tall={false} />
  );
  return (
    <View style={styles.card} testID="home-account-card">
      <Text style={[t.bodyBold, styles.label]}>{HOME.account.toUpperCase()}</Text>
      <Text style={[t.body, styles.who]}>{HOME.signedInAs(email)}</Text>
      <View style={styles.pair}>
        <View style={styles.half}>{place(HOME.albums, '/albums', 'see-albums')}</View>
        <View style={styles.half}>{place(HOME.orders, '/orders', 'see-orders')}</View>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}>{place(HOME.profile, '/profile', 'see-profile')}</View>
        <View style={styles.half}>{place(HOME.memories, '/memories', 'see-memories')}</View>
      </View>
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.link} testID="sign-out">
        <Text style={[t.bodyBold, styles.linkText]}>{HOME.signOut}</Text>
      </Pressable>
    </View>
  );
}

export default function Start() {
  const testBuild = buildKind() === 'dev';
  const type = useHomeType();
  const focused = useIsFocused();
  const still = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { loading, session, signOut } = useAuth();
  const email = session?.user.email;
  const { builder, platform } = useBuilder();
  const { draft, clear } = useDraft();
  const inProgress = albumInProgress(builder, draft.photos.length);
  const [menu, setMenu] = useState(false);

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
  const openEvents = () => { void Linking.openURL(EVENTS_PAGE); };
  const go = (to: string) => router.push(to as never);

  const menuItems: MenuItem[] = [
    ...(session ? [
      { label: HOME.albums, onPress: () => go('/albums'), testID: 'menu-albums' },
      { label: HOME.orders, onPress: () => go('/orders'), testID: 'menu-orders' },
      { label: HOME.profile, onPress: () => go('/profile'), testID: 'menu-profile' },
      { label: HOME.memories, onPress: () => go('/memories'), testID: 'menu-memories' },
    ] : [{ label: HOME.signIn, onPress: () => go('/sign-in'), testID: 'menu-sign-in' }]),
    { label: EVENTS_LABEL, onPress: openEvents, testID: 'menu-events' },
    ...(session ? [{ label: HOME.signOut, onPress: () => { void signOut(); }, testID: 'menu-sign-out' }] : []),
  ];

  return (
    <HomeTypeContext.Provider value={type}>
      <HomeMotionProvider running={focused} still={still}>
        <View style={styles.page}>
          <Backdrop />
          <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
              <Wordmark />
              <View style={styles.headerRight}>
                {!loading && !session && (
                  <Pressable onPress={() => go('/sign-in')} accessibilityRole="button" testID="go-sign-in" style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}>
                    <Text style={[type.bodyBold, styles.signInText]}>{HOME.signIn}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={HOME.menu} hitSlop={6} testID="home-menu" style={styles.menuButton}>
                  <MenuBars color={INK.dark} />
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
              <AlbumsCard>
                {inProgress ? (
                  <>
                    <StartCreating label={HOME.continueAlbum} sparkle={false} onPress={() => go(resumeRoute(builder, platform.deviceStore))} testID="continue-album" />
                    <CardButton label={HOME.newAlbum} onPress={askStartNew} testID="new-album" tall={false} />
                  </>
                ) : (
                  <StartCreating onPress={() => go('/album-name')} testID="make-album" />
                )}
              </AlbumsCard>
              <EventsCard onBook={openEvents} />
              {!loading && session && <AccountCard email={email} signOut={() => { void signOut(); }} />}
              {testBuild && (
                <View style={[styles.card, styles.testCard]} testID="home-test-card">
                  <Text style={[type.body, styles.note]}>Test version 2.0 (dev). You can make an album from your photos, see it as a book, edit its pages and order it, and see your orders, your QR memories and your profile. Checkout with the test album orders nothing.</Text>
                  <CardButton label="Shared code check" onPress={() => go('/shared-check')} testID="go-check" tall={false} />
                  <CardButton label="Checkout with a test album" onPress={() => go('/order')} testID="go-order" tall={false} />
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
          {menu && <HomeMenu items={menuItems} note={session ? HOME.signedInAs(email) : undefined} close={() => setMenu(false)} />}
        </View>
      </HomeMotionProvider>
    </HomeTypeContext.Provider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#E9E1D6' },
  fill: { flex: 1 },
  veil: { backgroundColor: 'rgba(45, 40, 36, 0.22)' },
  header: { height: 64, paddingLeft: 20, paddingRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wordmark: { flexDirection: 'row', alignItems: 'center' },
  megy: { fontSize: 25, color: INK.dark },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: INK.peach, marginHorizontal: 3, marginTop: 8 },
  prints: { fontSize: 21, color: INK.dark },
  signIn: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.92)', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' },
  signInText: { fontSize: 14, color: INK.label },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, gap: 10, boxShadow: '0 16px 40px rgba(0, 0, 0, 0.2)' },
  testCard: { backgroundColor: 'rgba(255, 255, 255, 0.94)' },
  label: { fontSize: 11, letterSpacing: 1.1, color: INK.label },
  who: { fontSize: 14, color: INK.soft },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  link: { alignSelf: 'center', padding: 8 },
  linkText: { fontSize: 15, color: INK.peach, textDecorationLine: 'underline' },
  note: { fontSize: 13, lineHeight: 18, color: INK.soft, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
