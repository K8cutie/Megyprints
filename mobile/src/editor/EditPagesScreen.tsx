/* ══════════════════════════════════════════════════════════════════════════
   "EDIT PAGES" (2.0, Phase 4): the website's phone editor (MobileReview),
   reached from the Preview and back.

   One page at a time, large, drawn by the page renderer; a swipe, the page
   turn in words (PageTurnBar: "Previous page", "Next page", "Done — Preview
   my album", "Back to preview") or a page number in the strip moves through
   the album. A tap on the page asks hitTest.ts what it landed on (the same
   boxes the renderer draws in): a photo, words, an empty frame or caption
   box, a free text. The selection lives in the website's own album builder
   (selection.ts), and so does every change: a part's button calls
   useBuilderState (shared), never a page object of its own.

   What a tap does and what the buttons are come from the parts
   (registry.ts; photos, text and cover each in their own folder): this
   screen only selects, outlines, opens their sheets, turns pages, and offers
   the website's Undo and Redo (the album's 20-step history in
   useBuilderState; the cover is not in it, as on the website; Undo stops
   at the album as the editor found it, kept over a trip to the Preview and
   back, and starts again where photos came in or the cover was changed; a
   step that changes nothing on the pages is stepped over: undoBar.ts).

   Saved on the phone 2 s after the last change, as well as when the editor
   is left (the builder's own timers wait 15-30 s), so an app killed while
   editing keeps what was done.

   While this screen is on top the builder edits the album's pages, never
   the cover: the cover step below it in the stack keeps its cover scope
   only while it is the screen on top (see album-cover.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALBUM_SIZES, dealtBoxRoll } from '@web/pages/builder/types';
import { useSettleGuard } from '@web/lib/settleGuard';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { NOT_DRAWN_LINE, PAGE_NOT_SHOWN } from '../builder/screenWords';
import { PRIORITY, usePagePicture } from '../builder/usePagePicture';
import { colors, space } from '../lib/theme';
import { A11Y, BACK_TO_PREVIEW, DONE_PREVIEW, EDIT_PAGES, NEXT_PAGE, pageLine, PREVIOUS_PAGE, REDO, ROLL_LABELS, UNDO } from './editorWords';
import { EMPTY_KINDS, hitTest, pageTargets, type Target } from './hitTest';
import { PageStage, type EmptyHintInfo, type ReachInfo } from './PageStage';
import { addChoicesFor, bannersFor, onRegistryChange, overlayComponents, registryVersion, runTap, selectedActionsFor, sheetById, stripTiles, toolsFor, type EditorContext } from './registry';
import { editThePages } from './scope';
import { selectedTarget, selectTarget } from './selection';
import { renderedLines } from './textLines';
import { lastEditorVisit, MOST_STEPS, nothingChanged, redoShown, rememberVisit, startOnOpen, undoShown } from './undoBar';
import './parts';

/** How long a line over the page stays (the website's guard line). */
const NOTE_MS = 2600;
/** Saved on the phone this long after the last change. */
const SAVE_AFTER_MS = 2000;
const TILE = 48;
const TILE_GAP = 8;

function HeaderUndo({ canUndo, canRedo, undo, redo }: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }) {
  // Shown only when there is something to undo or redo: never a greyed
  // button. Each keeps its own place, so a button coming or going never
  // moves the other under a finger tapping Undo again and again (found on
  // the emulator: Redo appeared where Undo had been). An empty, silent
  // space holds the place of one not shown.
  return (
    <View style={styles.headerRow}>
      {canUndo ? (
        <Pressable accessibilityRole="button" accessibilityLabel={UNDO} onPress={undo} style={styles.headerButton} testID="edit-undo">
          <Text style={styles.headerText}>{`↶ ${UNDO}`}</Text>
        </Pressable>
      ) : <View style={styles.headerButton} importantForAccessibility="no" />}
      {canRedo ? (
        <Pressable accessibilityRole="button" accessibilityLabel={REDO} onPress={redo} style={styles.headerButton} testID="edit-redo">
          <Text style={styles.headerText}>{`${REDO} ↷`}</Text>
        </Pressable>
      ) : <View style={styles.headerButton} importantForAccessibility="no" />}
    </View>
  );
}

