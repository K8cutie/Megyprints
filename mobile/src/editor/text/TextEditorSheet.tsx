/* ══════════════════════════════════════════════════════════════════════════
   THE TEXT EDITOR (the website's MobileTextEditor): a typing area styled
   live, and a format bar over the keyboard: Bold / Italic / Underline · the
   font · the size (14 to 80, 2 at a time) · the colour · Outline / Shadow ·
   left, center, right. "Done" saves through the website's own action for
   these words (wordsFlow.saveWords: setBoxText, setSlotText or
   updateTextElement); ✕ closes without saving, as on the website. Android's
   back closes an open font or colour panel first; with none open it keeps
   the words (saves them, as Done), so the usual "back to hide the keyboard,
   back again" never throws typed words away. Nothing changed: nothing is
   saved (no Undo step that changes nothing).

   A caption box's editor says, as you type, when the words won't fit the
   box (the box clips them in print), with "Make it fit (size N)" when a
   smaller size would: the website's own textFit.captionFits, measured with
   the phone's page fonts (platform.textMeasurer, the Skia one), so the
   answer is the one the page and print give.

   The fonts and colours open over the bar, as on the website. A font from
   the internet is fetched before it is used (fonts/fontStore.ts); with no
   internet the words keep their font and a line says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontName } from '@web/pages/builder/fontCatalog';
import { contrastOutline, WORDART_SHADOW } from '@web/pages/builder/wordArtRules';
import { colors, space } from '../../lib/theme';
import { CLOSE } from '../editorWords';
import type { SheetProps } from '../registry';
import { TextColourPicker } from './ColourPickers';
import { FontPicker, useFontPick, useFontStoreVersion } from './FontPicker';
import { fontStore as appFontStore } from './fonts/appFonts';
import type { FontStore } from './fonts/fontStore';
import {
  ALIGN_WORDS, BIGGER, BOLD, COLOR, DONE, EDIT_TEXT, ITALIC, makeItFit, OUTLINE, SHADOW, SMALLER,
  tooLong, TYPE_YOUR_TEXT, UNDERLINE,
} from './words';
import {
  bigger, contentOf, editorStateOf, fitBoxFor, fitOf, initialContent, sameWords, saveWords, smaller,
  type EditorState, type WordsTarget,
} from './wordsFlow';

export interface TextEditorParams {
  target: WordsTarget;
  /** Tests hand in their own font store (no network, no files). */
  store?: FontStore;
}

