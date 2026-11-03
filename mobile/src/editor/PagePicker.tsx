/* ══════════════════════════════════════════════════════════════════════════
   "GO TO A PAGE": what a tap on "Page 13 of 72" opens (owner, 2026-11-03:
   the strip of page numbers under the page is gone; the count, big over
   the page, is the way to jump instead). The parts' tiles before page 1
   come first (the cover: registry stripStart), then every page's number,
   the page on screen marked. A tap goes there and closes the list. It is
   the editor's own sheet (EditorSheet), so it opens from the bottom
   upright and down the right on its side, as every other.
   ══════════════════════════════════════════════════════════════════════════ */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../lib/theme';
import { EditorSheet } from './core/EditorSheet';
import { GO_TO_PAGE } from './editorWords';
import { stripTiles, type EditorContext } from './registry';

const TILE = 52;

export function PagePicker({ ctx, total, index, close }: { ctx: EditorContext; total: number; index: number; close: () => void }) {
  const before = stripTiles();
  const go = (i: number) => {
    close();
    if (i !== index) ctx.builder.goToPage(i);
  };
  return (
    <EditorSheet title={GO_TO_PAGE} onClose={close} scroll testID="edit-page-picker">
      {before.map((t) => (
        <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label}
          onPress={() => { close(); t.onPress(ctx); }} style={({ pressed }) => [styles.wide, pressed && styles.pressed]} testID={`edit-picker-${t.id}`}>
          <Text style={styles.text}>{t.label}</Text>
        </Pressable>
      ))}
      <View style={styles.grid}>
        {Array.from({ length: total }, (_p, i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Page ${i + 1}`} accessibilityState={{ selected: i === index }}
            onPress={() => go(i)} style={({ pressed }) => [styles.tile, i === index && styles.now, pressed && styles.pressed]} testID={`edit-picker-page-${i + 1}`}>
            <Text style={[styles.text, i === index && styles.nowText]}>{i + 1}</Text>
          </Pressable>
        ))}
      </View>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: TILE, height: TILE, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  wide: { minHeight: TILE, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  now: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  text: { fontSize: 16, fontWeight: '600', color: colors.text },
  nowText: { fontWeight: '800', color: colors.accent },
  pressed: { opacity: 0.85 },
});
