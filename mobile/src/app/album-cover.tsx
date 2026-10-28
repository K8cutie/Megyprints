/* ══════════════════════════════════════════════════════════════════════════
   STEP 4: THE COVER (the website's CoverEditor, cover step: its words), then
   "Make my album".

   One of the album's photos goes on the front cover with a tap (the builder's
   setCoverToPhoto, as a tap in the website's cover step), and the title is
   the album's name until the customer types their own (box 0 of the cover
   page). The front cover is drawn by the app's page renderer the way print
   draws it (coverMode). While this screen is open the builder edits the
   cover (its cover scope), as while the website's cover editor is open.

   The title's "too long" check is shown only when the title's font is one
   the app has: measured in the phone's own font instead, its answer would be
   a guess. (The website's cover default, Cinzel, is in the app: 400 and 700.)
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { AlbumPage } from '@web/pages/builder/types';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coverTitleFit } from '@web/pages/builder/textFit';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { useBuilder } from '../builder/BuilderProvider';
import { albumMade, chooseCover, COVER_PHOTOS_SHOWN, coverPhotoId, coverPhotos, coverStepNext, coverTitle, photosIn, saveStep, setCoverTitleText } from '../builder/albumFlow';
import { NOT_DRAWN_LINE } from '../builder/screenWords';
import { forgetPhotoPictures, usePagePicture } from '../builder/usePagePicture';
import { useGoToPreview } from '../builder/useGoToPreview';
import { bundledFace, familyFaces } from '../render/fontTable';
import { colors, space } from '../lib/theme';

const COLUMNS = 4;
const GAP = 6;
/** The cover picture waits this long after the last key typed in the title. */
const TYPING_MS = 350;

/** The cover as of TYPING_MS after it last changed: one picture per pause in
 *  typing, not one per key (each is a whole cover drawn and saved). */
function useSettledCover(cover: AlbumPage): AlbumPage {
  const [settled, setSettled] = useState(cover);
  useEffect(() => {
    if (settled === cover) return;
    const t = setTimeout(() => setSettled(cover), TYPING_MS);
    return () => clearTimeout(t);
  }, [cover, settled]);
  return settled;
}

/** The title's own font is one the app has (so it is measured as printed). */
function titleFontInApp(cover: AlbumPage): boolean {
  const family = cover.textElements?.find((t) => t.boxIndex === 0)?.fontFamily;
  const first = familyFaces(family)[0];
  return !!first && bundledFace(first) !== null;
}

