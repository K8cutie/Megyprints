/* ══════════════════════════════════════════════════════════════════════════
   THE TEXT EDITOR (from the website's MobileTextEditor), in the same format as
   Mask (owner, 2026-11-05): the page above, with the words on it as they change
   (WordsOnPage), and below it the box to type in and a format bar: Bold /
   Italic / Underline · the font · the size (14 to 80, 2 at a time) · the
   colour · Effects (the cover title's WordArt: outline, two colours, glow,
   shape, and the shadow; owner 2026-11-07) · left, center, right. On its side the page is on
   the left and the rest in a panel down the right. "Done" saves through the
   website's own action for
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

   The fonts and colours open over the bar, as on the website, and stay open
   after a pick, so each one can be tried on the words (owner, 2026-11-05: "Could
   you not make the editor close"; the website's close). A list takes the
   keyboard's place, so the page stays in view with it; a tap on the typing box
   brings the keyboard back and puts the list away, and a tap on the page puts
   either away. The font or colour button, Android's back or Done closes a list
   too. A font from the internet is fetched before it is used
   (fonts/fontStore.ts); with no internet the words keep their font and a line
   says so.

   Words placed by hand on a photo ("Add text": wordsFlow, freeWords.ts) are
   drawn on the page as they are typed, placed as print will draw them, inside
   the safe print area. Too long for the page says so, with "Make it fit"; Done
   makes them that size by itself, and says so, so nothing is ever cut off.
   "Remove" takes them off the page (so do emptied words). Nothing typed: Done
   puts nothing on the page.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, useContext, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontName } from '@web/pages/builder/fontCatalog';
import { colors, space } from '../../lib/theme';
import { SheetPlacement, sidePanelWidth } from '../core/EditorSheet';
import { CLOSE } from '../editorWords';
import type { SheetProps } from '../registry';
import { TextColourPicker } from './ColourPickers';
import { FontPicker, useFontPick, useFontStoreVersion } from './FontPicker';
import { fontStore as appFontStore } from './fonts/appFonts';
import type { FontStore } from './fonts/fontStore';
import {
  ALIGN_WORDS, BIGGER, BOLD, COLOR, CURVE_TOO_LONG, DONE, EDIT_TEXT, EFFECTS, ITALIC, madeSmaller, makeItFit, MOVE_WORDS_HINT, PLACED_MAX_CHARS, REMOVE, REMOVE_WORDS,
  SHORTEN_FIRST, SMALLER, tooLong, tooLongForPage, TYPE_YOUR_TEXT, UNDERLINE,
} from './words';
import {
  bigger, boxRectFor, contentOf, curveFit, editorStateOf, fitBoxFor, fitOf, initialContent, isPlacedTarget, placedFit, placerFor, sameWords, saveWords, shadowToggled, smaller,
  type EditorState, type WordsTarget,
} from './wordsFlow';
import { WordArtControls, type WordArtChange } from './WordArtControls';
import { outlineColourPatch, outlinePatch } from './wordArtEdits';

export interface TextEditorParams {
  target: WordsTarget;
  /** Tests hand in their own font store (no network, no files). */
  store?: FontStore;
}

/* Loaded when first shown: the page's picture needs the page renderer (Skia),
   which the other parts' tests don't have. */
function PageAbove(props: ComponentProps<typeof import('./WordsOnPage').WordsOnPage>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return createElement((require('./WordsOnPage') as typeof import('./WordsOnPage')).WordsOnPage, props);
}

/** All the words part takes under the page, with a list open: Mask's share of the screen. */
const BELOW_THE_PAGE = 0.42;
/** The typing box and the format bar, which the list shares that with. */
const BOX_AND_BAR = 128;
/** A list is never shorter than three rows, upright. On its side it has what is left. */
const LIST_MIN = 144;
/** The format bar's height: its buttons, the space around them, the line above it. */
const BAR_H = 48 + space.sm * 2 + 1;
/** The colour list from its "Any color" button down, with "Any color" closed. */
const ANY_COLOR_ROW = 80;
/** How to move new words is said this many times a run. */
const MOVE_HINTS = 2;
let movedHints = 0;

