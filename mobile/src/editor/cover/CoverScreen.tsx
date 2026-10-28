/* ══════════════════════════════════════════════════════════════════════════
   "DESIGN YOUR COVER" (2.0, Phase 4, part 3): the website's CoverEditor, from
   the "Cover" tile before page 1 in the Edit pages strip.

   The FRONT cover only (the spine follows the title, the back is Megy's): the
   cover as print draws it (the page renderer, coverMode), and under it the
   website's two tabs:
     • Background: the album's photos, best first, to tap ("Show all" for the
       rest); the cover's colours and "Use <colour> on every page"; with a
       photo on, Zoom (1 to 3) and Reset, and dragging the cover moves the
       photo in its frame;
     • Text: the cover title, too long → "Make it fit"; its font (the 74),
       colour (the 28 and "Any color"), alignment, Bold, Italic, Shadow, and
       size (16 to 96); dragging the title on the cover moves it, kept on
       the cover.
   The colours and the font list are the words part's own (text/ColourPickers,
   text/FontPicker), so the editor has one look and one way for them: a font
   from the internet is fetched before the title uses it, and the cover's
   font is fetched when the screen opens if this phone doesn't have it yet
   (an album made on the website), so the cover is drawn in its real font.
   Every change is the website's call (coverEdits.ts) on the website's
   builder, while the builder's cover scope is on: turned on when this screen
   is on top, back to the pages when it is left (useFocusEffect, as the cover
   step does). No Undo or Redo here: the cover is not in the album's history,
   as on the website. Each cover change still saves an empty step in the
   album's history (the website's setters do), so the Edit pages Undo starts
   afresh after a cover change (undoBar.coverChanged).

   Moving the photo, zooming it and moving the title follow the finger live
   (CoverStage `live`: drawn over the cover picture; a moving title over the
   cover drawn without it, so it shows once) and send the album ONE
   change when the finger lets go, as a photo on the pages does; the live
   view stays until the cover is drawn with it. Warnings, from the website's rules (coverChecks.ts): a
   blank cover, a title too long, a title colour that wouldn't show.

   Not here yet: the spine beside the cover (the website's SpineStrip and its
   notes read coverLayout.ts, which measures in a browser and is not shared),
   and "Or choose a photo from your phone" (the app draws a cover photo only
   when it is one of the album's).
   ══════════════════════════════════════════════════════════════════════════ */
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { PixelRatio, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontName } from '@web/pages/builder/fontCatalog';
import { textColorName } from '@web/pages/builder/textColors';
import { ALBUM_SIZES, bgCoverFit, type AlbumPage } from '@web/pages/builder/types';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { WORDART_SHADOW } from '@web/pages/builder/wordArtRules';
import { Button } from '../../components/Button';
import { Thumb } from '../../components/Thumb';
import { useBuilder } from '../../builder/BuilderProvider';
import { COVER_PHOTOS_SHOWN, coverPhotoId, coverPhotos } from '../../builder/albumFlow';
import { NOT_DRAWN_LINE, PAGE_NOT_SHOWN } from '../../builder/screenWords';
import { PRIORITY, usePagePicture } from '../../builder/usePagePicture';
import { colors, space } from '../../lib/theme';
import { BLANK_COVER_MESSAGE, coverBlank, titleInkNeeded, titleTooLong } from './coverChecks';
import {
  colourEveryPage, colourTheCover, coverCrop, coverHasPhoto, coverTitleOf, coverWithoutTitle, canRemoveCoverPhoto, fitTitle, moveCoverTitle,
  panCoverPhoto, putPhotoOnCover, removeCoverPhoto, resetCoverCrop, setTitleAlignment, setTitleColour, setTitleFont, setTitleSize,
  shownCoverPhotos, titleBoxOf, titleMovable, TITLE_SIZE, toggleTitleBold, toggleTitleItalic, toggleTitleShadow, typeTitle,
  zoomCoverPhoto, ZOOM_RANGE, type Align,
} from './coverEdits';
import { coverChanged } from '../undoBar';
import { CoverStage, type DragPhase, type DragWhat, type LiveCover } from './CoverStage';
import { PageColourPicker, TextColourPicker } from '../text/ColourPickers';
import { FontListSheet } from '../text/FontPicker';
import { fontStore } from '../text/fonts/appFonts';
import { catalogFace } from '../text/fonts/fontSources';
import { Slider } from './Slider';
import * as W from './words';

