/* ══════════════════════════════════════════════════════════════════════════
   STEP 2: THE ALBUM'S SIZE (the website's size step: BuilderSetup's cards
   and the wizard's "photos per page" line, its words).

   The sizes are the website's own list (types.ts ALBUM_SIZES), the ones with
   page layouts, less any the owner switched off in /admin (the store
   settings' disabled_sizes, read with the app's client; when they can't be
   read every size is offered, as on the website).
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AlbumSizeConfig } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { offerableSizes, saveStep, SIZE_LINE, sizePhotosPerPage } from '../builder/albumFlow';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';

/** The sizes the owner switched off (public_price_schedule), or none. */
async function disabledSizes(): Promise<string[]> {
  if (!supabaseConfigured) return [];
  try {
    const { data, error } = await supabase.rpc('public_price_schedule');
    const list = !error && data && typeof data === 'object' ? (data as { disabled_sizes?: unknown }).disabled_sizes : null;
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export default function AlbumSize() {
  const { builder, platform } = useBuilder();
  const [sizes, setSizes] = useState<AlbumSizeConfig[]>(() => offerableSizes());
  useEffect(() => {
    let live = true;
    void disabledSizes().then((off) => {
      if (!live) return;
      const next = offerableSizes(off);
      setSizes(next);
      // The size on the album is no longer offered: the first one that is.
      if (next.length && !next.some((s) => s.preset === builder.albumSize)) builder.setAlbumSize(next[0].preset);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    saveStep(platform.deviceStore, 'photos');
    router.push('/photos');
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Pick the size for your album</Text>
        <Text style={styles.lead}>Choose the size that fits your photos best. You can always change this later.</Text>
        {sizes.map((s) => {
          const on = s.preset === builder.albumSize;
          return (
            <Pressable key={s.preset} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => builder.setAlbumSize(s.preset)}
              style={[styles.card, on && styles.cardOn]} testID={`size-${s.preset}`}>
              <View style={styles.cardTop}>
                <View style={[styles.shape, s.category === 'landscape' ? styles.landscape : s.category === 'portrait' ? styles.portrait : styles.square]} />
                <View style={styles.cardWords}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.perPage}>{sizePhotosPerPage(s.preset)}</Text>
                </View>
                {on && <Text style={styles.tick} accessibilityLabel="Picked">✓</Text>}
              </View>
              {SIZE_LINE[s.preset] && <Text style={styles.line}>{SIZE_LINE[s.preset]}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button label="Next: add your photos →" onPress={next} testID="size-next" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, gap: space.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  lead: { fontSize: 16, lineHeight: 23, color: colors.muted },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, padding: space.md, gap: space.sm },
  cardOn: { borderColor: colors.accent, backgroundColor: '#FFF5F0' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  shape: { borderRadius: 4, backgroundColor: '#F2D9CC', borderWidth: 1, borderColor: '#E3C2B1' },
  square: { width: 36, height: 36 },
  landscape: { width: 44, height: 30 },
  portrait: { width: 30, height: 44 },
  cardWords: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  perPage: { fontSize: 14, color: colors.muted },
  tick: { fontSize: 22, fontWeight: '800', color: colors.accent },
  line: { fontSize: 15, color: colors.text },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