export function TextEditorSheet({ ctx, params, close }: SheetProps<TextEditorParams>) {
  const store = params.store ?? appFontStore;
  useFontStoreVersion(store);
  const { builder, page, pageIndex, platform } = ctx;
  const { target } = params;
  // On the cover, words float on a shadow unless it is switched off.
  const onCover = builder.editScope === 'coverFront';
  const [opened] = useState<EditorState>(() => editorStateOf(initialContent(page, target), onCover));
  const [s, setS] = useState<EditorState>(opened);
  const set = (patch: Partial<EditorState>) => setS((v) => ({ ...v, ...patch }));
  const [fontOpen, setFontOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  // A font from the internet is fetched before it is used (FontPicker useFontPick).
  const { fetching, offline, pick } = useFontPick(store, (family) => set({ fontFamily: family }));

  // Words placed by hand: where they may go and how they are measured.
  const measurer = platform.textMeasurer();
  const place = useMemo(() => placerFor(builder.albumSize, pageIndex, onCover, measurer), [builder.albumSize, pageIndex, onCover, measurer]);
  const placed = isPlacedTarget(page, target);

  // Too long for its box (or, placed, for the page)? The renderers' own wrap, measured on the phone.
  const box = useMemo(() => fitBoxFor(page, target, builder.albumSize, pageIndex, onCover), [page, target, builder.albumSize, pageIndex, onCover]);
  const rect = useMemo(() => boxRectFor(page, target, builder.albumSize, pageIndex, onCover), [page, target, builder.albumSize, pageIndex, onCover]);
  // A photo frame's words are clipped to it unless they are on a curve; a curve
  // in a box isn't clipped at all, so its letters must stay in the safe area.
  const fit = placed ? placedFit(s, place, onCover)
    : s.curve && rect ? curveFit(s, rect, place, onCover)
      : fitOf(s, target.kind === 'slot' ? null : box, measurer);
  // Words never cut off, whatever their box: placed words, and words on a curve.
  const mustFit = placed || !!s.curve;
  // Done with words that fit at no size: the editor stays, and says what to do.
  const [stuck, setStuck] = useState(false);
  const stuckLine = stuck && fit && !fit.fits && !fit.fitsAt ? (s.curve ? CURVE_TOO_LONG : SHORTEN_FIRST) : null;
  // Only the WordArt this words can print as: no curve for an old free text
  // (it isn't kept in the safe area: only placed words are).
  const shapes = target.kind !== 'free' || placed;

  const onPickFont = (family: string) => pick(family, s.fontFamily);

  const save = () => {
    const content = contentOf(s, onCover);
    if (mustFit && fit && !fit.fits && content.text.trim() && !fit.fitsAt) { setStuck(true); return; }
    // Never printed cut off: too long, they go in at the size they fit at.
    const shrunk = mustFit && fit && !fit.fits && fit.fitsAt && content.text.trim() ? fit.fitsAt : null;
    if (shrunk) content.fontSize = shrunk;
    if (!sameWords(content, contentOf(opened, onCover))) {
      saveWords(builder, page, pageIndex, target, content, place);
      if (shrunk) ctx.say(madeSmaller(shrunk));
      // New words: the first times, how to move them.
      else if (target.kind === 'newWords' && content.text.trim() && movedHints < MOVE_HINTS) { movedHints++; ctx.say(MOVE_WORDS_HINT); }
    }
    close();
  };
  // "Remove": placed words come off the page.
  const remove = () => {
    if (target.kind === 'free') builder.deleteTextElement(target.textId);
    close();
  };
  const closeLists = () => { setFontOpen(false); setColorOpen(false); setEffectsOpen(false); };
  // Android back: an open panel first, then keep the words (as Done).
  const back = () => {
    if (fontOpen || colorOpen || effectsOpen) { closeLists(); return; }
    save();
  };
  // A list takes the keyboard's place, so the page stays in view with it.
  const toggleFont = () => { Keyboard.dismiss(); setFontOpen((v) => !v); setColorOpen(false); setEffectsOpen(false); };
  const toggleColor = () => { Keyboard.dismiss(); setColorOpen((v) => !v); setFontOpen(false); setEffectsOpen(false); };
  const toggleEffects = () => { Keyboard.dismiss(); setEffectsOpen((v) => !v); setFontOpen(false); setColorOpen(false); };
  const showThePage = () => { Keyboard.dismiss(); closeLists(); };

  // WordArt's buttons, on the words being edited (nothing saved until Done).
  const effects: WordArtChange = {
    outline: (width) => setS((v) => { const p = outlinePatch(v, width); return { ...v, outlineWidth: p.outlineWidth ?? 0, outlineColor: p.outlineColor }; }),
    outlineColour: (hex) => setS((v) => ({ ...v, ...outlineColourPatch(v, hex) })),
    fillTo: (fillTo) => set({ fillTo }),
    glow: (glow) => set({ glow }),
    curve: (curve) => set({ curve }),
    shadow: () => setS((v) => ({ ...v, ...shadowToggled(v) })),
  };

  // "Any color" opens under the end of this short list: it is brought into view.
  const colourList = useRef<ScrollViewInstance>(null);
  const colourListH = useRef(0);
  const onColourListSize = (_w: number, h: number) => {
    if (colourListH.current && h > colourListH.current) colourList.current?.scrollTo({ y: colourListH.current - ANY_COLOR_ROW });
    colourListH.current = h;
  };

  const sideways = useContext(SheetPlacement) === 'side';
  const { width: screenW, height: screenH } = useWindowDimensions();
  const listOpen = fontOpen || colorOpen || effectsOpen;
  // Upright the page gives way to the list. On its side there is no page above to
  // give way: the list takes what is left under the typing box, however many lines
  // that box has, so the format bar is never pushed off the screen (owner, 2026-11-06).
  const listH = sideways ? screenH : Math.max(LIST_MIN, Math.round(screenH * BELOW_THE_PAGE) - BOX_AND_BAR);

  const head = (
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel={CLOSE} onPress={close} style={styles.close} testID="text-editor-close">
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">{EDIT_TEXT}</Text>
      <View style={styles.headRight}>
        {placed && target.kind === 'free' && (
          <Pressable accessibilityRole="button" accessibilityLabel={REMOVE_WORDS} onPress={remove} testID="text-editor-remove"
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
            <Text style={styles.removeText}>{REMOVE}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={DONE} onPress={save} testID="text-editor-done"
          style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
          <Text style={styles.doneText}>{`✓ ${DONE}`}</Text>
        </Pressable>
      </View>
    </View>
  );

  const pageAbove = <PageAbove ctx={ctx} target={target} state={s} opened={opened} onTap={showThePage} place={place} onCover={onCover} />;

  const controls = (
    <>
      <TextInput value={s.text} onChangeText={(text) => set({ text })} placeholder={TYPE_YOUR_TEXT} placeholderTextColor={colors.muted}
        // Sideways too the page stays in view: not Android's full-screen typing box.
        multiline autoFocus disableFullscreenUI onFocus={closeLists} style={[styles.input, sideways && styles.inputSide]} testID="text-editor-input" accessibilityLabel={EDIT_TEXT}
        maxLength={placed ? PLACED_MAX_CHARS : undefined} />

      {fit && !fit.fits && (
        <View style={styles.warn} accessibilityRole="alert" testID="text-too-long">
          <Text style={styles.warnText}>{placed || (s.curve && rect) ? tooLongForPage(!!fit.fitsAt) : tooLong(!!fit.fitsAt)}</Text>
          {stuckLine && <Text style={[styles.warnText, styles.stuck]} testID="text-stuck">{stuckLine}</Text>}
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

      <View style={[styles.barArea, sideways && styles.barAreaSide, sideways && listOpen && styles.barAreaShrinks]} testID="text-bar-area">
        {fontOpen && (
          <View style={[styles.panel, sideways && styles.panelShrinks]} testID="text-font-panel">
            <FontPicker store={store} value={s.fontFamily} loading={fetching} onPick={onPickFont} maxHeight={listH} />
          </View>
        )}
        {colorOpen && (
          <ScrollView ref={colourList} onContentSizeChange={onColourListSize} style={[styles.panel, styles.colorPanel, { maxHeight: listH }]} testID="text-color-panel" keyboardShouldPersistTaps="handled">
            <TextColourPicker value={s.color} onChange={(color) => set({ color })} />
          </ScrollView>
        )}
        {effectsOpen && (
          <ScrollView style={[styles.panel, styles.colorPanel, { maxHeight: listH }]} testID="text-effects-panel" keyboardShouldPersistTaps="handled">
            <WordArtControls value={s} change={effects} prefix="text" label={false} shapes={shapes} />
            <View style={styles.panelEnd} />
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.barKeepsSize} contentContainerStyle={styles.bar} keyboardShouldPersistTaps="handled" testID="text-format-bar">
          <ToolButton label={BOLD} active={s.bold} onPress={() => set({ bold: !s.bold })} testID="text-bold"><Text style={[styles.toolGlyph, styles.boldGlyph]}>B</Text></ToolButton>
          <ToolButton label={ITALIC} active={s.italic} onPress={() => set({ italic: !s.italic })} testID="text-italic"><Text style={[styles.toolGlyph, styles.italicGlyph]}>I</Text></ToolButton>
          <ToolButton label={UNDERLINE} active={s.underline} onPress={() => set({ underline: !s.underline })} testID="text-underline"><Text style={[styles.toolGlyph, styles.underlineGlyph]}>U</Text></ToolButton>
          <Divider />
          <Pressable accessibilityRole="button" accessibilityLabel={fontName(s.fontFamily)} accessibilityState={{ expanded: fontOpen }} testID="text-font-open"
            onPress={toggleFont} style={({ pressed }) => [styles.wide, pressed && styles.pressed]}>
            <Text style={[styles.wideText, { fontFamily: store.uiFont(s.fontFamily).fontFamily }]} numberOfLines={1}>{fontName(s.fontFamily)}</Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <Divider />
          <ToolButton label={SMALLER} onPress={() => set({ fontSize: smaller(s.fontSize) })} testID="text-smaller"><Text style={styles.toolGlyph}>−</Text></ToolButton>
          <Text style={styles.size} testID="text-size">{s.fontSize}</Text>
          <ToolButton label={BIGGER} onPress={() => set({ fontSize: bigger(s.fontSize) })} testID="text-bigger"><Text style={styles.toolGlyph}>+</Text></ToolButton>
          <Divider />
          <Pressable accessibilityRole="button" accessibilityLabel={COLOR} accessibilityState={{ expanded: colorOpen }} testID="text-color-open"
            onPress={toggleColor} style={({ pressed }) => [styles.wide, pressed && styles.pressed]}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.wideText}>{COLOR}</Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <Divider />
          <Pressable accessibilityRole="button" accessibilityLabel={EFFECTS} accessibilityState={{ expanded: effectsOpen }} testID="text-effects-open"
            onPress={toggleEffects} style={({ pressed }) => [styles.wide, hasEffects(s) && styles.toolOn, pressed && styles.pressed]}>
            <Text style={styles.wideText}>{EFFECTS}</Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <Divider />
          {(['left', 'center', 'right'] as const).map((a) => (
            <Toggle key={a} label={ALIGN_WORDS[a]} on={s.alignment === a} onPress={() => set({ alignment: a })} testID={`text-align-${a}`} />
          ))}
        </ScrollView>
      </View>
    </>
  );

  return (
    <Modal animationType="slide" onRequestClose={back} statusBarTranslucent navigationBarTranslucent supportedOrientations={['landscape', 'portrait']} testID="text-editor">
      <SafeAreaView style={styles.page} edges={sideways ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {sideways ? (
            <View style={styles.sideRow}>
              {pageAbove}
              <View style={[styles.side, { width: sidePanelWidth(screenW) }]} testID="text-editor-side">
                {head}
                {controls}
              </View>
            </View>
          ) : (
            <>
              {head}
              {pageAbove}
              {controls}
            </>
          )}
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

/** Any effect is on: the Effects button shows it. */
const hasEffects = (s: EditorState) => s.outlineWidth > 0 || s.shadow || !!s.fillTo || !!s.glow || !!s.curve;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.card },
  head: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: colors.muted },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  done: { minHeight: 48, minWidth: 48, paddingHorizontal: space.md, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  doneText: { color: colors.accentText, fontWeight: '800', fontSize: 15 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  remove: { minHeight: 48, minWidth: 48, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.bad, fontWeight: '700', fontSize: 15 },
  panelEnd: { height: space.sm },
  stuck: { fontWeight: '700' },
  pressed: { opacity: 0.85 },
  sideRow: { flex: 1, flexDirection: 'row' },
  side: { backgroundColor: colors.card, borderLeftWidth: 1, borderLeftColor: colors.border },
  input: { marginHorizontal: 12, marginVertical: space.sm, minHeight: 48, maxHeight: 96, paddingHorizontal: 12, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 10, fontSize: 16, lineHeight: 22, color: colors.text, backgroundColor: colors.card, textAlignVertical: 'top' },
  // On its side, short of room (a list or the keyboard): the box gets shorter and scrolls,
  // down to two whole lines (2 x its lineHeight + its padding), not one and a half.
  inputSide: { flexShrink: 1, minHeight: 2 * 22 + space.sm * 2 },
  warn: { marginHorizontal: 12, marginBottom: space.sm, gap: space.sm, borderRadius: 10, borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', paddingHorizontal: 12, paddingVertical: space.sm },
  warnText: { fontSize: 13, lineHeight: 18, color: '#8A5A12' },
  fitButton: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: space.md, borderRadius: 10, borderWidth: 1, borderColor: '#E8C98A', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 14, fontWeight: '700', color: '#8A5A12' },
  barArea: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  barAreaSide: { marginTop: 'auto' },
  barAreaShrinks: { flexShrink: 1, minHeight: BAR_H },
  barKeepsSize: { flexGrow: 0, flexShrink: 0 },
  panel: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  panelShrinks: { flexShrink: 1 },
  colorPanel: { paddingHorizontal: 12, paddingTop: space.sm },
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
