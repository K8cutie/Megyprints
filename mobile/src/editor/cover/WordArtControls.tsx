/* WordArt on the cover title (owner, 2026-11-05: "the text editing in the
   coverpage to have that wordart capability"): an outline in any colour and
   thickness, a two-colour fill, a glow, and the words on an arch, a smile or a
   wave. One panel is open at a time and stays open after a pick, with the cover
   in view above it, so each one can be tried. The effects mix. Only the app has
   these buttons; the website draws what they make, in its preview and in print. */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WordArtCurve } from '@web/pages/builder/wordArtRules';
import { colors, space } from '../../lib/theme';
import { TextColourPicker } from '../text/ColourPickers';
import {
  OUTLINE_WIDTHS, setTitleCurve, setTitleFillTo, setTitleGlow, setTitleOutline, setTitleOutlineColour,
  type CoverBuilder, type CoverTitle,
} from './coverEdits';
import * as W from './words';

type Panel = 'outline' | 'fill' | 'glow' | 'shape';

function Choice({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, on && styles.choiceTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function WordArtControls({ builder, title, onOpen }: {
  builder: CoverBuilder;
  title: CoverTitle;
  /** A panel opened: the screen brings it into view. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const tab = (panel: Panel, label: string, on: boolean): ReactNode => (
    <Pressable key={panel} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, expanded: open === panel }}
      onPress={() => { if (open !== panel) onOpen?.(); setOpen(open === panel ? null : panel); }} testID={`cover-effect-${panel}`}
      style={({ pressed }) => [styles.tab, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.tabText, on && styles.choiceTextOn]} numberOfLines={2}>{`${label} ${open === panel ? '▴' : '▾'}`}</Text>
    </Pressable>
  );
  const shapes: { id: WordArtCurve | undefined; label: string; key: string }[] = [
    { id: undefined, label: W.SHAPES.straight, key: 'straight' },
    { id: 'arch', label: W.SHAPES.arch, key: 'arch' },
    { id: 'smile', label: W.SHAPES.smile, key: 'smile' },
    { id: 'wave', label: W.SHAPES.wave, key: 'wave' },
  ];
  return (
    <View testID="cover-wordart" style={styles.wrap}>
      <Text style={styles.label}>{W.EFFECTS}</Text>
      <View style={styles.tabs}>
        {tab('outline', W.OUTLINE, title.outlineWidth > 0)}
        {tab('fill', W.TWO_COLOURS, !!title.fillTo)}
        {tab('glow', W.GLOW, !!title.glow)}
        {tab('shape', W.SHAPE, !!title.curve)}
      </View>

      {open === 'outline' && (
        <View style={styles.panel} testID="cover-effect-panel-outline">
          <View style={styles.tabs}>
            <Choice label={W.NONE} on={title.outlineWidth === 0} onPress={() => setTitleOutline(builder, 0)} testID="cover-outline-none" />
            <Choice label={W.OUTLINE_SIZES.thin} on={title.outlineWidth === OUTLINE_WIDTHS.thin} onPress={() => setTitleOutline(builder, OUTLINE_WIDTHS.thin)} testID="cover-outline-thin" />
            <Choice label={W.OUTLINE_SIZES.medium} on={title.outlineWidth === OUTLINE_WIDTHS.medium} onPress={() => setTitleOutline(builder, OUTLINE_WIDTHS.medium)} testID="cover-outline-medium" />
            <Choice label={W.OUTLINE_SIZES.thick} on={title.outlineWidth === OUTLINE_WIDTHS.thick} onPress={() => setTitleOutline(builder, OUTLINE_WIDTHS.thick)} testID="cover-outline-thick" />
          </View>
          {title.outlineWidth > 0 && (
            <>
              <Text style={styles.small}>{W.OUTLINE_COLOUR}</Text>
              <TextColourPicker value={title.outlineColor ?? ''} onChange={(hex) => setTitleOutlineColour(builder, hex)} testID="cover-outline-color" />
            </>
          )}
        </View>
      )}

      {open === 'fill' && (
        <View style={styles.panel} testID="cover-effect-panel-fill">
          <Text style={styles.small}>{W.TWO_COLOURS_HINT}</Text>
          <Choice label={W.NONE} on={!title.fillTo} onPress={() => setTitleFillTo(builder, undefined)} testID="cover-fill-none" />
          <TextColourPicker value={title.fillTo ?? ''} onChange={(hex) => setTitleFillTo(builder, hex)} testID="cover-fill-color" />
        </View>
      )}

      {open === 'glow' && (
        <View style={styles.panel} testID="cover-effect-panel-glow">
          <Text style={styles.small}>{W.GLOW_HINT}</Text>
          <Choice label={W.NONE} on={!title.glow} onPress={() => setTitleGlow(builder, undefined)} testID="cover-glow-none" />
          <TextColourPicker value={title.glow ?? ''} onChange={(hex) => setTitleGlow(builder, hex)} testID="cover-glow-color" />
        </View>
      )}

      {open === 'shape' && (
        <View style={styles.panel} testID="cover-effect-panel-shape">
          <View style={styles.tabs}>
            {shapes.map((s) => <Choice key={s.key} label={s.label} on={title.curve === s.id} onPress={() => setTitleCurve(builder, s.id)} testID={`cover-shape-${s.key}`} />)}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: space.xs },
  small: { fontSize: 13, color: colors.muted },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabText: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  choice: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  choiceOn: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  choiceText: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  choiceTextOn: { color: '#9A4A2C' },
  panel: { gap: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, padding: space.sm },
  pressed: { opacity: 0.85 },
});