type Tab = 'background' | 'text';
const COLUMNS = 5;
const GAP = 6;
/** The cover picture is drawn again at most this often while it changes. */
const DRAW_MS = 300;
/** The live view never stays longer than this after the finger is up. */
const SETTLE_MAX_MS = 2500;

/** `value` as of at most DRAW_MS ago: while the cover keeps changing (typing,
 *  dragging), one picture per DRAW_MS, the last change always drawn. */
function useAtMostEvery<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const at = useRef(0);
  useEffect(() => {
    if (shown === value) return;
    const wait = ms - (Date.now() - at.current);
    if (wait <= 0) { at.current = Date.now(); setShown(value); return; }
    const t = setTimeout(() => { at.current = Date.now(); setShown(value); }, wait);
    return () => clearTimeout(t);
  }, [value, shown, ms]);
  return shown;
}

/** The header: the website's dialog title, and no Undo or Redo (the cover is
 *  not in the album's history). One object, so the navigator isn't handed
 *  new options on every render. */
const HEADER = { title: W.DESIGN_YOUR_COVER };

/** How long after the last key the typed title goes to the album. */
const TYPING_MS = 400;

/** The cover title box. What is typed goes to the album once typing pauses
 *  (and at once when the box is left or the screen closes), not on every key:
 *  each change of the title also saves a step in the album's undo history
 *  that changes nothing (the website's Snapshot has no cover), so a key per
 *  step would fill the 20 steps and push the page changes out of reach of
 *  the Edit pages screen's Undo. The words the album has show here whenever
 *  nothing typed is waiting. */
function TitleInput({ value, onCommit, flushRef }: { value: string; onCommit: (text: string) => void; flushRef: MutableRefObject<() => void> }) {
  const [draft, setDraft] = useState(value);
  const waiting = useRef<string | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const send = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const t = waiting.current;
      waiting.current = null;
      if (t != null) commit.current(t);
    };
    return { later(t: string) { waiting.current = t; if (timer) clearTimeout(timer); timer = setTimeout(flush, TYPING_MS); }, flush };
  }, []);
  // The screen sends what is waiting before it hands the scope back to the
  // pages (leaving it), so the last words typed always reach the cover.
  useEffect(() => {
    flushRef.current = send.flush;
    return () => { send.flush(); flushRef.current = () => {}; };
  }, [send, flushRef]);
  useEffect(() => { if (waiting.current == null) setDraft(value); }, [value]);
  return (
    <TextInput value={draft} onChangeText={(t) => { setDraft(t); send.later(t); }} onBlur={send.flush} onSubmitEditing={send.flush}
      placeholder={W.TITLE_PLACEHOLDER} placeholderTextColor="#9A948C" style={styles.input} accessibilityLabel={W.COVER_TITLE} testID="cover-title" />
  );
}

