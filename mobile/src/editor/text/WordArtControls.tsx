/* WordArt (owner, 2026-11-05 on the cover title: "that wordart capability";
   2026-11-07: the same on words on a page and on the cover): an outline in any
   colour and thickness, a two-colour fill, a glow, and the words on an arch, a
   smile or a wave, and (where `shadow` is given) the shadow. One panel is open
   at a time and stays open after a pick, with the page in view, so each one
   can be tried. The effects mix. Only the app has these buttons; the website
   draws what they make, in its preview and in print.
   `prefix` names the buttons for the tests and the crew: 'cover' on the cover
   screen (its names from before: cover-effect-outline …), 'text' in Edit text. */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WordArtCurve } from '@web/pages/builder/wordArtRules';
import { colors, space } from '../../lib/theme';
import { TextColourPicker } from './ColourPickers';
import { OUTLINE_WIDTHS, outlineSize } from './wordArtEdits';
import * as W from './words';

type Panel = 'outline' | 'fill' | 'glow' | 'shape';

/** What the effects are now. */
export interface WordArtValue {
  outlineColor?: string;
  /** Design px; 0 = no outline. */
  outlineWidth: number;
  fillTo?: string;
  glow?: string;
  curve?: WordArtCurve;
  /** The shadow is on (shown only where `change.shadow` is given). */
  shadow?: boolean;
}

/** What each button does. */
export interface WordArtChange {
  /** 0 = no outline. */
  outline(width: number): void;
  outlineColour(hex: string): void;
  fillTo(hex: string | undefined): void;
  glow(hex: string | undefined): void;
  curve(curve: WordArtCurve | undefined): void;
  /** Shadow on or off: a fifth button. */
  shadow?: () => void;
}

function Choice({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, on && styles.choiceTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function WordArtControls({ value, change, prefix, onOpen, label = true, shapes: withShapes = true }: {
  value: WordArtValue;
  change: WordArtChange;
  prefix: 'cover' | 'text';
  /** A panel opened: the screen brings it into view. */
  onOpen?: () => void;
  /** The "Effects" heading over the buttons. */
  label?: boolean;
  /** The Shape button (not for words a curve could take off the page unchecked). */
  shapes?: boolean;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const size = outlineSize(value.outlineWidth);
  const tab = (panel: Panel, text: string, on: boolean): ReactNode => (
    <Pressable key={panel} accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ selected: on, expanded: open === panel }}
      onPress={() => { if (open !== panel) onOpen?.(); setOpen(open === panel ? null : panel); }} testID={`${prefix}-effect-${panel}`}
      style={({ pressed }) => [styles.tab, on && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.tabText, on && styles.choiceTextOn]} numberOfLines={2}>{`${text} ${open === panel ? '▴' : '▾'}`}</Text>
    </Pressable>
  );
  const shapes: { id: WordArtCurve | undefined; label: string; key: string }[] = [
    { id: undefined, label: W.SHAPES.straight, key: 'straight' },
    { id: 'arch', label: W.SHAPES.arch, key: 'arch' },
    { id: 'smile', label: W.SHAPES.smile, key: 'smile' },
    { id: 'wave', label: W.SHAPES.wave, key: 'wave' },
  ];
  return (
    <View testID={`${prefix}-wordart`} style={styles.wrap}>
      {label && <Text style={styles.label}>{W.EFFECTS}</Text>}
      <View style={styles.tabs}>
        {tab('outline', W.OUTLINE, value.outlineWidth > 0)}
        {tab('fill', W.TWO_COLOURS, !!value.fillTo)}
        {tab('glow', W.GLOW, !!value.glow)}
        {withShapes && tab('shape', W.SHAPE, !!value.curve)}
        {change.shadow && (
          <Pressable accessibilityRole="button" accessibilityLabel={W.SHADOW} accessibilityState={{ selected: !!value.shadow }}
            onPress={change.shadow} testID={`${prefix}-effect-shadow`}
            style={({ pressed }) => [styles.tab, value.shadow && styles.choiceOn, pressed && styles.pressed]}>
            <Text style={[styles.tabText, value.shadow && styles.choiceTextOn]} numberOfLines={2}>{W.SHADOW}</Text>
          </Pressable>
        )}
      </View>

      {open === 'outline' && (
        <View style={styles.panel} testID={`${prefix}-effect-panel-outline`}>
          <View style={styles.tabs}>
            <Choice label={W.NONE} on={!size} onPress={() => change.outline(0)} testID={`${prefix}-outline-none`} />
            <Choice label={W.OUTLINE_SIZES.thin} on={size === 'thin'} onPress={() => change.outline(OUTLINE_WIDTHS.thin)} testID={`${prefix}-outline-thin`} />
            <Choice label={W.OUTLINE_SIZES.medium} on={size === 'medium'} onPress={() => change.outline(OUTLINE_WIDTHS.medium)} testID={`${prefix}-outline-medium`} />
            <Choice label={W.OUTLINE_SIZES.thick} on={size === 'thick'} onPress={() => change.outline(OUTLINE_WIDTHS.thick)} testID={`${prefix}-outline-thick`} />
          </View>
          {value.outlineWidth > 0 && (
            <>
              <Text style={styles.small}>{W.OUTLINE_COLOUR}</Text>
              <TextColourPicker value={value.outlineColor ?? ''} onChange={change.outlineColour} testID={`${prefix}-outline-color`} />
            </>
          )}
        </View>
      )}

      {open === 'fill' && (
        <View style={styles.panel} testID={`${prefix}-effect-panel-fill`}>
          <Text style={styles.small}>{W.TWO_COLOURS_HINT}</Text>
          <Choice label={W.NONE} on={!value.fillTo} onPress={() => change.fillTo(undefined)} testID={`${prefix}-fill-none`} />
          <TextColourPicker value={value.fillTo ?? ''} onChange={(hex) => change.fillTo(hex)} testID={`${prefix}-fill-color`} />
        </View>
      )}

      {open === 'glow' && (
        <View style={styles.panel} testID={`${prefix}-effect-panel-glow`}>
          <Text style={styles.small}>{W.GLOW_HINT}</Text>
          <Choice label={W.NONE} on={!value.glow} onPress={() => change.glow(undefined)} testID={`${prefix}-glow-none`} />
          <TextColourPicker value={value.glow ?? ''} onChange={(hex) => change.glow(hex)} testID={`${prefix}-glow-color`} />
        </View>
      )}

      {withShapes && open === 'shape' && (
        <View style={styles.panel} testID={`${prefix}-effect-panel-shape`}>
          <View style={styles.tabs}>
            {shapes.map((s) => <Choice key={s.key} label={s.label} on={value.curve === s.id} onPress={() => change.curve(s.id)} testID={`${prefix}-shape-${s.key}`} />)}
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
