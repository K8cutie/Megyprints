/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PHOTO CHECK on the Photos step (the website's PhotoCheckCard, its
   words: owner, 2026-10-04, "Suggest, one tap"). Megy shows the blurry shots
   and the repeats it found; one tap leaves them all out, one tap keeps them
   all, and tapping one photo keeps just that one. Left-out photos can be
   brought back any time. The check runs on the phone (lib/draftPhotoCheck):
   the photos stay on the phone.

   Its buttons are plain: the Photos step's one filled button is its way on.
   ══════════════════════════════════════════════════════════════════════════ */
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DraftCheckView } from '../lib/draftPhotoCheck';
import type { DraftPhoto } from '../lib/photoDraft';
import { BRING_BACK, CHECK_CLEAR, CHECK_RUNNING, checkCount, foundLine, KEEP_ALL, LEAVE_OUT_ASK, LEAVE_THEM_OUT, leftOutLine, WHY_BLURRY, WHY_REPEAT } from '../lib/photoCheckWords';
import { colors, space } from '../lib/theme';

/** Photos shown in the card; the rest are a "+N" square. */
export const SHOW_MAX = 12;
const THUMB = 64;

interface Props {
  photos: readonly DraftPhoto[];
  check: DraftCheckView;
  onLeaveOut: (keys: string[]) => void;
  onKeep: (keys: string[]) => void;
  onBringBack: () => void;
}

export function PhotoCheckCard({ photos, check, onLeaveOut, onKeep, onBringBack }: Props) {
  const byKey = useMemo(() => new Map(photos.map((p) => [p.key, p])), [photos]);
  if (!check.available) return null;
  const { blurry, repeats } = check.suggestion;
  const flagged = [...blurry.map((key) => ({ key, why: WHY_BLURRY })), ...repeats.map((key) => ({ key, why: WHY_REPEAT }))]
    .filter((f) => byKey.has(f.key));

  if (!check.ready) {
    const { done, total } = check.progress;
    if (total === 0) return null;
    return (
      <View testID="photo-check-running">
        <Text style={styles.small}>{CHECK_RUNNING} <Text style={styles.count}>{checkCount(done, total)}</Text></Text>
        <View style={styles.track} accessibilityElementsHidden>
          <View style={[styles.fill, { width: `${Math.round((done / total) * 100)}%` }]} />
        </View>
      </View>
    );
  }

  const bringBack = check.leftOut > 0 ? (
    <View style={styles.backRow}>
      <Text style={styles.small}>{leftOutLine(check.leftOut)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={BRING_BACK} onPress={onBringBack} hitSlop={10} testID="photo-check-bring-back">
        <Text style={styles.backText}>{BRING_BACK}</Text>
      </Pressable>
    </View>
  ) : null;

  if (flagged.length === 0) {
    // "All sharp, no repeats" only when that is so: not while photos are
    // left out, and not about blurry shots or repeats the customer kept
    // (the website says it then too; the app says nothing).
    const clear = check.leftOut === 0 && !check.keptAny && check.progress.done > 0;
    if (!clear && !bringBack) return null;
    return (
      <View testID="photo-check-clear">
        {clear && <Text style={styles.clear}>✓ {CHECK_CLEAR}</Text>}
        {bringBack}
      </View>
    );
  }

  return (
    <View style={styles.card} testID="photo-check-suggest">
      <Text style={styles.title}>{foundLine(blurry.length, repeats.length)}</Text>
      <Text style={styles.ask}>{LEAVE_OUT_ASK}</Text>
      <View style={styles.thumbs}>
        {flagged.slice(0, SHOW_MAX).map(({ key, why }) => (
          <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${why}. Keep this photo`} onPress={() => onKeep([key])}
            style={styles.thumb} testID="photo-check-thumb">
            <Image source={{ uri: byKey.get(key)!.uri }} style={styles.thumbImage} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={key} />
            <Text style={styles.why}>{why}</Text>
          </Pressable>
        ))}
        {flagged.length > SHOW_MAX && (
          <View style={[styles.thumb, styles.more]}>
            <Text style={styles.moreText}>+{flagged.length - SHOW_MAX}</Text>
          </View>
        )}
      </View>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" accessibilityLabel={LEAVE_THEM_OUT} onPress={() => onLeaveOut(flagged.map((f) => f.key))}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]} testID="photo-check-leave-out">
          <Text style={styles.buttonText}>{LEAVE_THEM_OUT}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={KEEP_ALL} onPress={() => onKeep(flagged.map((f) => f.key))}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]} testID="photo-check-keep-all">
          <Text style={styles.buttonText}>{KEEP_ALL}</Text>
        </Pressable>
      </View>
      {bringBack}
    </View>
  );
}

const AMBER = '#8A5A12';
const styles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  count: { fontWeight: '700', color: colors.text },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden', marginTop: 6 },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  clear: { fontSize: 14, lineHeight: 20, color: colors.good },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  backText: { fontSize: 14, fontWeight: '700', color: colors.accent, textDecorationLine: 'underline' },
  card: { backgroundColor: '#FFF6E5', borderRadius: 12, borderWidth: 1, borderColor: '#F0D9A8', padding: space.md },
  title: { fontSize: 16, fontWeight: '700', color: AMBER },
  ask: { fontSize: 14, lineHeight: 20, color: AMBER, marginTop: 2 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  thumb: { width: THUMB, height: THUMB, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E8C98A', backgroundColor: colors.card },
  thumbImage: { width: THUMB, height: THUMB },
  why: { position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.55)', textAlign: 'center' },
  more: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  moreText: { fontSize: 13, color: AMBER },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm + 2 },
  button: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 10, borderWidth: 1, borderColor: '#E8C98A', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  buttonText: { fontSize: 15, fontWeight: '700', color: AMBER },
});
