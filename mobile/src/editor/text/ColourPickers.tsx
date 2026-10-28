/* ══════════════════════════════════════════════════════════════════════════
   THE COLOUR PICKERS of the words part, from the website's two:

   • TextColorPicker: the 28 text colours (textColors.ts, shared) as round
     swatches, 7 a row; the chosen one ringed and ticked, its name said under
     them; then "Any color" for anything else. On the website "Any color" is
     the phone's own picker (<input type="color">); here it opens a grid of
     shades and a colour code field (anyColour.ts), saved as a 6-digit hex
     the same way.
   • PageColorPicker: the page colours (pageColors.ts, shared: White and the
     Crayola 8), the chosen one ringed and ticked, its name under them, and
     "Use <colour> on every page" once a swatch is chosen (never a button
     that can't do anything). The cover editor uses both (its colour, its
     title's colour), so the editor has one look for colours.
   Every swatch is a 48 dp target.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TEXT_COLORS, sameColor, textColorName } from '@web/pages/builder/textColors';
import { inkOn, PAGE_COLORS, pageColorOf } from '@web/pages/builder/pageColors';
import type { AlbumBackground } from '@web/pages/builder/types';
import { colors, space } from '../../lib/theme';
import { ANY_COLORS, parseColourCode, tickOn } from './anyColour';
import {
  ANY_COLOR, ANY_COLOR_HINT, COLOR_CODE, NOT_A_COLOR_CODE, PAGE_COLOUR_LABEL, TEXT_COLOR_LABEL,
  USE_THIS_COLOR, useOnEveryPage, YOUR_OWN_COLOR,
} from './words';

const RING = '#9A4A2C';
const RAINBOW = ['#C62828', '#E8772E', '#D4A017', '#2E7D4A', '#3A6EA5', '#9B5DE5'];

function Swatch({ hex, name, on, onPress, testID, size = 36 }: { hex: string; name: string; on: boolean; onPress: () => void; testID?: string; size?: number }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ checked: on }} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}>
      <View style={[styles.ring, on && styles.ringOn]}>
        <View style={[styles.swatch, { width: size, height: size, borderRadius: size / 2, backgroundColor: hex }]}>
          {on && <Text style={[styles.tick, { color: tickOn(hex) }]}>✓</Text>}
        </View>
      </View>
    </Pressable>
  );
}

/** TextColorPicker: the 28 swatches, "Any color", and the chosen colour's name. */
export function TextColourPicker({ value, onChange, onPicked, testID = 'text-color' }: {
  value: string;
  onChange: (hex: string) => void;
  onPicked?: () => void;
  /** Its controls' test ids start with this (the cover title's: 'cover-title-color'). */
  testID?: string;
}) {
  const name = textColorName(value);
  const own = !name && !!value;
  const [any, setAny] = useState(false);
  return (
    <View testID={`${testID}-picker`}>
      <View accessibilityRole="radiogroup" accessibilityLabel={TEXT_COLOR_LABEL} style={styles.grid}>
        {TEXT_COLORS.map((c) => (
          <Swatch key={c.hex} hex={c.hex} name={c.name} on={sameColor(c.hex, value)} testID={`${testID}-${c.name}`}
            onPress={() => { onChange(c.hex); onPicked?.(); }} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={ANY_COLOR} onPress={() => setAny((v) => !v)} testID={`${testID}-any`}
        style={({ pressed }) => [styles.anyRow, own && styles.anyRowOn, pressed && styles.pressed]}>
        <View style={styles.anyDot}>
          {own ? <View style={[styles.anyDotFill, { backgroundColor: value }]} /> : RAINBOW.map((c) => <View key={c} style={[styles.rainbowBit, { backgroundColor: c }]} />)}
        </View>
        <Text style={styles.anyText}>{ANY_COLOR}</Text>
      </Pressable>
      {any && <AnyColour value={value} onPick={(hex) => { onChange(hex); setAny(false); onPicked?.(); }} />}
      <Text style={styles.name} testID={`${testID}-name`} accessibilityLiveRegion="polite">{name ?? (own ? YOUR_OWN_COLOR : '')}</Text>
    </View>
  );
}

/** The app's "Any color": shades, and a colour code. */
function AnyColour({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const [code, setCode] = useState(value);
  const [bad, setBad] = useState(false);
  const use = () => {
    const hex = parseColourCode(code);
    if (!hex) { setBad(true); return; }
    onPick(hex);
  };
  return (
    <View style={styles.anyPanel} testID="text-color-any-panel">
      <Text style={styles.hint}>{ANY_COLOR_HINT}</Text>
      <View style={styles.shades}>
        {ANY_COLORS.map((hex) => (
          <Pressable key={hex} accessibilityRole="button" accessibilityLabel={hex} onPress={() => onPick(hex)} testID={`any-color-${hex}`}
            style={({ pressed }) => [styles.hit, pressed && styles.pressed]}>
            <View style={[styles.shade, { backgroundColor: hex }, sameColor(hex, value) && styles.shadeOn]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.codeRow}>
        <TextInput value={code} onChangeText={(t) => { setCode(t); setBad(false); }} autoCapitalize="characters" autoCorrect={false}
          accessibilityLabel={COLOR_CODE} placeholder="#3A6EA5" style={styles.code} maxLength={7} testID="any-color-code" onSubmitEditing={use} />
        <Pressable accessibilityRole="button" accessibilityLabel={USE_THIS_COLOR} onPress={use} testID="any-color-use"
          style={({ pressed }) => [styles.useButton, pressed && styles.pressed]}>
          <Text style={styles.useText}>{USE_THIS_COLOR}</Text>
        </Pressable>
      </View>
      {bad && <Text style={styles.bad}>{NOT_A_COLOR_CODE}</Text>}
    </View>
  );
}

/** PageColorPicker (grid): White and the Crayola 8, and "Use … on every page". */
export function PageColourPicker({ background, onPick, onPickAll, testID = 'page-color' }: {
  background: AlbumBackground | undefined;
  onPick: (hex: string) => void;
  onPickAll?: (hex: string) => void;
  /** Its controls' test ids start with this (the cover's: 'cover-color'). */
  testID?: string;
}) {
  const current = pageColorOf(background);
  const rows = [PAGE_COLORS.slice(0, 5), PAGE_COLORS.slice(5)];
  return (
    <View testID={`${testID}-picker`}>
      <View accessibilityRole="radiogroup" accessibilityLabel={PAGE_COLOUR_LABEL}>
        {rows.map((row, r) => (
          <View key={r} style={styles.pageRow}>
            {row.map((c) => {
              const on = current?.hex === c.hex;
              return (
                <Pressable key={c.hex} accessibilityRole="radio" accessibilityLabel={c.name} accessibilityState={{ checked: on }} onPress={() => onPick(c.hex)} testID={`${testID}-${c.name}`}
                  style={({ pressed }) => [styles.hit, pressed && styles.pressed]}>
                  <View style={[styles.ring, on && styles.ringOn]}>
                    <View style={[styles.swatch, { width: 38, height: 38, borderRadius: 19, backgroundColor: c.hex }]}>
                      {on && <Text style={[styles.tick, { color: inkOn(c.hex) }]}>✓</Text>}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.name} testID={`${testID}-name`} accessibilityLiveRegion="polite">{current?.name ?? ''}</Text>
      {onPickAll && current && (
        <Pressable accessibilityRole="button" accessibilityLabel={useOnEveryPage(current.name)} onPress={() => onPickAll(current.hex)} testID={`${testID}-all`}
          style={({ pressed }) => [styles.allButton, pressed && styles.pressed]}>
          <Text style={styles.allText}>{useOnEveryPage(current.name)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  hit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  ring: { padding: 2, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: RING },
  swatch: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 16, fontWeight: '900' },
  pressed: { opacity: 0.8 },
  anyRow: { marginTop: space.sm, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  anyRowOn: { borderColor: RING, borderWidth: 2 },
  anyDot: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  anyDotFill: { flex: 1 },
  rainbowBit: { flex: 1 },
  anyText: { fontSize: 14, fontWeight: '700', color: colors.text },
  anyPanel: { marginTop: space.sm, padding: space.sm, borderRadius: 12, backgroundColor: colors.background, gap: 4 },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  shades: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 6 * 48, alignSelf: 'center' },
  shade: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  shadeOn: { borderWidth: 2, borderColor: RING },
  codeRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, alignItems: 'center' },
  code: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.sm, fontSize: 16, color: colors.text, backgroundColor: colors.card },
  // Outlined: the one filled button on the screen stays the way on ("Done").
  useButton: { minHeight: 48, paddingHorizontal: space.md, borderRadius: 10, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  useText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  bad: { fontSize: 12, color: colors.bad, marginTop: 4 },
  name: { marginTop: 6, textAlign: 'center', fontSize: 12, color: colors.muted, minHeight: 16 },
  pageRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  allButton: { marginTop: space.sm, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  allText: { fontSize: 14, fontWeight: '700', color: colors.accent },
});