export function TextEditorSheet({ ctx, params, close }: SheetProps<TextEditorParams>) {
  const store = params.store ?? appFontStore;
  useFontStoreVersion(store);
  const { builder, page, pageIndex, platform } = ctx;
  const { target } = params;
  const [opened] = useState<EditorState>(() => editorStateOf(initialContent(page, target)));
  const [s, setS] = useState<EditorState>(opened);
  const set = (patch: Partial<EditorState>) => setS((v) => ({ ...v, ...patch }));
  const [fontOpen, setFontOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  // A font from the internet is fetched before it is used (FontPicker useFontPick).
  const { fetching, offline, pick } = useFontPick(store, (family) => { set({ fontFamily: family }); setFontOpen(false); });

  // Too long for its box? The renderers' own wrap, measured on the phone.
  const box = useMemo(() => fitBoxFor(page, target, builder.albumSize, pageIndex, builder.editScope === 'coverFront'), [page, target, builder.albumSize, pageIndex, builder.editScope]);
  const fit = fitOf(s, box, platform.textMeasurer());

  const onPickFont = (family: string) => pick(family, s.fontFamily);

  const save = () => {
    const content = contentOf(s);
    if (!sameWords(content, contentOf(opened))) saveWords(builder, page, pageIndex, target, content);
    close();
  };
  // Android back: an open panel first, then keep the words (as Done).
  const back = () => {
    if (fontOpen || colorOpen) { setFontOpen(false); setColorOpen(false); return; }
    save();
  };

  const ui = store.uiFont(s.fontFamily, s.bold, s.italic);
  const typing = {
    fontFamily: ui.fontFamily, fontWeight: ui.fontWeight, fontStyle: ui.fontStyle,
    fontSize: s.fontSize, color: s.color, textAlign: s.alignment,
    textDecorationLine: s.underline ? 'underline' as const : 'none' as const,
    lineHeight: Math.round(s.fontSize * 1.3),
    // A preview: React Native draws one text shadow, so the shadow wins over
    // the outline's halo (the page draws both, the website's way).
    ...(s.shadow
      ? { textShadowColor: WORDART_SHADOW.color, textShadowOffset: { width: WORDART_SHADOW.offsetX, height: WORDART_SHADOW.offsetY }, textShadowRadius: WORDART_SHADOW.blur }
      : s.outline ? { textShadowColor: contrastOutline(s.color), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2 } : {}),
  };

  return (
    <Modal animationType="slide" onRequestClose={back} statusBarTranslucent navigationBarTranslucent testID="text-editor">
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.head}>
            <Pressable accessibilityRole="button" accessibilityLabel={CLOSE} onPress={close} style={styles.close} testID="text-editor-close">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">{EDIT_TEXT}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={DONE} onPress={save} testID="text-editor-done"
              style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
              <Text style={styles.doneText}>{`✓ ${DONE}`}</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.typingArea} contentContainerStyle={styles.typingInner} keyboardShouldPersistTaps="handled">
            <TextInput value={s.text} onChangeText={(text) => set({ text })} placeholder={TYPE_YOUR_TEXT} placeholderTextColor="#C4C4C4"
              multiline autoFocus style={[styles.input, typing]} testID="text-editor-input" accessibilityLabel={EDIT_TEXT} />
          </ScrollView>

          {fit && !fit.fits && (
            <View style={styles.warn} accessibilityRole="alert" testID="text-too-long">
              <Text style={styles.warnText}>{tooLong(!!fit.fitsAt)}</Text>
              {fit.fitsAt && (
                <Pressable accessibilityRole="button" accessibilityLabel={makeItFit(fit.fitsAt)} onPress={() => set({ fontSize: fit.fitsAt! })} testID="text-make-fit"
                  style={({ pressed }) => [styles.fitButton, pressed && styles.pressed]}>
                  <Text style={styles.fitText}>{makeItFit(fit.fitsAt)}</Text>
                </Pressable>
              )}
            </View>
          )}
          {offline && (
            <View style={styles.warn} accessibilityRole="alert" testID="text-font-offline">
              <Text style={styles.warnText}>{offline}</Text>
            </View>
          )}

          <View style={styles.barArea}>
            {fontOpen && (
              <View style={styles.panel} testID="text-font-panel">
                <FontPicker store={store} value={s.fontFamily} loading={fetching} onPick={onPickFont} />
              </View>
            )}
            {colorOpen && (
              <ScrollView style={[styles.panel, styles.colorPanel]} testID="text-color-panel" keyboardShouldPersistTaps="handled">
                <TextColourPicker value={s.color} onChange={(color) => set({ color })} onPicked={() => setColorOpen(false)} />
              </ScrollView>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar} keyboardShouldPersistTaps="handled" testID="text-format-bar">
              <ToolButton label={BOLD} active={s.bold} onPress={() => set({ bold: !s.bold })} testID="text-bold"><Text style={[styles.toolGlyph, styles.boldGlyph]}>B</Text></ToolButton>
              <ToolButton label={ITALIC} active={s.italic} onPress={() => set({ italic: !s.italic })} testID="text-italic"><Text style={[styles.toolGlyph, styles.italicGlyph]}>I</Text></ToolButton>
              <ToolButton label={UNDERLINE} active={s.underline} onPress={() => set({ underline: !s.underline })} testID="text-underline"><Text style={[styles.toolGlyph, styles.underlineGlyph]}>U</Text></ToolButton>
              <Divider />
              <Pressable accessibilityRole="button" accessibilityLabel={fontName(s.fontFamily)} accessibilityState={{ expanded: fontOpen }} testID="text-font-open"
                onPress={() => { setFontOpen((v) => !v); setColorOpen(false); }} style={({ pressed }) => [styles.wide, pressed && styles.pressed]}>
                <Text style={[styles.wideText, { fontFamily: store.uiFont(s.fontFamily).fontFamily }]} numberOfLines={1}>{fontName(s.fontFamily)}</Text>
                <Text style={styles.caret}>▾</Text>
              </Pressable>
              <Divider />
              <ToolButton label={SMALLER} onPress={() => set({ fontSize: smaller(s.fontSize) })} testID="text-smaller"><Text style={styles.toolGlyph}>−</Text></ToolButton>
              <Text style={styles.size} testID="text-size">{s.fontSize}</Text>
              <ToolButton label={BIGGER} onPress={() => set({ fontSize: bigger(s.fontSize) })} testID="text-bigger"><Text style={styles.toolGlyph}>+</Text></ToolButton>
              <Divider />
              <Pressable accessibilityRole="button" accessibilityLabel={COLOR} accessibilityState={{ expanded: colorOpen }} testID="text-color-open"
                onPress={() => { setColorOpen((v) => !v); setFontOpen(false); }} style={({ pressed }) => [styles.wide, pressed && styles.pressed]}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={styles.wideText}>{COLOR}</Text>
                <Text style={styles.caret}>▾</Text>
              </Pressable>
              <Divider />
              <Toggle label={OUTLINE} on={s.outline} onPress={() => set({ outline: !s.outline })} testID="text-outline" />
              <Toggle label={SHADOW} on={s.shadow} onPress={() => set({ shadow: !s.shadow })} testID="text-shadow" />
              <Divider />
              {(['left', 'center', 'right'] as const).map((a) => (
                <Toggle key={a} label={ALIGN_WORDS[a]} on={s.alignment === a} onPress={() => set({ alignment: a })} testID={`text-align-${a}`} />
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function ToolButton({ label, active = false, onPress, children, testID }: { label: string; active?: boolean; onPress: () => void; children: ReactNode; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.tool, active && styles.toolOn, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

function Toggle({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.toggle, on && styles.toolOn, pressed && styles.pressed]}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.card },
  head: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: colors.muted },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  done: { minHeight: 48, minWidth: 48, paddingHorizontal: space.md, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  doneText: { color: colors.accentText, fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.85 },
  typingArea: { flex: 1, backgroundColor: '#FAFAFA' },
  typingInner: { flexGrow: 1, justifyContent: 'center', padding: space.md },
  input: { minHeight: 96, textAlignVertical: 'center', padding: 0 },
  warn: { marginHorizontal: 12, marginBottom: space.sm, gap: space.sm, borderRadius: 10, borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', paddingHorizontal: 12, paddingVertical: space.sm },
  warnText: { fontSize: 13, lineHeight: 18, color: '#8A5A12' },
  fitButton: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: space.md, borderRadius: 10, borderWidth: 1, borderColor: '#E8C98A', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 14, fontWeight: '700', color: '#8A5A12' },
  barArea: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  panel: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  colorPanel: { maxHeight: 320, paddingHorizontal: 12, paddingTop: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: space.sm },
  tool: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: '#F6E7DF' },
  toolGlyph: { fontSize: 18, color: '#6B6B6B' },
  boldGlyph: { fontWeight: '900' },
  italicGlyph: { fontStyle: 'italic', fontFamily: 'serif' },
  underlineGlyph: { textDecorationLine: 'underline' },
  wide: { minHeight: 48, maxWidth: 200, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F5EEE6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  wideText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  caret: { fontSize: 12, color: colors.muted },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  size: { width: 32, textAlign: 'center', fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  toggle: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#6B6B6B' },
  toggleTextOn: { color: '#9A4A2C' },
  divider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 4 },
});