export default function AlbumCover() {
  const { builder, platform, text } = useBuilder();
  const { width: screenW } = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);

  // Own the cover scope while open; always hand it back (CoverEditor).
  const { setEditScope } = builder;
  useEffect(() => {
    setEditScope('coverFront');
    return () => setEditScope('interior');
  }, [setEditScope]);
  // The decoded photos go when the cover step is left (they are a few MB each).
  useEffect(() => () => forgetPhotoPictures(), []);
  const goToPreview = useGoToPreview();

  const photos = useMemo(() => coverPhotos(builder.uploadedPhotos).filter((p) => !!p.previewUrl), [builder.uploadedPhotos]);
  const onCover = coverPhotoId(builder);
  const shown = useMemo(() => {
    if (showAll || photos.length <= COVER_PHOTOS_SHOWN) return photos;
    const top = photos.slice(0, COVER_PHOTOS_SHOWN);
    const picked = onCover && !top.some((p) => p.id === onCover) ? photos.find((p) => p.id === onCover) : undefined;
    return picked ? [picked, ...top.slice(0, COVER_PHOTOS_SHOWN - 1)] : top;
  }, [photos, showAll, onCover]);

  const title = coverTitle(builder);
  const fit = titleFontInApp(builder.coverFront) ? coverTitleFit(builder.coverFront, builder.albumSize, platform.textMeasurer()) : null;
  const next = coverStepNext(albumMade(builder.albumPages), photosIn(builder));
  const cover = useSettledCover(builder.coverFront);

  // The front cover as print draws it, fitted to the screen.
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const coverW = Math.min(screenW - space.lg * 2, 300);
  const coverH = Math.round((coverW * size.height) / size.width);
  const picture = usePagePicture(text, {
    page: cover, pageIndex: 0, albumSize: builder.albumSize, photos: builder.uploadedPhotos,
    width: Math.round(coverW * 2), coverMode: true,
  });

  const cell = Math.floor((screenW - space.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  const goOn = () => {
    if (next.go === 'photos') { saveStep(platform.deviceStore, 'photos'); router.push('/photos'); return; }
    if (next.go === 'pages') { goToPreview(); return; }
    router.push('/making');
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Design your cover</Text>
        <Text style={styles.sub} testID="cover-one-photo">Pick 1 photo for the front cover</Text>

        <View style={[styles.cover, { width: coverW, height: coverH }]} testID="cover-picture">
          {picture.uri ? (
            <Image source={{ uri: picture.uri }} style={{ width: coverW, height: coverH }} contentFit="fill" />
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
        <Text style={styles.caption}>Front cover</Text>
        {picture.notDrawn.length > 0 && <Text style={styles.notDrawn} testID="cover-not-drawn">{NOT_DRAWN_LINE}</Text>}

        <Text style={styles.label}>Your photos, best ones first. Tap one.</Text>
        <View style={styles.grid}>
          {shown.map((p) => {
            const on = p.id === onCover;
            return (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={on ? 'On the cover' : 'Put this photo on the cover'}
                onPress={() => chooseCover(builder, p.id)} style={[styles.cell, { width: cell, height: cell }, on && styles.cellOn]} testID={`cover-photo-${p.id}`}>
                <Thumb uri={p.previewUrl} size={on ? cell - 6 : cell} recyclingKey={p.id} />
                {on && <View style={styles.tick}><Text style={styles.tickText}>✓</Text></View>}
              </Pressable>
            );
          })}
        </View>
        {photos.length > COVER_PHOTOS_SHOWN && (
          <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.showAll} testID="cover-show-all">
            <Text style={styles.showAllText}>{showAll ? 'Show fewer' : `Show all ${photos.length} photos`}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Cover title</Text>
        <TextInput value={title} onChangeText={(t) => setCoverTitleText(builder, t)} placeholder="e.g. The Cruz Family" placeholderTextColor="#9A948C"
          style={styles.input} testID="cover-title" />
        {fit && !fit.fits && (
          <View style={styles.warn} testID="cover-title-too-long">
            <Text style={styles.warnText}>Too long for the front cover: part of it will be cut off in print. Shorten it{fit.fitsAt ? ', or make the text smaller' : ''}.</Text>
            {fit.fitsAt && (
              <Pressable accessibilityRole="button" onPress={() => builder.setBoxText(0, { text: title, fontSize: fit.fitsAt! })} style={styles.warnButton} testID="cover-title-make-fit">
                <Text style={styles.warnButtonText}>Make it fit (size {fit.fitsAt})</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button label={next.label} onPress={goOn} testID="cover-next" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, gap: space.sm },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.muted, marginBottom: space.sm },
  cover: { alignSelf: 'center', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderRadius: 4, overflow: 'hidden', elevation: 4 },
  caption: { alignSelf: 'center', fontSize: 13, color: colors.muted },
  notDrawn: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderWidth: 3, borderColor: colors.accent },
  tick: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: '#FFFFFF', fontWeight: '800' },
  showAll: { alignSelf: 'center', padding: space.sm },
  showAllText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 17, color: colors.text },
  warn: { borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', borderRadius: 10, padding: space.sm, gap: space.sm },
  warnText: { fontSize: 14, color: '#8A5A12' },
  warnButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E8C98A', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: space.md, paddingVertical: 6 },
  warnButtonText: { fontSize: 14, fontWeight: '700', color: '#8A5A12' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
