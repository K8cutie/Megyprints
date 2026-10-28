import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ALBUM_SIZES, type AlbumSizePreset } from '@web/pages/builder/types';
import { colors } from '../../lib/theme';

/** The album's front, small, in the album's shape. For now only the cover's
 *  photo: the page drawer that draws the whole cover (words, colours) is not
 *  in the app yet (held PR), and the test panel says so. */
export function CoverThumb({ uri, albumSize, width = 88 }: { uri: string | null; albumSize: AlbumSizePreset; width?: number }) {
  const [broken, setBroken] = useState(false);
  const size = ALBUM_SIZES.find((s) => s.preset === albumSize);
  const height = size ? Math.round((width * size.height) / size.width) : width;
  if (!uri || broken) {
    return (
      <View style={[styles.box, { width, height }]}>
        <Text style={styles.text}>Cover</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.photo, { width, height }]}
      contentFit="cover"
      transition={0}
      onError={() => setBroken(true)}
      accessibilityLabel="Your cover"
    />
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#F6E7DF', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  photo: { borderRadius: 4, backgroundColor: colors.border },
  text: { fontSize: 12, color: colors.muted },
});
