/* The cover editor's pickers, from the website's shared lists:
     • the cover's colours (PageColorPicker: pageColors.PAGE_COLORS, White and
       the Crayola 8), the chosen one ringed and ticked, its name under them,
       and "Use <colour> on every page" once one is chosen;
     • the title's colours (TextColorPicker: textColors.TEXT_COLORS, 28 in
       rows of 7), the chosen one ringed and ticked, its name under them;
     • the fonts (FontList: fontCatalog.FONTS, 74 in the website's groups).
   Each tap target is at least 48 dp (a swatch smaller than that on a narrow
   phone reaches out to 48 dp with hitSlop). */
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FONT_GROUPS, FONTS, isSameFont } from '@web/pages/builder/fontCatalog';
import { inkOn, PAGE_COLORS, pageColorOf } from '@web/pages/builder/pageColors';
import { sameColor, TEXT_COLORS, textColorName } from '@web/pages/builder/textColors';
import type { AlbumBackground } from '@web/pages/builder/types';
import { colors, space } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import { FONTS_LABEL, useOnEveryPage } from './words';

const RING = '#9A4A2C';
const TOUCH = 48;

/** The tick on a swatch: dark on light colours, white on dark (TextColorPicker tickOn). */
function tickOn(hex: string): string {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#2d2d2d';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#2D2D2D' : '#FFFFFF';
}

function Swatch({ hex, name, on, size, tick, onPress, testID }: { hex: string; name: string; on: boolean; size: number; tick: string; onPress: () => void; testID: string }) {
  const slop = Math.max(0, Math.ceil((TOUCH - size) / 2));
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={name} onPress={onPress} testID={testID}
      hitSlop={slop} style={[styles.swatch, { width: size, height: size, borderRadius: size / 2, backgroundColor: hex }, on && styles.swatchOn]}>
      {on && <Text style={[styles.tick, { color: tick }]}>✓</Text>}
    </Pressable>
  );
}

/** The cover's colours (PageColorPicker). */
export function CoverColours({ background, onPick, onPickAll }: { background: AlbumBackground | undefined; onPick: (hex: string) => void; onPickAll: (hex: string) => void }) {
  const current = pageColorOf(background);
  return (
    <View testID="cover-colors">
      <View accessibilityRole="radiogroup" style={styles.pageColours}>
        {PAGE_COLORS.map((c) => (
          <Swatch key={c.hex} hex={c.hex} name={c.name} on={current?.hex === c.hex} size={40} tick={inkOn(c.hex)} onPress={() => onPick(c.hex)} testID={`cover-color-${c.name}`} />
        ))}
      </View>
      <Text style={styles.name} accessibilityLiveRegion="polite" testID="cover-color-name">{current?.name ?? ''}</Text>
      {current && (
        <Pressable accessibilityRole="button" accessibilityLabel={useOnEveryPage(current.name)} onPress={() => onPickAll(current.hex)} testID="cover-color-all"
          style={({ pressed }) => [styles.allButton, pressed && styles.pressed]}>
          <Text style={styles.allText}>{useOnEveryPage(current.name)}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The title's colours (TextColorPicker), 7 to a row as on the website. */
export function TitleColours({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const { width } = useWindowDimensions();
  const gap = 6;
  const size = Math.max(32, Math.min(40, Math.floor((width - space.md * 2 - gap * 6) / 7)));
  const name = textColorName(value);
  return (
    <View testID="cover-title-colors">
      <View accessibilityRole="radiogroup" style={[styles.textColours, { gap, width: size * 7 + gap * 6 }]}>
        {TEXT_COLORS.map((c) => (
          <Swatch key={c.hex} hex={c.hex} name={c.name} on={sameColor(c.hex, value)} size={size} tick={tickOn(c.hex)} onPress={() => onPick(c.hex)} testID={`cover-title-color-${c.name}`} />
        ))}
      </View>
      <Text style={styles.name} accessibilityLiveRegion="polite" testID="cover-title-color-name">{name ?? ''}</Text>
    </View>
  );
}

/** The fonts (FontList), in the website's groups, the chosen one ticked. */
export function FontSheet({ value, onPick, onClose }: { value: string; onPick: (family: string) => void; onClose: () => void }) {
  return (
    <EditorSheet title={FONTS_LABEL} onClose={onClose} scroll testID="cover-font-list">
      {FONT_GROUPS.map((g) => (
        <View key={g.id} accessibilityLabel={g.label}>
          <Text style={styles.group} accessibilityRole="header">{g.label}</Text>
          {FONTS.filter((f) => f.group === g.id).map((f) => {
            const on = isSameFont(f.family, value);
            return (
              <Pressable key={f.name} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={f.name}
                onPress={() => { onPick(f.family); onClose(); }} testID={`cover-font-${f.name}`}
                style={({ pressed }) => [styles.fontRow, on && styles.fontRowOn, pressed && styles.pressed]}>
                <Text style={styles.fontName} numberOfLines={1}>{f.name}</Text>
                {on && <Text style={styles.fontTick}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  swatch: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  swatchOn: { borderWidth: 3, borderColor: RING },
  tick: { fontSize: 16, fontWeight: '800' },
  pageColours: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', gap: 8, width: 40 * 5 + 8 * 4 + 1 },
  textColours: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  name: { minHeight: 18, marginTop: 6, fontSize: 13, color: colors.muted, textAlign: 'center' },
  allButton: { marginTop: space.sm, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  allText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  pressed: { opacity: 0.85 },
  group: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, paddingTop: space.sm, paddingBottom: 4 },
  fontRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, borderRadius: 10 },
  fontRowOn: { backgroundColor: '#FFF1EA' },
  fontName: { flex: 1, fontSize: 18, color: colors.text },
  fontTick: { fontSize: 16, fontWeight: '800', color: colors.accent, marginLeft: space.sm },
});
