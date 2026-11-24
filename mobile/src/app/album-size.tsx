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

   Each album size says what it starts at (lib/checkout/startsAt.ts):
   checkout's total for a 40-page soft-cover album of that size, from the
   same live price list. Nothing is said until the list is read.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALBUM_SIZES, type AlbumSizeConfig } from '@web/pages/builder/types';
import { isMiniSize, miniOfferOf, MINI_NAME, MINI_PAGES, MINI_PHOTO_RANGE, MINI_SIZE, type MiniOffer } from '@web/lib/megyMini';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { offerableSizes, pagesHoldPhotos, resizeMadeAlbum, saveStep, SIZE_LINE, sizePhotosPerPage, sizeTap } from '../builder/albumFlow';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { useOncePerVisit } from '../lib/useOncePerVisit';
import { FREE_QR_MEMORIES, includedVideosValue, launchLine, launchOf, launchOff, videoOfferOf, type PriceSchedule } from '@web/lib/pricing';
import { startsAt, startsAtLine, startsAtRegular } from '../lib/checkout/startsAt';
import { peso } from '../lib/checkout/price';
import { loadLaunchPrice, loadVideoOffer } from '../lib/checkout/priceSchedule';

/** From the price list (public_price_schedule): the sizes the owner switched
 *  off, or none; the Megy Mini while it is on sale (0062), or null; and the
 *  list itself, for each size's "Starts at" (null when it can't be read). */
async function sizeOffers(): Promise<{ off: string[]; mini: MiniOffer | null; schedule: PriceSchedule | null }> {
  if (!supabaseConfigured) return { off: [], mini: null, schedule: null };
  try {
    const [{ data, error }, launch, video] = await Promise.all([supabase.rpc('public_price_schedule'), loadLaunchPrice(supabase), loadVideoOffer(supabase)]);
    // The free videos' worth (0073) is only words here: an offer that didn't
    // load just leaves the line out.
    const schedule = !error && data && typeof data === 'object'
      ? ({ ...(data as object), launch, video_offer: video.ok ? video.offer : null } as { disabled_sizes?: unknown; mini?: unknown })
      : null;
    const list = schedule?.disabled_sizes;
    return {
      off: Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [],
      mini: miniOfferOf(schedule),
      schedule: schedule as PriceSchedule | null,
    };
  } catch {
    return { off: [], mini: null, schedule: null };
  }
}

/** The Megy Mini's card: A5's own size entry, named as the product. */
const MINI_CARD: AlbumSizeConfig = { ...(ALBUM_SIZES.find((s) => s.preset === MINI_SIZE) as AlbumSizeConfig), name: MINI_NAME };

