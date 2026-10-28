import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

interface Props {
  /** The photo's content:// address on the phone. */
  uri: string;
  size: number;
  /** Ties the image view to this photo while the list reuses views. */
  recyclingKey: string;
}

/** A small square of a photo, read where it is on the phone (Android makes
 *  the small version; nothing is copied). A photo that can't be opened any
 *  more (deleted, or access taken away) says so instead of staying blank. */
export const Thumb = memo(function Thumb({ uri, size, recyclingKey }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === uri) {
    return (
      <View style={[styles.broken, { width: size, height: size }]}>
        <Text style={styles.brokenText}>Photo not found</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, backgroundColor: colors.border }}
      contentFit="cover"
      recyclingKey={recyclingKey}
      cachePolicy="memory-disk"
      transition={0}
      onError={() => setBroken(uri)}
      accessibilityIgnoresInvertColors
    />
  );
});

const styles = StyleSheet.create({
  broken: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 4 },
  brokenText: { fontSize: 11, color: colors.muted, textAlign: 'center' },
});
