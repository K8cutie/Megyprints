import { Image } from 'expo-image';
import { useState } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { ALBUM_SIZES, type AlbumPage, type AlbumSizePreset, type UploadedPhoto } from '@web/pages/builder/types';
import { PRIORITY, usePagePicture } from '../../builder/usePagePicture';
import type { PageText } from '../../render/pageText';
import { colors } from '../../lib/theme';

/** The album's front, small, in the album's shape: the cover as it prints,
 *  drawn by the page renderer as the Preview draws it (the website's Order
 *  Summary CoverThumb: "the front of the book, as it prints"). Until it is
 *  drawn, or when it can't be (the test album has no text drawer), the
 *  cover's photo; with neither, a plain "Cover" box. */
export function CoverThumb({ cover, photos, text, photoUri, albumSize, width = 88 }: {
  cover: AlbumPage | null;
  photos: UploadedPhoto[] | null;
  text: PageText | null;
  photoUri: string | null;
  albumSize: AlbumSizePreset;
  width?: number;
}) {
  const [broken, setBroken] = useState(false);
  const size = ALBUM_SIZES.find((s) => s.preset === albumSize);
  const height = size ? Math.round((width * size.height) / size.width) : width;
  const req = cover && photos ? { page: cover, pageIndex: 0, albumSize, photos, width: Math.round(width * PixelRatio.get()), coverMode: true } : null;
  const drawn = usePagePicture(text, req, PRIORITY.shown);
  if (drawn.uri) {
    return <Image source={{ uri: drawn.uri }} style={[styles.photo, { width, height }]} contentFit="fill" transition={0} accessibilityLabel="Your cover" testID="order-cover" />;
  }
  if (!photoUri || broken) {
    return (
      <View style={[styles.box, { width, height }]} testID="order-cover-empty">
        <Text style={styles.text}>Cover</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: photoUri }}
      style={[styles.photo, { width, height }]}
      contentFit="cover"
      transition={0}
      onError={() => setBroken(true)}
      accessibilityLabel="Your cover"
      testID="order-cover"
    />
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#F6E7DF', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  photo: { borderRadius: 4, backgroundColor: colors.border },
  text: { fontSize: 12, color: colors.muted },
});
