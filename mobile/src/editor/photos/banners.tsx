/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTOS PART'S LINES OVER THE PAGE (registry banners), each null when it
   has nothing to say:
     • a swap waiting for its second photo, with "Cancel";
     • a page the customer changed (MobileReview's studio line): "✎ This page
       is yours" and "Megy, fix this page" (resetStudioPage);
     • the blank pages reminder (blankPages.ts, the website's end-of-album
       card's words): "5 pages are blank", "Delete 5 blank pages" (never
       under the 40-page floor: deletePages) and "Edit the blank pages" (the
       next blank one).
   ══════════════════════════════════════════════════════════════════════════ */
import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { blankPagesBody, blankPagesTitle, deleteBlankLabel, editBlankLabel } from '@web/pages/builder/blankPages';
import { colors, space } from '../../lib/theme';
import type { EditorContext } from '../registry';
import { blankPlan, cancelSwap, deleteBlankPages, fixStudioPage, nextBlankPage, onSwapChange, pendingSwap } from './actions';
import { CANCEL, STUDIO_FIX, STUDIO_YOURS, SWAP_LINE } from './words';

function Chip({ label, onPress, testID, filled = false }: { label: string; onPress: () => void; testID: string; filled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.chip, filled && styles.chipFilled, pressed && styles.pressed]}>
      <Text style={[styles.chipText, filled && styles.chipTextFilled]}>{label}</Text>
    </Pressable>
  );
}

export function SwapBanner(_props: { ctx: EditorContext }) {
  const waiting = useSyncExternalStore(onSwapChange, pendingSwap);
  // Leaving the editor calls a waiting swap off.
  useFocusEffect(useCallback(() => () => cancelSwap(), []));
  if (!waiting) return null;
  return (
    <View style={[styles.box, styles.swap]} testID="photos-swap-banner" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{SWAP_LINE}</Text>
      <Chip label={CANCEL} onPress={cancelSwap} testID="photos-swap-cancel" />
    </View>
  );
}

export function StudioBanner({ ctx }: { ctx: EditorContext }) {
  if (!ctx.page.studio) return null;
  return (
    <View style={styles.studio} testID="photos-studio-banner">
      <Text style={styles.yours}>{STUDIO_YOURS}</Text>
      <Chip label={STUDIO_FIX} onPress={() => fixStudioPage(ctx)} testID="photos-studio-fix" />
    </View>
  );
}

export function BlankPagesBanner({ ctx }: { ctx: EditorContext }) {
  const plan = blankPlan(ctx);
  const n = plan.blank.length;
  if (n === 0) return null;
  const next = nextBlankPage(ctx);
  return (
    <View style={[styles.box, styles.blank]} testID="photos-blank-banner">
      <View style={styles.flex}>
        <Text style={styles.title}>{blankPagesTitle(n)}</Text>
        <Text style={styles.small}>{blankPagesBody(plan)}</Text>
      </View>
      <View style={styles.chips}>
        {plan.deletable.length > 0 && <Chip label={deleteBlankLabel(plan.deletable.length)} onPress={() => deleteBlankPages(ctx)} testID="photos-blank-delete" />}
        {next != null && <Chip label={editBlankLabel(n)} onPress={() => { ctx.select(null); ctx.builder.goToPage(next); }} testID="photos-blank-edit" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: space.md, marginBottom: space.xs, borderRadius: 12, borderWidth: 1, paddingHorizontal: space.sm, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  swap: { backgroundColor: '#FFF1EA', borderColor: '#EBC3AE' },
  blank: { backgroundColor: '#FFF6E5', borderColor: '#F0D9A8' },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  text: { flex: 1, minWidth: 160, fontSize: 13, lineHeight: 18, color: '#7A3A1E' },
  title: { fontSize: 13, fontWeight: '800', color: '#8A5A12' },
  small: { fontSize: 12, lineHeight: 16, color: '#8A5A12' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  studio: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.xs },
  yours: { fontSize: 12, fontWeight: '800', color: colors.accent, backgroundColor: '#FBE9E1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card },
  chipFilled: { backgroundColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  chipTextFilled: { color: colors.accentText },
  pressed: { opacity: 0.85 },
});
