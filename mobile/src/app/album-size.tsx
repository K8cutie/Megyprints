/* ══════════════════════════════════════════════════════════════════════════
   STEP 2: THE ALBUM'S SIZE (the website's size step: BuilderSetup's cards
   and the wizard's "photos per page" line, its words).

   The sizes are the website's own list (types.ts ALBUM_SIZES), the ones with
   page layouts, less any the owner switched off in /admin (the store
   settings' disabled_sizes, read with the app's client; when they can't be
   read every size is offered, as on the website).

   Once the album has pages, a size tap is the website's change_size: every
   page is laid out again for the new shape, asked first (albumFlow.sizeTap,
   resizeMadeAlbum). Setting the size alone left the old layout squashed onto
   the new size (1-star testers, 2026-10-04).
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AlbumSizeConfig } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { offerableSizes, pagesHoldPhotos, resizeMadeAlbum, saveStep, SIZE_LINE, sizePhotosPerPage, sizeTap } from '../builder/albumFlow';
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
  const [resizing, setResizing] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // The builder as of now, for answers that arrive later.
  const now = useRef(builder);
  now.current = builder;
  useEffect(() => {
    let live = true;
    void disabledSizes().then((off) => {
      if (!live) return;
      const next = offerableSizes(off);
      setSizes(next);
      // The size on the album is no longer offered: the first one that is,
      // but only while no page holds a photo (a made album is never laid out
      // again without a tap and a yes).
      const b = now.current;
      if (next.length && !next.some((s) => s.preset === b.albumSize) && !pagesHoldPhotos(b.albumPages, b.coverFront)) b.setAlbumSize(next[0].preset);
    });
    return () => { live = false; };
  }, []);

  const pick = (size: AlbumSizeConfig) => {
    if (resizing) return;
    const tap = sizeTap(builder, size.preset);
    if (tap.kind === 'same') return;
    if (tap.kind === 'set') { setSaid(null); builder.setAlbumSize(size.preset); return; }
    if (tap.kind === 'tooFew') { Alert.alert('Add more photos first', tap.message); return; }
    Alert.alert(`Make it ${size.name}?`, tap.question, [
      { text: 'Keep this size', style: 'cancel' },
      {
        text: 'Lay it out again',
        onPress: () => {
          setResizing(size.preset);
          void resizeMadeAlbum(now.current, size.preset)
            .then((r) => setSaid(r.message))
            .catch(() => setSaid('The size was not changed. Try again.'))
            .finally(() => setResizing(null));
        },
      },
    ]);
  };

  const next = () => {
    saveStep(platform.deviceStore, 'photos');
    router.push('/photos');
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Pick the size for your album</Text>
        <Text style={styles.lead}>Choose the size that fits your photos best. You can always change this later.</Text>
        {resizing && <Text style={styles.said} testID="size-resizing">Laying out every page again for the new size…</Text>}
        {!resizing && said && <Text style={styles.said} testID="size-said">{said}</Text>}
        {sizes.map((s) => {
          const on = s.preset === builder.albumSize;
          return (
            <Pressable key={s.preset} accessibilityRole="radio" accessibilityState={{ checked: on, busy: resizing === s.preset }} onPress={() => pick(s)}
              style={[styles.card, on && styles.cardOn]} testID={`size-${s.preset}`}>
              <View style={styles.cardTop}>
                <View style={[styles.shape, s.category === 'landscape' ? styles.landscape : s.category === 'portrait' ? styles.portrait : styles.square]} />
                <View style={styles.cardWords}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.perPage}>{sizePhotosPerPage(s.preset)}</Text>
                </View>
                {resizing === s.preset ? <ActivityIndicator color={colors.accent} />
                  : on && <Text style={styles.tick} accessibilityLabel="Picked">✓</Text>}
              </View>
              {SIZE_LINE[s.preset] && <Text style={styles.line}>{SIZE_LINE[s.preset]}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button label="Next: add your photos →" onPress={next} busy={!!resizing} testID="size-next" />
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
  said: { fontSize: 15, lineHeight: 21, color: colors.text, backgroundColor: '#FFF5F0', borderRadius: 10, padding: space.sm },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
