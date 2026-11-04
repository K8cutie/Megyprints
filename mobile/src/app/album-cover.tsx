/* ══════════════════════════════════════════════════════════════════════════
   STEP 4: THE COVER (the website's CoverEditor, cover step: its words), then
   "Make my album".

   One of the album's photos goes on the front cover with a tap (the builder's
   setCoverToPhoto, as a tap in the website's cover step); the photos are one
   row you swipe ABOVE the cover, as on the website since #235 (CoverPhotoRow),
   and the title is
   the album's name until the customer types their own (box 0 of the cover
   page). The front cover is drawn by the app's page renderer the way print
   draws it (coverMode). While this screen is open the builder edits the
   cover (its cover scope), as while the website's cover editor is open.

   The title's "too long" check is shown only when the title's font is one
   the app has: measured in the phone's own font instead, its answer would be
   a guess. (The website's cover default, Cinzel, is in the app: 400 and 700.)
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlbumPage } from '@web/pages/builder/types';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coverTitleFit } from '@web/pages/builder/textFit';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { Button } from '../components/Button';
import { CoverPhotoRow } from '../components/CoverPhotoRow';
import { useBuilder } from '../builder/BuilderProvider';
import { albumMade, chooseCover, coverPhotoId, coverPhotos, coverStepNext, coverTitle, photosIn, saveStep, setCoverTitleText } from '../builder/albumFlow';
import { NOT_DRAWN_LINE } from '../builder/screenWords';
import { forgetPhotoPictures, usePagePicture } from '../builder/usePagePicture';
import { useGoToPreview } from '../builder/useGoToPreview';
import { bundledFace, familyFaces } from '../render/fontTable';
import { colors, space } from '../lib/theme';
import { useOncePerVisit } from '../lib/useOncePerVisit';

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

  // Own the cover scope while this is the screen on top; always hand it back
  // (CoverEditor). On focus, not on mount: this screen stays mounted under
  // the Preview and the page editor, which must edit the pages, not the cover.
  const { setEditScope } = builder;
  useFocusEffect(useCallback(() => {
    setEditScope('coverFront');
    return () => setEditScope('interior');
  }, [setEditScope]));
  // The decoded photos go when the cover step is left (they are a few MB each).
  useEffect(() => () => forgetPhotoPictures(), []);
  const goToPreview = useGoToPreview();

  const photos = useMemo(() => coverPhotos(builder.uploadedPhotos).filter((p) => !!p.previewUrl), [builder.uploadedPhotos]);
  const onCover = coverPhotoId(builder);

  const title = coverTitle(builder);
  const fit = titleFontInApp(builder.coverFront) ? coverTitleFit(builder.coverFront, builder.albumSize, platform.textMeasurer()) : null;
  const next = coverStepNext(albumMade(builder.albumPages), photosIn(builder));
  const cover = useSettledCover(builder.coverFront);

  // The front cover as print draws it, fitted to the screen.
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const coverW = Math.min(screenW - space.lg * 2, 300);
  const coverH = Math.round((coverW * size.height) / size.width);
  // Drawn only while this step is on top: it stays mounted under the Preview
  // and the editors, and must not draw the cover again for every change made
  // there (its last picture stays).
  const focused = useIsFocused();
  const picture = usePagePicture(text, focused ? {
    page: cover, pageIndex: 0, albumSize: builder.albumSize, photos: builder.uploadedPhotos,
    width: Math.round(coverW * 2), coverMode: true,
  } : null);

  // Once per visit, and not while this screen comes on: a double tap on the
  // Photos step's Next would land on Make my album, in the same spot
  // (useOncePerVisit).
  const once = useOncePerVisit();
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

        {/* The photos ABOVE the cover, one row you swipe (the website's #235). */}
        {photos.length > 0 && (
          <View style={styles.row}>
            <CoverPhotoRow photos={photos} onCover={onCover} onPick={(p) => chooseCover(builder, p.id)} pad={space.lg} />
          </View>
        )}

        <View style={[styles.cover, { width: coverW, height: coverH }]} testID="cover-picture">
          {picture.uri ? (
            <Image source={{ uri: picture.uri }} style={{ width: coverW, height: coverH }} contentFit="fill" />
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
        <Text style={styles.caption}>Front cover</Text>
        {picture.notDrawn.length > 0 && <Text style={styles.notDrawn} testID="cover-not-drawn">{NOT_DRAWN_LINE}</Text>}

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
        <Button label={next.label} onPress={once(goOn)} testID="cover-next" />
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
  // Edge to edge: the row runs under the screen's margins, its own padding lines it up.
  row: { marginHorizontal: -space.lg, marginBottom: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 17, color: colors.text },
  warn: { borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', borderRadius: 10, padding: space.sm, gap: space.sm },
  warnText: { fontSize: 14, color: '#8A5A12' },
  warnButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E8C98A', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: space.md, paddingVertical: 6 },
  warnButtonText: { fontSize: 14, fontWeight: '700', color: '#8A5A12' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
