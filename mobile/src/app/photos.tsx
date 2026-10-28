/* ══════════════════════════════════════════════════════════════════════════
   YOUR PHOTOS: the photos going into the album, oldest first (the order of
   the pages), and the way on.

   The 40-photo minimum is the website's rule and words (shared
   albumMinimum.ts, through photoDraft.photoStep): under 40 the ONE filled
   button is "Add N more photos" and there is no way on; at 40 or more it is
   the website's "Next: pick your cover →" (Phase 3: the photos go into the
   album builder, then the cover step). A photo can be taken out (×), with
   Undo.

   Once the album is made, this is the website's photos step for a made
   album: "Keep my pages →" is the way on, and "Make the album again" (asked
   first: it replaces every page) lays the pages out from these photos.
   Taking a photo out leaves it out of the next making; its page keeps it
   until then (albumFlow.syncPhotos: pages point at photos by their place,
   so a photo is never taken out of the builder's list once they do).

   The count that decides the way on is the album builder's after the photos
   go in: the same photo picked twice goes in once, and one the phone can't
   open doesn't go in. Then this step says so and asks for more.
   ══════════════════════════════════════════════════════════════════════════ */
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { photosShortBy } from '@web/pages/builder/albumMinimum';
import { inspectPhotos, releasePickedFiles } from '../../modules/photo-files';
import { useBuilder } from '../builder/BuilderProvider';
import { albumMade, KEEP_PAGES, MADE_ALBUM_PHOTOS_MESSAGE, MADE_ALBUM_PHOTOS_NOTE, REMAKE_ALBUM, remakeQuestion, saveStep, syncNote, syncPhotos, TO_COVER, type PhotoSync } from '../builder/albumFlow';
import { useGoToPreview } from '../builder/useGoToPreview';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { useDraft } from '../lib/draftStore';
import { accessToGiveBack } from '../lib/filePhotos';
import { formatCount } from '../lib/photoDays';
import { photoStep, photoStepFor, type DraftPhoto } from '../lib/photoDraft';
import { COULD_NOT_OPEN } from '../lib/pickWords';
import { colors, space } from '../lib/theme';

const COLUMNS = 3;
const GAP = 3;
/** How long "Undo" stays after a photo is taken out. */
const UNDO_MS = 10_000;

