import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { resumeRoute } from '../builder/albumFlow';
import { useBuilder } from '../builder/BuilderProvider';
import { Button } from '../components/Button';
import { changedAgo, DELETE_ALBUM_TITLE, deleteAlbumMessage, type AlbumRow } from '../lib/albums';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draftStore';
import { colors, space } from '../lib/theme';
import { useMyAlbums } from '../lib/useMyAlbums';

/** The signed-in person's albums: name, size, pages, when it last changed.
 *  Tapping one opens it, as the website's albums open in its builder
 *  (/builder?album=<id> → loadAlbum): the same loadAlbum, then where
 *  "Continue my album" goes (owner, 2026-11-05: "Why cant i open the albums
 *  is that just a list"). */
export default function Albums() {
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user.id;
  const { builder, platform } = useBuilder();
  // Read again when the builder saves (an album on the phone, saved as you signed in).
  const { albums, loading, failed, retrying, retry, remove } = useMyAlbums(userId, builder.lastSavedAt?.getTime() ?? 0);
  const { clear: clearDraft } = useDraft();
  const [opening, setOpening] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [couldNot, setCouldNot] = useState<string | null>(null);
  const [notDeleted, setNotDeleted] = useState<string | null>(null);

  async function deleteIt(album: AlbumRow) {
    setNotDeleted(null);
    const onThePhone = builder.getAlbumId() === album.id;
    if (!(await remove(album.id))) { setNotDeleted(album.id); return; }
    // The album on the phone: let it go too, or the next save would ask about it.
    if (onThePhone) { builder.letDeletedAlbumGo(); clearDraft(); }
  }
  const askDelete = (album: AlbumRow) => {
    Alert.alert(DELETE_ALBUM_TITLE, deleteAlbumMessage(album.name), [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete album', style: 'destructive', onPress: () => deleteIt(album) },
    ]);
  };

  async function open(album: AlbumRow) {
    if (openingRef.current) return;
    openingRef.current = album.id;
    setOpening(album.id);
    setCouldNot(null);
    try { await builder.loadAlbum(album.id); } catch { /* not opened: said on its card */ }
    // A read that failed leaves the album on the phone as it was.
    if (builder.getAlbumId() === album.id) { setOpened(album.id); return; }
    openingRef.current = null;
    setOpening(null);
    setCouldNot(album.id);
  }
  // Once the album is on screen: its pages when it is made, else its next step.
  useEffect(() => {
    if (!opened || builder.isLoadingCloud || builder.getAlbumId() !== opened) return;
    setOpened(null);
    openingRef.current = null;
    setOpening(null);
    // At its cover: opening keeps the page the album before it was left on
    // (Mother, round 4: another album opened at "Page 37 of 40").
    builder.goToPage(0);
    router.push(resumeRoute(builder, platform.deviceStore));
  }, [opened, builder, platform.deviceStore]);

  if (!authLoading && !session) return <Redirect href="/sign-in" />;

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>Getting your albums</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Could not load your albums</Text>
        <Text style={styles.muted}>Your albums are safe. Check that the phone is online, then try again. We also try again by ourselves.</Text>
        <Button label={retrying ? 'Trying again' : 'Try again'} busy={retrying} onPress={retry} style={styles.button} testID="albums-retry" />
      </View>
    );
  }

  if (albums.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>No albums yet</Text>
        <Text style={styles.muted}>Albums you make in this app or on the Megy Prints website show here while you are signed in.</Text>
        <AccountLinks />
      </View>
    );
  }

  return (
    <FlatList
      data={albums}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<Text style={styles.count}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</Text>}
      renderItem={({ item }) => (
        <AlbumCard album={item} opening={opening === item.id} busy={opening !== null} couldNot={couldNot === item.id} notDeleted={notDeleted === item.id}
          onOpen={() => { void open(item); }} onDelete={() => askDelete(item)} />
      )}
      extraData={`${opening}|${couldNot}|${notDeleted}`}
      ListFooterComponent={<AccountLinks />}
    />
  );
}

/** Your orders, My profile and My memories, from My albums. */
function AccountLinks() {
  return (
    <View style={styles.linkBlock}>
      <View style={styles.links}>
        <Button label="Your orders" kind="plain" onPress={() => router.push('/orders')} style={styles.half} testID="albums-orders" />
        <Button label="My profile" kind="plain" onPress={() => router.push('/profile')} style={styles.half} testID="albums-profile" />
      </View>
      <Button label="My memories" kind="plain" onPress={() => router.push('/memories')} testID="albums-memories" />
    </View>
  );
}

function AlbumCard({ album, opening, busy, couldNot, notDeleted, onOpen, onDelete }: {
  album: AlbumRow; opening: boolean; busy: boolean; couldNot: boolean; notDeleted: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const when = changedAgo(album.updatedAt);
  return (
    <Pressable onPress={onOpen} disabled={busy} testID={`album-open-${album.id}`}
      accessibilityRole="button" accessibilityState={{ busy: opening, disabled: busy && !opening }}
      accessibilityLabel={`Open ${album.name}, ${album.sizeLabel}, ${album.pages} pages. ${when}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardRow}>
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={2}>{album.name}</Text>
          <Text style={styles.meta}>{album.sizeLabel} · {album.pages} {album.pages === 1 ? 'page' : 'pages'}</Text>
          {!!when && <Text style={styles.when}>{when}</Text>}
        </View>
        {opening
          ? <View style={styles.openWrap}><ActivityIndicator color={colors.accent} /><Text style={styles.open}>Opening…</Text></View>
          : <Text style={styles.open}>Open ›</Text>}
      </View>
      {couldNot && <Text style={styles.bad}>Could not open {album.name}. Check that the phone is online, then try again.</Text>}
      {notDeleted && <Text style={styles.bad}>Could not delete {album.name}. Check that the phone is online, then try again.</Text>}
      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityLabel={`Delete ${album.name}`} hitSlop={4}
        testID={`album-delete-${album.id}`} style={({ pressed }) => [styles.delete, pressed && styles.deletePressed]}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.sm, backgroundColor: colors.background },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  muted: { fontSize: 16, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  button: { marginTop: space.md, alignSelf: 'stretch' },
  list: { padding: space.md, gap: space.sm },
  count: { fontSize: 15, color: colors.muted, marginBottom: space.xs },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md },
  cardPressed: { borderColor: colors.accent },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardText: { flex: 1 },
  openWrap: { alignItems: 'center', gap: 2 },
  open: { fontSize: 16, fontWeight: '700', color: colors.accent },
  bad: { fontSize: 15, lineHeight: 21, color: colors.bad, marginTop: space.sm },
  delete: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: space.lg, marginTop: 2, marginBottom: -space.sm },
  deletePressed: { opacity: 0.6 },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.bad },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, color: colors.text, marginTop: space.xs },
  when: { fontSize: 14, color: colors.muted, marginTop: 2 },
  linkBlock: { gap: space.md, marginTop: space.md, alignSelf: 'stretch' },
  links: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch' },
  half: { flex: 1, paddingHorizontal: space.sm },
});