export default function AlbumSize() {
  const { builder, platform } = useBuilder();
  const [sizes, setSizes] = useState<AlbumSizeConfig[]>(() => offerableSizes());
  const [mini, setMini] = useState<MiniOffer | null>(null);
  const [prices, setPrices] = useState<PriceSchedule | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // The launch price (owner, 2026-11-24) while it runs: one line on top.
  const launch = launchOf(prices);
  // The builder as of now, for answers that arrive later.
  const now = useRef(builder);
  now.current = builder;
  useEffect(() => {
    let live = true;
    void sizeOffers().then(({ off, mini: offer, schedule }) => {
      if (!live) return;
      setPrices(schedule);
      const next = offerableSizes(off);
      setSizes(next);
      setMini(offer);
      // The size on the album is no longer offered: the first one that is,
      // but only while no page holds a photo (a made album is never laid out
      // again without a tap and a yes). A Megy Mini stays one while it is on sale.
      const b = now.current;
      const stillOffered = next.some((s) => s.preset === b.albumSize) || (isMiniSize(b.albumSize) && !!offer);
      if (next.length && !stillOffered && !pagesHoldPhotos(b.albumPages, b.coverFront)) b.setAlbumSize(next[0].preset);
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

  // Once per visit, and not while this screen comes on: a double tap on
  // the step before's Next landed here and skipped the size (useOncePerVisit).
  const once = useOncePerVisit();
  const next = once(() => {
    saveStep(platform.deviceStore, 'photos');
    router.push('/photos');
  });

  // The free videos and what they are worth at the single price (0073): one line under each "Starts at".
  const videosValue = prices ? includedVideosValue(FREE_QR_MEMORIES, videoOfferOf(prices)) : null;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Pick the size for your album</Text>
        <Text style={styles.lead}>Choose the size that fits your photos best. You can always change this later.</Text>
        {launch && <Text style={styles.launch} testID="size-launch">{launchLine(launch)}</Text>}
        {resizing && <Text style={styles.said} testID="size-resizing">Laying out every page again for the new size…</Text>}
        {!resizing && said && <Text style={styles.said} testID="size-said">{said}</Text>}
        {sizes.map((s) => {
          const on = s.preset === builder.albumSize;
          const from = startsAt(prices, s.preset);
          const regular = startsAtRegular(prices, s.preset);
          return (
            <Pressable key={s.preset} accessibilityRole="radio" accessibilityState={{ checked: on, busy: resizing === s.preset }} onPress={() => pick(s)}
              style={[styles.card, on && styles.cardOn]} testID={`size-${s.preset}`}>
              <View style={styles.cardTop}>
                <View style={[styles.shape, s.category === 'landscape' ? styles.landscape : s.category === 'portrait' ? styles.portrait : styles.square]} />
                <View style={styles.cardWords}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.perPage}>{sizePhotosPerPage(s.preset)}</Text>
                  {from !== null && <Text style={styles.price} testID={`size-price-${s.preset}`}>{startsAtLine(from)}</Text>}
                  {from !== null && regular !== null && (
                    <Text style={styles.regular} testID={`size-regular-${s.preset}`}>
                      Regular price <Text style={styles.regularWas}>{peso(regular)}</Text>
                      {launch && <Text style={styles.off} testID={`size-off-${s.preset}`}>{`  ${launchOff(launch)}`}</Text>}
                    </Text>
                  )}
                  {from !== null && videosValue !== null && (
                    <Text style={styles.videos} testID={`size-videos-${s.preset}`}>{FREE_QR_MEMORIES} free videos ({peso(videosValue)} value)</Text>
                  )}
                </View>
                {resizing === s.preset ? <ActivityIndicator color={colors.accent} />
                  : on && <Text style={styles.tick} accessibilityLabel="Picked">✓</Text>}
              </View>
              {SIZE_LINE[s.preset] && <Text style={styles.line}>{SIZE_LINE[s.preset]}</Text>}
            </Pressable>
          );
        })}
        {(mini || isMiniSize(builder.albumSize)) && (() => {
          // MEGY MINI (lib/megyMini): its own product next to the albums, shown
          // only while it is on sale (or when this album already is one).
          const on = isMiniSize(builder.albumSize);
          return (
            <>
              <Text style={styles.section}>Or a small booklet</Text>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, busy: resizing === MINI_SIZE }} onPress={() => pick(MINI_CARD)}
                style={[styles.card, on && styles.cardOn]} testID="size-mini">
                <View style={styles.cardTop}>
                  <View style={[styles.shape, styles.mini]} />
                  <View style={styles.cardWords}>
                    <Text style={styles.name}>{MINI_NAME}</Text>
                    <Text style={styles.perPage}>A5 · {MINI_PAGES} pages · {MINI_PHOTO_RANGE} photos</Text>
                  </View>
                  {resizing === MINI_SIZE ? <ActivityIndicator color={colors.accent} />
                    : on && <Text style={styles.tick} accessibilityLabel="Picked">✓</Text>}
                </View>
                <Text style={styles.line}>
                  {mini
                    ? `A stapled booklet with ${mini.free_qr} video memories included. ₱${mini.price} + ₱${mini.shipping_fee} shipping.`
                    : 'A stapled booklet with video memories included.'}
                </Text>
              </Pressable>
            </>
          );
        })()}
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
  // A5 is smaller than every album: a smaller shape, the same portrait.
  mini: { width: 22, height: 31 },
  section: { fontSize: 16, fontWeight: '700', color: colors.muted, marginTop: space.sm },
  cardWords: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  perPage: { fontSize: 14, color: colors.muted },
  price: { fontSize: 15, fontWeight: '700', color: colors.accent, marginTop: 2 },
  regular: { fontSize: 13, color: colors.muted, marginTop: 1 },
  regularWas: { textDecorationLine: 'line-through' },
  off: { fontSize: 13, fontWeight: '800', color: colors.good },
  launch: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.accent, backgroundColor: '#FFF5F0', borderRadius: 10, padding: space.sm },
  videos: { fontSize: 13, fontWeight: '700', color: colors.good, marginTop: 1 },
  tick: { fontSize: 22, fontWeight: '800', color: colors.accent },
  line: { fontSize: 15, color: colors.text },
  said: { fontSize: 15, lineHeight: 21, color: colors.text, backgroundColor: '#FFF5F0', borderRadius: 10, padding: space.sm },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
