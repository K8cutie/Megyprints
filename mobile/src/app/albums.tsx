import { Redirect, router } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { changedAgo, type AlbumRow } from '../lib/albums';
import { useAuth } from '../lib/auth';
import { colors, space } from '../lib/theme';
import { useMyAlbums } from '../lib/useMyAlbums';

/** The signed-in person's albums: name, size, pages, when it last changed. */
export default function Albums() {
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user.id;
  const { albums, loading, failed, retrying, retry } = useMyAlbums(userId);

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
      renderItem={({ item }) => <AlbumCard album={item} />}
      ListFooterComponent={<AccountLinks />}
    />
  );
}

/** Your orders and My profile, from My albums. */
function AccountLinks() {
  return (
    <View style={styles.links}>
      <Button label="Your orders" kind="plain" onPress={() => router.push('/orders')} style={styles.half} testID="albums-orders" />
      <Button label="My profile" kind="plain" onPress={() => router.push('/profile')} style={styles.half} testID="albums-profile" />
    </View>
  );
}

function AlbumCard({ album }: { album: AlbumRow }) {
  const when = changedAgo(album.updatedAt);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${album.name}, ${album.sizeLabel}, ${album.pages} pages. ${when}`}>
      <Text style={styles.name} numberOfLines={2}>{album.name}</Text>
      <Text style={styles.meta}>{album.sizeLabel} · {album.pages} {album.pages === 1 ? 'page' : 'pages'}</Text>
      {!!when && <Text style={styles.when}>{when}</Text>}
    </View>
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
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, color: colors.text, marginTop: space.xs },
  when: { fontSize: 14, color: colors.muted, marginTop: 2 },
  links: { flexDirection: 'row', gap: space.md, marginTop: space.md, alignSelf: 'stretch' },
  half: { flex: 1, paddingHorizontal: space.sm },
});
