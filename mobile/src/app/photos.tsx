/* ══════════════════════════════════════════════════════════════════════════
   YOUR PHOTOS: the photos going into the album, oldest first (the order of
   the pages), and the way on.

   The 40-photo minimum is the website's rule and words (shared
   albumMinimum.ts, through photoDraft.photoStep): under 40 the ONE filled
   button is "Add N more photos" and there is no way on; at 40 or more it is
   the website's "Next: pick your cover →" (Phase 3: the photos go into the
   album builder, then the cover step). A photo can be taken out (×), with
   Undo.
   ══════════════════════════════════════════════════════════════════════════ */
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inspectPhotos, releasePickedFiles } from '../../modules/photo-files';
import { useBuilder } from '../builder/BuilderProvider';
import { saveStep, syncPhotos, TO_COVER } from '../builder/albumFlow';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { useDraft } from '../lib/draftStore';
import { accessToGiveBack } from '../lib/filePhotos';
import { formatCount } from '../lib/photoDays';
import { photoStep, type DraftPhoto } from '../lib/photoDraft';
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
  const step = photoStep(draft.photos);
  const { builder, platform } = useBuilder();
  const [going, setGoing] = useState(false);

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

  const goOn = async () => {
    if (step.main !== 'next') { router.push('/pick-photos'); return; }
    // The photos go into the album builder (by their address on the phone).
    setGoing(true);
    try {
      await syncPhotos(builder, draft.photos, inspectPhotos);
      saveStep(platform.deviceStore, 'cover');
      router.push('/album-cover');
    } finally {
      setGoing(false);
    }
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
      <Text style={styles.message}>{step.message}</Text>
      {step.count > 0 && (
        <View style={styles.orderRow}>
          <Text style={styles.order}>In the order they were taken, as on the album pages.</Text>
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
        <Button label={step.main === 'next' ? TO_COVER : step.mainLabel} onPress={() => { void goOn(); }} busy={going} testID="photos-main" />
        {step.secondLabel && <Button label={step.secondLabel} kind="plain" onPress={() => router.push('/pick-photos')} testID="photos-add-more" />}
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