export default function EditPagesScreen() {
  useSyncExternalStore(onRegistryChange, registryVersion);
  const { builder, platform, text } = useBuilder();
  const { width: screenW } = useWindowDimensions();
  const pages = builder.albumPages;
  const total = pages.length;
  const index = Math.min(Math.max(0, builder.currentPageIndex), Math.max(0, total - 1));
  const page = pages[index];

  // The pages, never the cover, while this screen is on top.
  const { editScope, setEditScope } = builder;
  useFocusEffect(useCallback(() => { editThePages({ editScope, setEditScope }); }, [editScope, setEditScope]));
  const latest = useRef(builder);
  latest.current = builder;

  // Undo goes back as far as the album was when the editor was opened on it,
  // and still does after a trip to the Preview and back when nothing changed
  // the pages in between (undoBar.ts).
  const [start, setStart] = useState(() => startOnOpen(builder.albumPages, lastEditorVisit()));
  const startRef = useRef(start);
  startRef.current = start;
  useFocusEffect(useCallback(() => {
    setStart(startOnOpen(latest.current.albumPages, lastEditorVisit()));
    return () => {
      rememberVisit({ start: startRef.current, leftOn: latest.current.albumPages });
      // On the phone the moment the editor is left (the builder's own write).
      latest.current.saveDraftNow();
    };
  }, []));
  // Photos came in (added from the phone, or missing ones put back): Undo
  // starts again here, so it can never take them out (undoBar.ts).
  // Redo steps from before they came in hold the old photo list too: Redo is
  // held back until the album's next edit clears them.
  const [redoHeld, setRedoHeld] = useState(false);
  const restartUndo = useCallback(() => {
    setStart(latest.current.albumPages);
    if (latest.current.canRedo) setRedoHeld(true);
  }, []);
  useEffect(() => { if (!builder.canRedo) setRedoHeld(false); }, [builder.canRedo]);

  // Undo and Redo: the builder's own, one step; a step that changes nothing
  // on the pages (a cover change's empty step) is stepped over, one step at
  // a time once the album has taken the last one, never past the start.
  const [historyTick, setHistoryTick] = useState(0);
  const stepping = useRef<{ dir: 'undo' | 'redo'; before: { pages: typeof pages; pagesJson: string; photos: typeof builder.uploadedPhotos }; left: number } | null>(null);
  const step = useCallback((dir: 'undo' | 'redo') => {
    const b = latest.current;
    stepping.current = { dir, before: { pages: b.albumPages, pagesJson: JSON.stringify(b.albumPages), photos: b.uploadedPhotos }, left: MOST_STEPS - 1 };
    if (dir === 'undo') b.undo(); else b.redo();
    setHistoryTick((t) => t + 1);
  }, []);
  useEffect(() => {
    const s = stepping.current;
    if (!s) return;
    const b = latest.current;
    const more = s.dir === 'undo' ? b.canUndo && b.albumPages !== startRef.current : b.canRedo;
    if (s.left > 0 && more && nothingChanged(s.before, { pages: b.albumPages, photos: b.uploadedPhotos })) {
      s.left--;
      if (s.dir === 'undo') b.undo(); else b.redo();
      setHistoryTick((t) => t + 1);
      return;
    }
    stepping.current = null;
  }, [historyTick]);
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  // On the phone 2 s after the last change too (not only when left).
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return; }
    const t = setTimeout(() => latest.current.saveDraftNow(), SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [builder.albumPages, builder.coverFront, builder.uploadedPhotos]);

  // ── The page's size on screen: as large as the space between the bars ──
  const [area, setArea] = useState({ w: 0, h: 0 });
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const aspect = size.width / size.height;
  const shownW = Math.max(1, Math.floor(Math.min(area.w - space.md * 2, (area.h - space.sm) * aspect)));
  const shownH = Math.max(1, Math.round(shownW / aspect));

  // The picture is drawn for the widest the page can be on this phone, so a
  // bar coming or going never draws it again; while a changed page is being
  // drawn, the last picture of it stays on show.
  const px = Math.min(1400, Math.round((screenW - space.md * 2) * PixelRatio.get()));
  const req = page ? { page, pageIndex: index, albumSize: builder.albumSize, photos: builder.uploadedPhotos, width: px } : null;
  const picture = usePagePicture(text, req, PRIORITY.editing);
  const lastShown = useRef<{ index: number; uri: string } | null>(null);
  if (picture.uri) lastShown.current = { index, uri: picture.uri };
  const shownUri = picture.uri ?? (lastShown.current?.index === index ? lastShown.current.uri : null);

  // ── What a tap can hit, and what is selected ──
  const plan = useMemo(
    () => (page ? pageTargets({ page, albumSize: builder.albumSize, pageIndex: index, photoCount: builder.uploadedPhotos.length, countLines: renderedLines(text) }) : null),
    [page, builder.albumSize, index, builder.uploadedPhotos.length, text],
  );
  const targets = useMemo(() => plan?.targets ?? [], [plan]);
  const selected = selectedTarget(builder.selectedElementId, index, targets);
  const select = (t: Target | null) => selectTarget(builder, index, t, builder.uploadedPhotos);

  const [sheet, setSheet] = useState<{ id: string; params: unknown } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (message: string) => {
    setNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);

  const ctx: EditorContext | null = page ? {
    builder, platform, text, pageIndex: index, page, targets, selected, select,
    openSheet: (id, params) => setSheet({ id, params }),
    closeSheet: () => setSheet(null),
    say,
    restartUndo,
  } : null;

  const onTap = (x: number, y: number) => {
    if (!ctx) return;
    const hit = hitTest(targets, x, y);
    if (hit) runTap(hit, ctx);
    else select(null);
  };

  // ── Turning pages (PageTurnBar: a double tap turns ONE page) ──
  const tooSoon = useSettleGuard(index);
  const turn = (fn: () => void) => () => { if (!tooSoon()) fn(); };
  const goPrev = () => { if (index > 0) builder.goToPage(index - 1); };
  const goNext = () => { if (index < total - 1) builder.goToPage(index + 1); };
  const backToPreview = () => { if (router.canGoBack()) router.back(); else router.replace('/preview'); };

  // The page strip follows the page.
  const strip = useRef<ScrollViewInstance>(null);
  const before = stripTiles();
  useEffect(() => {
    const x = (before.length + index) * (TILE + TILE_GAP) - (screenW / 2 - TILE / 2);
    strip.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [index, before.length, screenW]);

  const canUndo = undoShown(builder.canUndo, builder.albumPages, start);
  const canRedo = redoShown(builder.canRedo, redoHeld);
  const header = useMemo(() => ({
    title: EDIT_PAGES,
    headerRight: () => <HeaderUndo canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} />,
  }), [canUndo, canRedo, undo, redo]);

  if (!page || !ctx || !plan) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={header} />
        <Text style={styles.line}>No pages yet.</Text>
        <Button label={BACK_TO_PREVIEW} onPress={backToPreview} />
      </View>
    );
  }

  // What an empty frame or box offers, from the parts (none: no box drawn).
  const hints: EmptyHintInfo[] = targets.filter((t) => EMPTY_KINDS.includes(t.kind)).flatMap((t) => {
    const choices = addChoicesFor(t.kind);
    if (!choices.length) return [];
    const roll = t.kind === 'emptyBox' ? dealtBoxRoll(page, t.index) : null;
    return [{ target: t, options: choices.map((c) => c.short), roll: roll && choices.some((c) => c.id === roll) ? ROLL_LABELS[roll] : null }];
  });
  // Every thing on the page, named for TalkBack (PageStage reach).
  let photoN = 0;
  const reach: ReachInfo[] = targets.map((t) => {
    const optionsOf = () => addChoicesFor(t.kind).map((c) => c.short);
    const label = t.kind === 'photo' ? A11Y.photo(++photoN)
      : t.kind === 'boxPhoto' ? A11Y.boxPhoto
        : t.kind === 'boxText' || t.kind === 'freeText' ? A11Y.words(page.textElements?.find((e) => e.id === t.textId)?.text ?? '')
          : t.kind === 'slotText' ? A11Y.words(page.slotTexts?.[t.index]?.text ?? '')
            : t.kind === 'emptySlot' ? A11Y.emptySlot(optionsOf())
              : t.kind === 'emptyBox' ? A11Y.emptyBox(optionsOf())
                : t.kind === 'slotQr' || t.kind === 'boxQr' ? A11Y.qr
                  : t.kind === 'sticker' ? A11Y.sticker : A11Y.graphic;
    return { target: t, label, selected: selected?.key === t.key };
  });
  const actions = selected ? selectedActionsFor(selected, ctx) : [];
  const allTools = toolsFor(ctx);
  const tools = allTools.filter((t) => !t.wide);
  const wideTools = allTools.filter((t) => t.wide);
  const banners = bannersFor();
  const isLast = index >= total - 1;
  const Sheet = sheet ? sheetById(sheet.id) : null;
  const overlays = overlayComponents();

  return (
    <View style={styles.page}>
      <Stack.Screen options={header} />
      <Text style={styles.line} testID="edit-counter">{pageLine(index, total)}</Text>
      {/* The parts' lines over the page, in order: photos missing on this
          phone, a swap waiting, "This page is yours", the blank pages… */}
      {banners.map(({ id, Component }) => <Component key={id} ctx={ctx} />)}

      <View style={styles.area} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height - NOTE_LINE })}>
        {area.w > 0 && (
          <PageStage
            uri={shownUri} busy={!picture.uri && !!shownUri} failed={picture.error ? PAGE_NOT_SHOWN : null}
            width={shownW} height={shownH} pageWidth={plan.width}
            hints={hints} selected={selected} note={note}
            overlay={overlays.length ? overlays.map((O, i) => <O key={i} ctx={ctx} scale={shownW / plan.width} width={shownW} height={shownH} />) : undefined}
            onTap={onTap}
            onSwipe={(dir) => (dir === 'forward' ? turn(goNext) : turn(goPrev))()}
            reach={reach}
            onActivate={(t) => runTap(t, ctx)}
          />
        )}
        <Text style={styles.notDrawn} numberOfLines={2} testID="edit-not-drawn">{picture.notDrawn.length > 0 ? NOT_DRAWN_LINE : ''}</Text>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {/* The selected element's buttons, from the parts (the row keeps its
            place, so the page never jumps when something is picked). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} overScrollMode="never" style={styles.actionsRow} contentContainerStyle={styles.actions} testID="edit-selected-actions">
          {actions.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => a.onPress(selected!, ctx)} testID={`edit-action-${a.id}`}
              style={({ pressed }) => [styles.action, a.danger && styles.actionDanger, pressed && styles.pressed]}>
              <Text style={[styles.actionText, a.danger && styles.actionDangerText]}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} overScrollMode="never" contentContainerStyle={styles.strip} testID="edit-strip">
          {before.map((t) => (
            <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label} onPress={() => t.onPress(ctx)} style={[styles.tile, styles.tileWide]} testID={`edit-strip-${t.id}`}>
              <Text style={styles.tileText}>{t.label}</Text>
            </Pressable>
          ))}
          {pages.map((_p, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Page ${i + 1}`} accessibilityState={{ selected: i === index }}
              onPress={() => builder.goToPage(i)} style={[styles.tile, i === index && styles.tileNow]} testID={`edit-strip-page-${i + 1}`}>
              <Text style={[styles.tileText, i === index && styles.tileTextNow]}>{i + 1}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tools.length > 0 && (
          <View style={styles.tools} testID="edit-tools">
            {tools.map((t) => (
              <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label} onPress={() => t.onPress(ctx)} testID={`edit-tool-${t.id}`}
                style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
                <Text style={styles.toolText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {wideTools.map((t) => (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label} onPress={() => t.onPress(ctx)} testID={`edit-tool-${t.id}`}
            style={({ pressed }) => [styles.tool, styles.toolWide, pressed && styles.pressed]}>
            <Text style={styles.toolText}>{t.label}</Text>
          </Pressable>
        ))}

        <View style={styles.turnRow}>
          {index > 0 && <Button label={`‹ ${PREVIOUS_PAGE}`} kind="plain" onPress={turn(goPrev)} style={styles.turnButton} testID="edit-prev" />}
          {isLast
            ? <Button label={DONE_PREVIEW} onPress={turn(backToPreview)} style={styles.turnButton} testID="edit-done" />
            : <Button label={`${NEXT_PAGE} ›`} onPress={turn(goNext)} style={styles.turnButton} testID="edit-next" />}
        </View>
        {!isLast && (
          <Pressable accessibilityRole="button" accessibilityLabel={BACK_TO_PREVIEW} onPress={turn(backToPreview)} style={styles.back} testID="edit-back-to-preview">
            <Text style={styles.backText}>{BACK_TO_PREVIEW}</Text>
          </Pressable>
        )}
      </SafeAreaView>

      {Sheet && sheet && <Sheet ctx={ctx} params={sheet.params} close={() => setSheet(null)} />}
    </View>
  );
}

/** Room kept under the page for the "drawn more simply" line. */
const NOTE_LINE = 36;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#EFE9E1' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 74, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  headerText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  line: { fontSize: 13, fontWeight: '600', color: colors.muted, textAlign: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notDrawn: { height: NOTE_LINE, fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: space.md, paddingTop: 4 },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm },
  actionsRow: { flexGrow: 0, minHeight: 48 },
  actions: { gap: space.sm, alignItems: 'center' },
  action: { minHeight: 48, paddingHorizontal: space.md, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  actionDanger: { borderColor: colors.bad },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  actionDangerText: { color: colors.bad },
  pressed: { opacity: 0.85 },
  strip: { gap: TILE_GAP, paddingVertical: 2 },
  tile: { width: TILE, height: TILE, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  tileWide: { width: undefined, paddingHorizontal: space.md },
  tileNow: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  tileText: { fontSize: 15, fontWeight: '600', color: colors.text },
  tileTextNow: { fontWeight: '800', color: colors.accent },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tool: { flexGrow: 1, flexBasis: '30%', minHeight: 52, borderRadius: 12, backgroundColor: '#F5EEE6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  toolWide: { flexBasis: 'auto', minHeight: 48 },
  toolText: { fontSize: 13, fontWeight: '700', color: '#5C4A3A', textAlign: 'center' },
  turnRow: { flexDirection: 'row', gap: space.sm },
  turnButton: { flex: 1, paddingHorizontal: space.sm },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