function Toggle({ label, on, onPress, a11y, testID }: { label: string; on: boolean; onPress: () => void; a11y?: string; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y ?? label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.pressed]}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function CoverScreen() {
  const { builder, platform, text } = useBuilder();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const latest = useRef(builder);
  latest.current = builder;

  // The cover, while this screen is on top; the pages again once it is left
  // (CoverEditor owns the scope for its lifetime). The album is saved on the
  // phone the moment the cover is left, as the Edit pages screen does.
  const { setEditScope } = builder;
  const flushTitle = useRef<() => void>(() => {});
  useFocusEffect(useCallback(() => {
    setEditScope('coverFront');
    return () => {
      flushTitle.current(); // the last words typed, while the scope is still the cover's
      setEditScope('interior');
      latest.current.saveDraftNow();
    };
  }, [setEditScope]));

  const cover = builder.coverFront;
  // A cover change ends the Edit pages Undo there (its history gets an empty
  // step for each one: undoBar.ts).
  const coverOnOpen = useRef(cover);
  useEffect(() => { if (cover !== coverOnOpen.current) coverChanged(); }, [cover]);
  const title = coverTitleOf(cover);
  const hasPhoto = coverHasPhoto(cover);
  const crop = coverCrop(cover);
  const [tab, setTab] = useState<Tab>('background');
  const [showAll, setShowAll] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [sizeLive, setSizeLive] = useState<number | null>(null);
  // The zoom slider's value while it moves (and until the cover is drawn with it).
  const [zoomLive, setZoomLive] = useState<{ z: number; settling: string | null } | null>(null);
  // A slider has the finger: the controls don't scroll meanwhile.
  const [sliding, setSliding] = useState(false);

  // ── The cover as print draws it, as large as leaves room for the controls ──
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const maxW = screenW - space.md * 2;
  const maxH = Math.round(screenH * 0.34);
  const coverW = Math.max(1, Math.floor(Math.min(maxW, (maxH * size.width) / size.height)));
  const coverH = Math.max(1, Math.round((coverW * size.height) / size.width));
  const drawn = useAtMostEvery<AlbumPage>(cover, DRAW_MS);
  const picture = usePagePicture(text, {
    page: drawn, pageIndex: 0, albumSize: builder.albumSize, photos: builder.uploadedPhotos,
    width: Math.min(1400, Math.round(coverW * PixelRatio.get())), coverMode: true,
  }, PRIORITY.editing);
  // While a changed cover is drawn, the last picture stays on show.
  const lastUri = useRef<string | null>(null);
  if (picture.uri) lastUri.current = picture.uri;
  const shownUri = picture.uri ?? lastUri.current;

  // ── Dragging on the cover: the title, or the photo in its frame ──
  // Nothing goes to the album while the finger moves (CoverStage draws it
  // live); one change when it lets go. `uri` is the picture on show then: the
  // live view steps aside once a newer one is.
  type From = { offsetX: number; offsetY: number; focusX: number; focusY: number };
  const drag = useRef<{ what: DragWhat; from: From } | null>(null);
  const [live, setLive] = useState<{ what: DragWhat; dx: number; dy: number; from: From; settling: string | null } | null>(null);
  const onDrag = (what: DragWhat, phase: DragPhase, dx: number, dy: number) => {
    if (phase === 'start') {
      const t = coverTitleOf(latest.current.coverFront);
      const c = coverCrop(latest.current.coverFront);
      const from = { offsetX: t.offsetX, offsetY: t.offsetY, focusX: c.focusX, focusY: c.focusY };
      drag.current = { what, from };
      setLive({ what, dx: 0, dy: 0, from, settling: null });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (phase === 'move') { setLive({ what, dx, dy, from: d.from, settling: null }); return; }
    drag.current = null;
    const moved = Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4;
    const sent = moved && (what === 'title' ? moveCoverTitle(latest.current, d.from, dx, dy) : panCoverPhoto(latest.current, d.from, dx, dy));
    setLive(sent ? { what, dx, dy, from: d.from, settling: shownUri ?? '' } : null);
  };

  // The title's box on the cover: where it is, or where the finger has it.
  const box = titleBoxOf(cover);
  const movable = titleMovable(cover);
  const titleRect = box && movable ? (() => {
    const from = live?.what === 'title' ? live.from : null;
    const ox = from && live ? box.clampX(from.offsetX + live.dx) : title.offsetX;
    const oy = from && live ? box.clampY(from.offsetY + live.dy) : title.offsetY;
    return { x: box.baseX + ox, y: box.baseY + oy, w: box.w, h: box.h };
  })() : null;

  // Under the title's words while the finger moves them: the cover drawn
  // without them (coverWithoutTitle), made ahead at the lowest priority
  // while the title can be moved, so the words are seen once, where the
  // finger has them (found on the emulator: the title showed twice).
  const bareCover = useMemo(() => coverWithoutTitle(drawn), [drawn]);
  const bare = usePagePicture(text, movable && title.text.trim() ? {
    page: bareCover, pageIndex: 0, albumSize: builder.albumSize, photos: builder.uploadedPhotos,
    width: Math.min(1400, Math.round(coverW * PixelRatio.get())), coverMode: true,
  } : null, PRIORITY.ahead);
  const stageUri = live?.what === 'title' && bare.uri ? bare.uri : shownUri;

  // ── The album's photos for the cover, best first ──
  const photos = useMemo(() => coverPhotos(builder.uploadedPhotos).filter((p) => !!p.previewUrl), [builder.uploadedPhotos]);
  const onCover = coverPhotoId(builder);
  const shown = useMemo(() => shownCoverPhotos(photos, showAll, onCover, COVER_PHOTOS_SHOWN), [photos, showAll, onCover]);
  const cell = Math.floor((screenW - space.md * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  // The cover's font, if this phone doesn't have it yet (an album made on the
  // website or another phone): fetched once, and the cover is drawn again in it.
  const titleFont = title.fontFamily;
  useEffect(() => {
    const face = catalogFace(titleFont);
    if (face && fontStore.status(face) === 'missing') void fontStore.ensure(titleFont);
  }, [titleFont]);

  // The live view goes once the cover is drawn with the change (or after a while).
  useEffect(() => {
    if (live?.settling == null) return;
    if (picture.uri && picture.uri !== live.settling) { setLive(null); return; }
    const t = setTimeout(() => setLive(null), SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, [live, picture.uri]);
  useEffect(() => {
    if (zoomLive?.settling == null) return;
    if (picture.uri && picture.uri !== zoomLive.settling) { setZoomLive(null); return; }
    const t = setTimeout(() => setZoomLive(null), SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, [zoomLive, picture.uri]);

  // What the finger shows, drawn over the cover picture (CoverStage live).
  const liveView: LiveCover | null = (() => {
    const movingPhoto = live?.what === 'photo' || zoomLive != null;
    const movingTitle = live?.what === 'title';
    if (!movingPhoto && !movingTitle) return null;
    let photo: LiveCover['photo'] = null;
    if (movingPhoto) {
      const id = (cover.background as { photoId?: string } | undefined)?.photoId;
      const p = id ? builder.uploadedPhotos.find((u) => u.id === id) : undefined;
      if (p?.previewUrl && p.width > 0 && p.height > 0) {
        const fx = live?.what === 'photo' ? Math.max(0, Math.min(1, live.from.focusX - live.dx)) : crop.focusX;
        const fy = live?.what === 'photo' ? Math.max(0, Math.min(1, live.from.focusY - live.dy)) : crop.focusY;
        const r = bgCoverFit(p.width, p.height, coverW, coverH, zoomLive?.z ?? crop.zoom, fx, fy);
        photo = { uri: p.previewUrl, x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    // The title's words over a moving photo, or in the box the finger moves.
    const rect = titleRect ?? (box ? { x: box.baseX + title.offsetX, y: box.baseY + title.offsetY, w: box.w, h: box.h } : null);
    const k = coverW / getCanvasDimensions(builder.albumSize).width;
    const ui = fontStore.uiFont(title.fontFamily, title.bold, title.italic);
    const titleView = rect && title.text.trim() && (photo || movingTitle) ? {
      rect, text: title.text, ghost: movingTitle,
      style: {
        fontFamily: ui.fontFamily, fontWeight: ui.fontWeight, fontStyle: ui.fontStyle, color: title.color,
        fontSize: Math.max(6, title.fontSize * k), lineHeight: Math.max(8, title.fontSize * k * 1.2), textAlign: title.alignment,
        textDecorationLine: title.underline ? 'underline' as const : 'none' as const,
        ...(title.shadow ? { textShadowColor: WORDART_SHADOW.color, textShadowOffset: { width: WORDART_SHADOW.offsetX * k, height: WORDART_SHADOW.offsetY * k }, textShadowRadius: WORDART_SHADOW.blur * k } : {}),
      },
    } : null;
    return photo || titleView ? { photo, title: titleView } : null;
  })();

  // ── What the website warns about ──
  const blank = coverBlank(cover);
  const tooLong = titleTooLong(cover, builder.albumSize, platform.textMeasurer());
  const ink = titleInkNeeded(cover);

  const done = () => { flushTitle.current(); if (router.canGoBack()) router.back(); else router.replace('/edit-pages'); };

  return (
    <View style={styles.page}>
      <Stack.Screen options={HEADER} />
      <View style={styles.top}>
        <Text style={styles.sub} testID="cover-one-photo">{W.ONE_PHOTO}</Text>
        <CoverStage
          uri={stageUri} busy={!picture.uri && !!shownUri} failed={picture.error ? PAGE_NOT_SHOWN : null}
          width={coverW} height={coverH} titleRect={titleRect} hasPhoto={hasPhoto} onDrag={onDrag} label={W.FRONT_COVER}
          live={liveView}
        />
        <Text style={styles.caption}>{W.FRONT_COVER}</Text>
        {picture.notDrawn.length > 0 && <Text style={styles.small} testID="cover-not-drawn">{NOT_DRAWN_LINE}</Text>}
        {blank && <Text style={styles.warnLine} accessibilityLiveRegion="polite" testID="cover-blank">{BLANK_COVER_MESSAGE}</Text>}
        <Text style={styles.small}>{W.BACK_NOTE}</Text>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['background', 'text'] as const).map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={W.TABS[t]} onPress={() => setTab(t)}
            testID={`cover-tab-${t}`} style={({ pressed }) => [styles.tab, tab === t && styles.tabOn, pressed && styles.pressed]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{W.TABS[t]}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsBody} keyboardShouldPersistTaps="handled" scrollEnabled={!sliding}>
        {tab === 'background' ? (
          <>
            {photos.length > 0 && (
              <View testID="cover-your-photos">
                <Text style={styles.label}>{W.YOUR_PHOTOS}</Text>
                <View style={styles.grid}>
                  {shown.map((p) => {
                    const on = p.id === onCover;
                    return (
                      <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? 'On the cover' : 'Put this photo on the cover'}
                        onPress={() => putPhotoOnCover(builder, p)} style={[styles.cell, { width: cell, height: cell }, on && styles.cellOn]} testID={`cover-photo-${p.id}`}>
                        <Thumb uri={p.previewUrl} size={on ? cell - 6 : cell} recyclingKey={p.id} />
                        {on && <View style={styles.tickDot}><Text style={styles.tickText}>✓</Text></View>}
                      </Pressable>
                    );
                  })}
                </View>
                {photos.length > COVER_PHOTOS_SHOWN && (
                  <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.linkButton} testID="cover-show-all-photos">
                    <Text style={styles.linkText}>{showAll ? W.SHOW_FEWER : W.showAllPhotos(photos.length)}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={styles.label}>{W.COLOUR}</Text>
            <PageColourPicker background={cover.background} onPick={(hex) => colourTheCover(builder, hex)} onPickAll={(hex) => colourEveryPage(builder, hex)} testID="cover-color" />

            {hasPhoto && (
              <View style={styles.box} testID="cover-zoom">
                <View style={styles.row}>
                  <Text style={styles.label}>{W.ZOOM}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={W.RESET} onPress={() => resetCoverCrop(builder)} style={styles.linkButton} testID="cover-zoom-reset">
                    <Text style={styles.linkText}>{W.RESET}</Text>
                  </Pressable>
                </View>
                {/* Live while the finger slides (drawn over the cover), one change when it lets go. */}
                <Slider value={zoomLive?.z ?? crop.zoom} min={ZOOM_RANGE.min} max={ZOOM_RANGE.max} step={ZOOM_RANGE.step} label={W.ZOOM}
                  onSlide={(z) => setZoomLive({ z, settling: null })}
                  onDone={(z) => { const sent = zoomCoverPhoto(latest.current, z); setZoomLive(sent ? { z, settling: shownUri ?? '' } : null); }}
                  onActive={setSliding} testID="cover-zoom-slider" />
                <Text style={styles.small}>{W.DRAG_HINT}</Text>
              </View>
            )}
            {canRemoveCoverPhoto(cover) && (
              <Pressable accessibilityRole="button" accessibilityLabel={W.REMOVE_PHOTO} onPress={() => removeCoverPhoto(builder)} testID="cover-remove-photo"
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                <Text style={styles.removeText}>{`✕  ${W.REMOVE_PHOTO}`}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.label}>{W.COVER_TITLE}</Text>
            <TitleInput value={title.text} onCommit={(t) => typeTitle(latest.current, t)} flushRef={flushTitle} />
            {tooLong && (
              <View style={styles.warn} testID="cover-title-too-long">
                <Text style={styles.warnText}>{W.tooLongLine(!!tooLong.fitsAt)}</Text>
                {tooLong.fitsAt && (
                  <Pressable accessibilityRole="button" onPress={() => fitTitle(builder, tooLong.fitsAt!)} style={styles.warnButton} testID="cover-title-make-fit">
                    <Text style={styles.warnButtonText}>{W.makeItFit(tooLong.fitsAt)}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={styles.label}>{W.FONT}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${W.FONT}: ${fontName(title.fontFamily)}`} onPress={() => setFontsOpen(true)} testID="cover-font"
              style={({ pressed }) => [styles.fontBox, pressed && styles.pressed]}>
              <Text style={styles.fontBoxText} numberOfLines={1}>{fontName(title.fontFamily)}</Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>

            <Text style={styles.label}>{W.COLOUR}</Text>
            <TextColourPicker value={title.color} onChange={(hex) => setTitleColour(builder, hex)} testID="cover-title-color" />
            {ink && (
              <View style={styles.warn} testID="cover-title-hard-to-see">
                <Text style={styles.warnText}>{W.TITLE_HARD_TO_SEE}</Text>
                <Pressable accessibilityRole="button" onPress={() => setTitleColour(builder, ink)} style={styles.warnButton} testID="cover-title-use-ink">
                  <Text style={styles.warnButtonText}>{W.useInk(textColorName(ink) ?? ink)}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.label}>{W.ALIGNMENT}</Text>
            <View style={styles.segments}>
              {(['left', 'center', 'right'] as Align[]).map((a) => (
                <Toggle key={a} label={W.ALIGN_WORDS[a]} a11y={W.alignLabel(a)} on={title.alignment === a} onPress={() => setTitleAlignment(builder, a)} testID={`cover-align-${a}`} />
              ))}
            </View>

            <Text style={styles.label}>{W.STYLE}</Text>
            <View style={styles.segments}>
              <Toggle label={W.BOLD} on={title.bold} onPress={() => toggleTitleBold(builder)} testID="cover-title-bold" />
              <Toggle label={W.ITALIC} on={title.italic} onPress={() => toggleTitleItalic(builder)} testID="cover-title-italic" />
              <Toggle label={W.SHADOW} a11y={W.SHADOW_HINT} on={title.shadow} onPress={() => toggleTitleShadow(builder)} testID="cover-title-shadow" />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>{W.SIZE}</Text>
              <Text style={styles.small} testID="cover-title-size">{W.sizeLine(sizeLive ?? title.fontSize)}</Text>
            </View>
            {/* One change when the finger lets go: each size change is a
                change of the cover title, drawn again. */}
            <Slider value={title.fontSize} min={TITLE_SIZE.min} max={TITLE_SIZE.max} step={1} label={W.SIZE}
              onSlide={setSizeLive} onDone={(px) => { setSizeLive(null); setTitleSize(latest.current, px); }} onActive={setSliding} testID="cover-title-size-slider" />
          </>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button label={W.DONE} onPress={done} testID="cover-done" />
      </SafeAreaView>

      {fontsOpen && <FontListSheet value={title.fontFamily} onPick={(f) => setTitleFont(latest.current, f)} onClose={() => setFontsOpen(false)} testID="cover-font-list" />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: space.md, paddingTop: space.sm, gap: 6, alignItems: 'center' },
  sub: { fontSize: 14, color: colors.muted },
  caption: { fontSize: 13, color: colors.muted },
  small: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  warnLine: { fontSize: 13, color: '#8A5A12', backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#F0D9A8', borderRadius: 10, paddingHorizontal: space.sm, paddingVertical: 6, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  tab: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tabOn: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.text },
  tabTextOn: { color: colors.accent },
  controls: { flex: 1 },
  controlsBody: { padding: space.md, gap: space.sm, paddingBottom: space.lg },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 4 },
  cell: { borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderWidth: 3, borderColor: colors.accent },
  tickDot: { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  linkButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, paddingBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  removeButton: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.bad, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  removeText: { fontSize: 15, fontWeight: '700', color: colors.bad },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 17, color: colors.text, minHeight: 48 },
  warn: { borderWidth: 1, borderColor: '#F0D9A8', backgroundColor: '#FFF6E5', borderRadius: 10, padding: space.sm, gap: space.sm },
  warnText: { fontSize: 14, color: '#8A5A12' },
  warnButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#E8C98A', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: space.md },
  warnButtonText: { fontSize: 14, fontWeight: '700', color: '#8A5A12' },
  fontBox: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fontBoxText: { flex: 1, fontSize: 16, color: colors.text },
  chevron: { fontSize: 16, color: colors.muted, marginLeft: space.sm },
  segments: { flexDirection: 'row', gap: space.sm },
  toggle: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  toggleOn: { borderWidth: 2, borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  toggleText: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggleTextOn: { color: colors.accent, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