export default function YourPhotos() {
  const { draft, loading, add, remove, clear, peek, couldNotOpen, closeCouldNotOpen } = useDraft();
  const [undo, setUndo] = useState<DraftPhoto | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - space.md * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const { builder, platform } = useBuilder();
  const [going, setGoing] = useState(false);
  const goToPreview = useGoToPreview();
  const made = albumMade(builder.albumPages);
  // What the album builder took, after the last time the photos went in;
  // only while the picked photos are the same as then.
  const [took, setTook] = useState<{ at: number; goingIn: number; note: string } | null>(null);
  const tookNow = took && took.at === draft.updatedAt ? took : null;
  const picked = photoStep(draft.photos);
  // Fewer went in than were picked: the builder's count decides.
  const step = tookNow && tookNow.goingIn < picked.count ? photoStepFor(tookNow.goingIn) : picked;

  const undoing = useRef<DraftPhoto | null>(null);

  // A Files photo's kept access is given back once it is really gone (Undo
  // time is over), and only if no photo in the album uses it again (it may
  // have been picked from Files again in the meantime).
  const letGo = useCallback((p: DraftPhoto | null) => {
    if (p?.source !== 'files') return;
    const back = accessToGiveBack([p.uri], peek().photos);
    if (back.length) void releasePickedFiles(back).catch(() => 0);
  }, [peek]);

  useEffect(() => () => {
    clearTimeout(undoTimer.current);
    letGo(undoing.current);
  }, [letGo]);

  const takeOut = useCallback((p: DraftPhoto) => {
    remove([p.key]);
    letGo(undoing.current);
    undoing.current = p;
    setUndo(p);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      letGo(undoing.current);
      undoing.current = null;
      setUndo(null);
    }, UNDO_MS);
  }, [remove, letGo]);

  const putBack = () => {
    if (!undoing.current) return;
    add([undoing.current]);
    clearTimeout(undoTimer.current);
    undoing.current = null;
    setUndo(null);
  };

  const startAgain = () => {
    Alert.alert('Take out all photos?', 'The photos stay on your phone. Only this album is emptied.', [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Take out all',
        style: 'destructive',
        onPress: () => {
          void releasePickedFiles(draft.photos.filter((p) => p.source === 'files').map((p) => p.uri)).catch(() => 0);
          clear();
          letGo(undoing.current);
          undoing.current = null;
          setUndo(null);
        },
      },
    ]);
  };

  /** The photos go into the album builder (by their address on the phone).
   *  True when enough went in to go on. */
  const putIn = async (): Promise<boolean> => {
    const kept = new Map(platform.photoStore.records().map((r) => [r.id, r.uri]));
    const r: PhotoSync = await syncPhotos(builder, draft.photos, inspectPhotos, { addressOf: (id) => kept.get(id) });
    const note = syncNote(r);
    setTook(note || r.goingIn < photoStep(draft.photos).count ? { at: draft.updatedAt, goingIn: r.goingIn, note } : null);
    return photosShortBy(r.goingIn) === 0;
  };
  const busyWhile = async (job: () => Promise<void>) => {
    setGoing(true);
    try { await job(); } finally { setGoing(false); }
  };

  const goOn = () => busyWhile(async () => {
    if (step.main !== 'next') { router.push('/pick-photos'); return; }
    if (!(await putIn())) return;
    saveStep(platform.deviceStore, 'cover');
    router.push('/album-cover');
  });

  // A made album: back to its pages (photos taken out are left out of the
  // next making, new ones wait for it).
  const keepPages = () => busyWhile(async () => {
    await putIn();
    goToPreview();
  });

  // A made album, laid out again from these photos: asked first.
  const remake = () => {
    Alert.alert('Make the album again?', remakeQuestion(builder.albumPages), [
      { text: 'Keep my pages', style: 'cancel' },
      {
        text: 'Make it again',
        onPress: () => {
          void busyWhile(async () => {
            if (!(await putIn())) return;
            router.push('/making');
          });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} testID="photo-count">Your photos: {formatCount(step.count)}</Text>
      {couldNotOpen && (
        <View style={styles.lost} testID="could-not-open">
          <Text style={styles.lostText}>{COULD_NOT_OPEN}</Text>
          <Pressable accessibilityRole="button" onPress={closeCouldNotOpen} hitSlop={8} style={styles.lostClose}>
            <Text style={styles.lostCloseText}>OK</Text>
          </Pressable>
        </View>
      )}
      {!!tookNow?.note && (
        <View style={styles.lost} testID="photos-not-all-in">
          <Text style={styles.lostText}>{tookNow.note}</Text>
        </View>
      )}
      <Text style={styles.message} testID="photos-message">{made && step.short === 0 ? MADE_ALBUM_PHOTOS_MESSAGE : step.message}</Text>
      {made && <Text style={styles.order} testID="photos-made-note">{MADE_ALBUM_PHOTOS_NOTE}</Text>}
      {step.count > 0 && (
        <View style={styles.orderRow}>
          <Text style={styles.order}>In the order they were taken. On the album pages, photos with no date taken go near the end.</Text>
          <Pressable accessibilityRole="button" onPress={startAgain} hitSlop={8} testID="take-out-all">
            <Text style={styles.startAgainText}>Take out all</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.page}>
      <FlashList
        data={draft.photos}
        numColumns={COLUMNS}
        keyExtractor={(p) => p.key}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <DraftCell photo={item} cell={cell} onTakeOut={takeOut} />}
      />
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {undo && (
          <View style={styles.undo}>
            <Text style={styles.undoText}>Photo taken out of the album.</Text>
            <Pressable accessibilityRole="button" onPress={putBack} hitSlop={10} testID="undo">
              <Text style={styles.undoButton}>Undo</Text>
            </Pressable>
          </View>
        )}
        {made && step.main === 'next' ? (
          <>
            <Button label={KEEP_PAGES} onPress={() => { void keepPages(); }} busy={going} testID="photos-keep-pages" />
            {step.secondLabel && <Button label={step.secondLabel} kind="plain" onPress={() => router.push('/pick-photos')} testID="photos-add-more" />}
            <Button label={REMAKE_ALBUM} kind="plain" onPress={remake} testID="photos-remake" />
          </>
        ) : (
          <>
            <Button label={step.main === 'next' ? TO_COVER : step.mainLabel} onPress={() => { void goOn(); }} busy={going} testID="photos-main" />
            {!made && step.secondLabel && <Button label={step.secondLabel} kind="plain" onPress={() => router.push('/pick-photos')} testID="photos-add-more" />}
            {made && <Button label={KEEP_PAGES} kind="plain" onPress={() => { void keepPages(); }} testID="photos-keep-pages" />}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const DraftCell = memo(function DraftCell({ photo, cell, onTakeOut }: { photo: DraftPhoto; cell: number; onTakeOut: (p: DraftPhoto) => void }) {
  return (
    <View style={{ width: cell, height: cell, marginBottom: GAP }}>
      <Thumb uri={photo.uri} size={cell} recyclingKey={photo.key} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take this photo out of the album"
        onPress={() => onTakeOut(photo)}
        hitSlop={6}
        style={styles.remove}
      >
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { paddingHorizontal: space.md, paddingBottom: space.md },
  header: { paddingVertical: space.md, gap: space.sm },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  message: { fontSize: 17, lineHeight: 24, color: colors.text },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  order: { flex: 1, fontSize: 14, color: colors.muted },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  lost: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: '#FBEDE6', borderRadius: 12, borderWidth: 1, borderColor: '#EBC9B8', padding: space.md },
  lostText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  lostClose: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  lostCloseText: { fontSize: 16, fontWeight: '800', color: colors.accent },
  startAgainText: { fontSize: 14, color: colors.muted, textDecorationLine: 'underline' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md, gap: space.sm },
  undo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 10 },
  undoText: { color: '#FFFFFF', fontSize: 15 },
  undoButton: { color: '#F2B8A0', fontSize: 16, fontWeight: '800' },
});
