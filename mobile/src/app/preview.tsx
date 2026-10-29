/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW: the album as a book, the website's way (BuilderPreview, its
   words), its rules shared: where a turn goes (previewPaging.ts) and what a
   turning leaf shows (pageTurn.ts planTurn).

   It opens on the closed book's front cover. "Next page" opens it on page 1;
   an upright phone shows one page at a time, and "See it as an open book"
   shows two facing pages, as they print: page 1 on the right across from the
   inside of the front cover, then 2 | 3, 4 | 5… A swipe turns the page too.
   Each turn plays the website's page turn (the leaf hinged at the spine).

   "Edit pages" (the website's way into its editor) opens the editor
   (src/editor) on the page shown; its "Back to preview" comes back here, on
   the page it was on. On the closed book, "Edit cover" opens the cover
   editor (src/editor/cover), as the website's Preview does.

   Every page is drawn by the app's page renderer from the builder's own page
   data (usePagePicture). When something on a page is drawn more simply than
   it prints, one plain line under the book says so.

   Saving: the album is on the phone (written when the Preview opens, so
   "Saved on this phone" is true). Signed in, a newly made album goes to the
   account once (accountSave.ts); after that the builder's own autosave
   sends changes only (its "nothing changed: no write" rule). Changed on
   another device too, or deleted there: the website's question, its words.
   Photos this phone no longer has are named, with the way to put them back.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { conflictMessage, DELETED_ELSEWHERE_MESSAGE } from '@web/lib/albumSyncRecord';
import { missingPhotos } from '@web/lib/photoPresence';
import { atAlbumEnd, canTurnBack, canTurnForward, previewCaption, previewCounter, swipeTurn, turnBack, turnForward, spreadStart, type PreviewPosition, type PreviewView, type Turn } from '@web/pages/builder/previewPaging';
import { planTurn, type TurnFace, type TurnPlan } from '@web/pages/builder/pageTurn';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { accountSaveDue, markAccountSaved } from '../builder/accountSave';
import { missingOnPhoneMessage, NOT_DRAWN_LINE, PAGE_NOT_SHOWN } from '../builder/screenWords';
import { forgetPhotoPictures, preparePagePicture, PRIORITY, usePagePicture } from '../builder/usePagePicture';
import { useOncePerVisit } from '../lib/useOncePerVisit';
import type { PageRequest } from '../builder/pageImages';
import { EDIT_PAGES } from '../editor/editorWords';
import { COVER_ROUTE } from '../editor/cover';
import { EDIT_COVER } from '../editor/cover/words';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draftStore';
import { colors, space } from '../lib/theme';
import type { PageText } from '../render/pageText';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';

interface FaceProps {
  face: TurnFace;
  W: number;
  H: number;
  pages: AlbumPage[];
  cover: AlbumPage;
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  text: PageText | null;
  onNotDrawn?: (key: string, list: string[]) => void;
}

/** What a face draws: a page or the cover (the inside of a cover is plain). */
function faceRequest(face: TurnFace, { W, pages, cover, photos, albumSize }: Pick<FaceProps, 'W' | 'pages' | 'cover' | 'photos' | 'albumSize'>): PageRequest | null {
  const px = Math.min(1400, Math.round(W * PixelRatio.get()));
  if (face.kind === 'page' && pages[face.index]) return { page: pages[face.index], pageIndex: face.index, albumSize, photos, width: px };
  if (face.kind === 'cover') return { page: cover, pageIndex: 0, albumSize, photos, width: px, coverMode: true };
  return null;
}

/** One side of a leaf: a page as it prints, the front cover, or the inside of a cover.
 *  Drawn only while the Preview is the screen on top: under "Edit pages" or
 *  the cover editor it keeps its last picture and asks for no new one, so
 *  every edit there draws the page once, for the screen the customer sees. */
function Face({ face, W, H, pages, cover, photos, albumSize, text, onNotDrawn }: FaceProps) {
  const focused = useIsFocused();
  const req = focused ? faceRequest(face, { W, pages, cover, photos, albumSize }) : null;
  const picture = usePagePicture(text, req, PRIORITY.shown);
  const key = face.kind === 'page' ? `p${face.index}` : face.kind;
  useEffect(() => { if (req) onNotDrawn?.(key, picture.notDrawn); }, [key, picture.notDrawn.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (face.kind === 'inside') {
    return (
      <View style={[styles.face, styles.inside, { width: W, height: H }]} testID={`preview-inside-${face.cover}`}>
        <Text style={styles.insideText}>Inside of the {face.cover} cover</Text>
      </View>
    );
  }
  return (
    <View style={[styles.face, { width: W, height: H }]} testID={face.kind === 'cover' ? 'preview-cover' : `preview-page-${face.index + 1}`}>
      {picture.uri ? (
        <Image source={{ uri: picture.uri }} style={{ width: W, height: H }} contentFit="fill" transition={0} cachePolicy="memory-disk" />
      ) : picture.error ? (
        <Text style={styles.insideText}>{PAGE_NOT_SHOWN}</Text>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

const EASE = Easing.bezier(0.45, 0.05, 0.25, 1);
/** Longest a turn waits for its pages to be drawn before it plays anyway. */
const TURN_WAIT_MS = 1500;

/** The page turn over the book (the website's PageTurnLayer, in React Native
 *  views): the leaf hinged at the spine turns from `from` to `to` degrees; its
 *  front shows until it stands on edge, then its back. The old page stays on
 *  show on the side the leaf hasn't reached (`patch`). */
function TurnLayer({ plan, W, H, spineX, face, onDone }: { plan: TurnPlan; W: number; H: number; spineX: number; face: (f: TurnFace) => ReactNode; onDone: () => void }) {
  const angle = useRef(new Animated.Value(plan.leaf.from)).current;
  // The screen re-renders during a turn (a page finishing drawing): the turn
  // carries on; only its own end (finished) ends it.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const anim = Animated.timing(angle, { toValue: plan.leaf.to, duration: plan.ms, easing: EASE, useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) done.current(); });
    return () => anim.stop();
  }, [angle, plan]);
  const rotate = angle.interpolate({ inputRange: [-180, 0], outputRange: ['-180deg', '0deg'], extrapolate: 'extend' });
  const front = angle.interpolate({ inputRange: [-180, -90.01, -90, 0], outputRange: [0, 0, 1, 1] });
  const back = angle.interpolate({ inputRange: [-180, -90, -89.99, 0], outputRange: [1, 1, 0, 0] });
  const shade = angle.interpolate({ inputRange: [-180, -90, 0], outputRange: [0, 0.35, 0], extrapolate: 'clamp' });
  const persp = W * 6;
  const sideLeft = (side: 'left' | 'right') => (side === 'left' ? spineX - W : spineX);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="preview-page-turn">
      {plan.patch && <View style={[styles.layerFace, { left: sideLeft(plan.patch.side), width: W, height: H }]}>{face(plan.patch.face)}</View>}
      <Animated.View style={[styles.layerFace, { left: spineX, width: W, height: H, opacity: front, transformOrigin: 'left center', transform: [{ perspective: persp }, { rotateY: rotate }] }]}>
        {face(plan.leaf.front)}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
      </Animated.View>
      {plan.leaf.back && (
        <Animated.View style={[styles.layerFace, { left: spineX, width: W, height: H, opacity: back, transformOrigin: 'left center', transform: [{ perspective: persp }, { rotateY: rotate }, { translateX: W }, { rotateY: '180deg' }] }]}>
          {face(plan.leaf.back)}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
        </Animated.View>
      )}
    </View>
  );
}

export default function Preview() {
  const { builder, platform, text } = useBuilder();
  const { session } = useAuth();
  const { clear: clearDraft } = useDraft();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const focused = useIsFocused();
  const once = useOncePerVisit();
  const pages = builder.albumPages;
  const total = pages.length;
  const [openBook, setOpenBook] = useState(false);
  const view: PreviewView = openBook ? 'spread' : 'page';
  const index = Math.min(builder.currentPageIndex, Math.max(0, total - 1));
  const [coverAt, setCoverAt] = useState<number | null>(() => (index === 0 ? 0 : null));
  const onCover = coverAt === index;
  const pos: PreviewPosition = { view, index, total, onCover, hasCover: true };
  const [turn, setTurn] = useState<{ plan: TurnPlan; n: number } | null>(null);
  const seq = useRef(0);
  const [notDrawn, setNotDrawn] = useState<Record<string, string[]>>({});

  // On the phone now (the builder's own write, not its 30 s timer); signed
  // in, a newly made album goes to the account once (accountSave.ts).
  const signedIn = !!session;
  const madeAt = pages[0]?.madeAt ?? 0;
  useEffect(() => {
    builder.saveDraftNow();
    if (!signedIn || total === 0) return;
    const albumId = builder.getAlbumId();
    if (!accountSaveDue(platform.deviceStore, albumId, madeAt)) return;
    void builder.manualSave().then((ok) => { if (ok) markAccountSaved(platform.deviceStore, albumId, madeAt); }).catch(() => {});
    // Once per album made (madeAt), and when the customer signs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, madeAt]);
  // Made again (from the Photos step): the book opens on its cover again.
  const firstMade = useRef(madeAt);
  useEffect(() => {
    if (madeAt !== firstMade.current) { firstMade.current = madeAt; setCoverAt(0); }
  }, [madeAt]);
  // The decoded photos go when the book is left (they are a few MB each).
  useEffect(() => () => forgetPhotoPictures(), []);
  const [asking, setAsking] = useState(false);
  const answer = async (fn: () => Promise<unknown> | void, after?: () => void) => {
    if (asking) return;
    setAsking(true);
    try { await fn(); after?.(); } finally { setAsking(false); }
  };
  const missing = missingPhotos(pages, builder.uploadedPhotos, builder.coverFront);

  // Sizes: one page (upright) or two side by side, fitted to the screen.
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const aspect = size.width / size.height;
  const availW = screenW - space.md * 2;
  const availH = screenH - 300;
  const singleW = Math.floor(Math.min(view === 'page' || onCover ? availW : availW / 2, availH * aspect));
  const H = Math.round(singleW / aspect);

  // A turn shows its leaf's pages at once: they are drawn first (usually
  // already, ahead of time below), at most TURN_WAIT_MS, then the book turns.
  const turning = useRef(false);
  const go = async (t: Turn | null) => {
    if (!t || turning.current) return;
    const plan = planTurn(pos, t);
    if (plan && text) {
      turning.current = true;
      const faces = [plan.leaf.front, plan.leaf.back, plan.patch?.face].filter((f): f is TurnFace => !!f);
      const reqs = faces.map((f) => faceRequest(f, faceProps)).filter((r): r is PageRequest => !!r);
      await Promise.race([Promise.all(reqs.map((r) => preparePagePicture(text, r))), new Promise((r) => setTimeout(r, TURN_WAIT_MS))]);
      turning.current = false;
    }
    if (t.cover) setCoverAt(index);
    else {
      setCoverAt(null);
      if (t.index !== index) builder.goToPage(t.index);
    }
    setTurn(plan ? { plan, n: ++seq.current } : null);
  };
  const back = () => { void go(turnBack(pos)); };
  const forward = () => { void go(turnForward(pos)); };
  const goRef = useRef({ back, forward });
  goRef.current = { back, forward };
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => {
      const s = swipeTurn(g.dx, g.dy);
      if (s === 'forward') goRef.current.forward();
      else if (s === 'back') goRef.current.back();
    },
  }), []);

  const faceProps = { W: singleW, H, pages, cover: builder.coverFront, photos: builder.uploadedPhotos, albumSize: builder.albumSize, text };

  // The pages a turn either way would show, drawn ahead of time (after the
  // ones on screen: pictures are drawn one at a time, in the order asked).
  useEffect(() => {
    // Not while another screen is on top (the editor): nothing is drawn ahead for a book no one sees.
    if (!text || total === 0 || !focused) return;
    const ahead: TurnFace[] = [];
    if (onCover) ahead.push({ kind: 'page', index });
    else if (view === 'page') ahead.push({ kind: 'page', index: index + 1 }, { kind: 'page', index: index - 1 });
    else { const st = spreadStart(index); ahead.push({ kind: 'page', index: st + 2 }, { kind: 'page', index: st + 3 }, { kind: 'page', index: st - 1 }, { kind: 'page', index: st - 2 }); }
    if (index <= 1) ahead.push({ kind: 'cover' });
    for (const f of ahead) {
      const r = f.kind === 'page' && (f.index < 0 || f.index >= total) ? null : faceRequest(f, faceProps);
      if (r) void preparePagePicture(text, r);
    }
    // faceProps changes with the album; the pages' keys cover it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, index, view, onCover, total, singleW, pages, builder.coverFront, focused]);
  // A quick double tap opens one editor, not two (useOncePerVisit).
  const editPages = once(() => {
    setCoverAt(null);
    builder.goToPage(index);
    router.push('/edit-pages');
  });
  const editCover = once(() => router.push(COVER_ROUTE));
  const noteNotDrawn = (key: string, list: string[]) => setNotDrawn((m) => (m[key]?.join('|') === list.join('|') ? m : { ...m, [key]: list }));
  const face = (f: TurnFace) => <Face face={f} {...faceProps} />;

  // What shows now.
  const s = spreadStart(index);
  const layout: TurnPlan['layout'] = onCover ? 'closed' : view === 'page' ? 'page' : 'spread';
  const bookW = layout === 'spread' ? singleW * 2 : singleW;
  const turnNow = turn && turn.plan.layout === layout ? turn : null;
  const shownKeys = onCover ? ['cover'] : view === 'page' ? [`p${index}`] : [`p${s}`, `p${s + 1}`];
  const missingHere = [...new Set(shownKeys.flatMap((k) => notDrawn[k] ?? []))];
  const end = atAlbumEnd(pos);
  const word = view === 'page' ? 'page' : 'pages';

  if (total === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.caption}>No pages yet.</Text>
        <Button label="Make my album" onPress={() => router.replace('/album-cover')} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.counter} testID="preview-counter">{previewCounter(pos)}</Text>
        <View style={[styles.stage, { width: bookW, height: H }]} {...swipe.panHandlers} testID="preview-book">
          {layout === 'closed' && <Face face={{ kind: 'cover' }} {...faceProps} onNotDrawn={noteNotDrawn} />}
          {layout === 'page' && <Face face={{ kind: 'page', index }} {...faceProps} onNotDrawn={noteNotDrawn} />}
          {layout === 'spread' && (
            <View style={styles.spread}>
              <Face face={s >= 0 ? { kind: 'page', index: s } : { kind: 'inside', cover: 'front' }} {...faceProps} onNotDrawn={noteNotDrawn} />
              <Face face={s + 1 < total ? { kind: 'page', index: s + 1 } : { kind: 'inside', cover: 'back' }} {...faceProps} onNotDrawn={noteNotDrawn} />
              <View pointerEvents="none" style={[styles.gutter, { left: singleW - 6, height: H }]} />
            </View>
          )}
          {turnNow && (
            <TurnLayer key={turnNow.n} plan={turnNow.plan} W={singleW} H={H} spineX={layout === 'spread' ? singleW : 0} face={face}
              onDone={() => setTurn((t) => (t && t.n === turnNow.n ? null : t))} />
          )}
        </View>
        <Text style={styles.caption} testID="preview-caption">{previewCaption(pos)}</Text>
        <View style={styles.toggleRow}>
          {!onCover && (
            <Pressable accessibilityRole="button" onPress={() => setOpenBook((v) => !v)} style={styles.toggle} testID="preview-open-book">
              <Text style={styles.toggleText}>{openBook ? 'One page at a time' : 'See it as an open book'}</Text>
            </Pressable>
          )}
          {/* The website's "‹ Edit pages": the editor on the page shown (page 1
              from the cover); "Back to preview" there comes back to it. */}
          <Pressable accessibilityRole="button" onPress={editPages} style={styles.toggle} testID="preview-edit-pages">
            <Text style={styles.toggleText}>{EDIT_PAGES}</Text>
          </Pressable>
          {/* The website's "Edit cover", beside the closed book. */}
          {onCover && (
            <Pressable accessibilityRole="button" onPress={editCover} style={styles.toggle} testID="preview-edit-cover">
              <Text style={styles.toggleText}>{EDIT_COVER}</Text>
            </Pressable>
          )}
        </View>
        {missingHere.length > 0 && (
          <Text style={styles.notDrawn} testID="preview-not-drawn">{NOT_DRAWN_LINE}</Text>
        )}
        {missing.count > 0 && (
          <View style={styles.ask} testID="preview-missing-photos">
            <Text style={styles.askText}>{missingOnPhoneMessage(missing)}</Text>
            <Button label="Add the photos" kind="plain" onPress={() => router.push('/photos')} testID="preview-missing-add" />
          </View>
        )}
        {signedIn && builder.cloudGone ? (
          <View style={styles.ask} testID="preview-deleted-elsewhere">
            <Text style={styles.askText}>{DELETED_ELSEWHERE_MESSAGE}</Text>
            <Button label="Keep it as a new album" busy={asking} onPress={() => { void answer(builder.saveAsNewAlbum); }} testID="preview-keep-new" />
            <Button label="Let it go" kind="plain" onPress={() => { void answer(builder.letDeletedAlbumGo, () => { clearDraft(); router.dismissAll(); }); }} testID="preview-let-go" />
          </View>
        ) : signedIn && builder.cloudConflict ? (
          <View style={styles.ask} testID="preview-conflict">
            <Text style={styles.askText}>{conflictMessage(builder.cloudConflict.updatedAt)}</Text>
            <Button label="Open the other device's version" busy={asking} onPress={() => { void answer(builder.openNewerVersion); }} testID="preview-open-other" />
            <Button label="Keep this device's version" kind="plain" onPress={() => { void answer(builder.keepThisVersion); }} testID="preview-keep-this" />
          </View>
        ) : (
          <Text style={styles.saved} testID="preview-saved">
            {!signedIn ? 'Saved on this phone. Sign in to keep it in your account too.'
              : builder.cloudSaveStatus === 'saving' ? 'Saved on this phone. Saving to your account…'
                : builder.cloudSaveStatus === 'error' ? 'Saved on this phone. It could not be saved to your account just now: it will try again.'
                  : builder.cloudSaveStatus === 'saved' ? 'Saved on this phone and in your account.'
                    : 'Saved on this phone. Changes go to your account by themselves.'}
          </Text>
        )}
        {end && <Text style={styles.endNote}>Ordering from the app comes in a later version. Your album stays saved.</Text>}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={styles.turnRow}>
          {canTurnBack(pos) && <Button label={`‹ Previous ${word}`} kind="plain" onPress={back} style={styles.turnButton} testID="preview-prev" />}
          {canTurnForward(pos)
            ? <Button label={`Next ${word} ›`} onPress={forward} style={styles.turnButton} testID="preview-next" />
            : <Button label="Done" onPress={() => { if (router.canDismiss()) router.dismissAll(); else router.replace('/'); }} style={styles.turnButton} testID="preview-done" />}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#EFE9E1' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.background },
  body: { alignItems: 'center', padding: space.md, gap: space.sm },
  counter: { fontSize: 14, fontWeight: '600', color: colors.muted, alignSelf: 'flex-end' },
  stage: { backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  spread: { flexDirection: 'row' },
  gutter: { position: 'absolute', top: 0, width: 12, backgroundColor: 'rgba(60,40,20,0.10)' },
  face: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inside: { backgroundColor: '#FFFFFF' },
  insideText: { fontSize: 12, color: '#B9A992', textAlign: 'center', padding: space.sm },
  layerFace: { position: 'absolute', top: 0, overflow: 'hidden', backgroundColor: '#FFFFFF', backfaceVisibility: 'hidden' },
  caption: { fontSize: 14, fontWeight: '600', color: colors.muted },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  toggle: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 8 },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.text },
  notDrawn: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: space.md },
  saved: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  ask: { alignSelf: 'stretch', gap: space.sm, backgroundColor: '#FFF1EA', borderWidth: 1, borderColor: '#EBC3AE', borderRadius: 12, padding: space.md },
  askText: { fontSize: 15, lineHeight: 21, color: '#7A3A1E' },
  endNote: { fontSize: 14, color: colors.text, textAlign: 'center', paddingHorizontal: space.md },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
  turnRow: { flexDirection: 'row', gap: space.sm },
  turnButton: { flex: 1 },
});
