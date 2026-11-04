/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW: the album as a book, the website's way (BuilderPreview, its
   words), its rules shared: where a turn goes (previewPaging.ts) and what a
   turning leaf shows (pageTurn.ts planTurn).

   It opens on the closed book's front cover. "Next page" opens it on page 1;
   an upright phone shows one page at a time, and "See it as an open book"
   shows two facing pages, as they print: page 1 on the right across from the
   inside of the front cover, then 2 | 3, 4 | 5… A swipe turns the page too.
   Each turn plays the website's page turn (the leaf hinged at the spine).

   The Preview is the one screen that turns with the phone (owner, 2026-11;
   src/lib/screenTurning.ts), as the website's open book shows when the phone
   is really turned: on its side, the open book fills the screen (no header,
   no status bar), with round turn buttons beside it or under it; upright,
   the book is as wide as the screen. The sizes are src/builder/previewLayout.ts.

   At the album's end, "Order this album" (the website's turn bar) runs the
   website's checks (lib/checkout/orderStart.ts: 40 photos, photos on this
   phone, a blank cover and the rest, said once with "Order anyway"), saves
   the album to the account when signed in, and opens checkout on it.

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
import { router, Stack, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { conflictMessage, DELETED_ELSEWHERE_MESSAGE } from '@web/lib/albumSyncRecord';
import { missingPhotos } from '@web/lib/photoPresence';
import { canTurnBack, canTurnForward, previewCaption, previewCounter, swipeTurn, turnBack, turnForward, spreadStart, type PreviewPosition, type PreviewView, type Turn } from '@web/pages/builder/previewPaging';
import { planTurn, type TurnFace, type TurnPlan } from '@web/pages/builder/pageTurn';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { markAccountSaved } from '../builder/accountSave';
import { missingOnPhoneMessage, NOT_DRAWN_LINE, PAGE_NOT_SHOWN } from '../builder/screenWords';
import { forgetPhotoPictures, preparePagePicture, PRIORITY, usePagePicture } from '../builder/usePagePicture';
import { useJustArrived, useOncePerVisit } from '../lib/useOncePerVisit';
import { orderCheck, orderSaveError, type OrderCheck } from '../lib/checkout/orderStart';
import { screenCanTurn, useTurnsWithThePhone } from '../lib/screenTurning';
import { BOARD, BOOK_DRESS_Y, isSideways, pagePictureWidth, sidewaysBook, uprightBook, UPRIGHT_CHROME_GUESS, UPRIGHT_EDGE, type Box } from '../builder/previewLayout';
import { BookUnder, bookSides, SpineShade, TURN_LOOK } from '../builder/bookLook';
import { dragAngle, dragKeeps, dragProgress, dragReach, dragTurns, DRAG_SETTLE_MIN_MS } from '../builder/pageDrag';
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
  /** Its size on screen, points. */
  W: number;
  H: number;
  /** The width its picture is drawn at, px: the same both ways up (previewLayout pagePictureWidth). */
  px: number;
  pages: AlbumPage[];
  cover: AlbumPage;
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  text: PageText | null;
  onNotDrawn?: (key: string, list: string[]) => void;
}

/** What a face draws: a page or the cover (the inside of a cover is plain). */
function faceRequest(face: TurnFace, { px, pages, cover, photos, albumSize }: Pick<FaceProps, 'px' | 'pages' | 'cover' | 'photos' | 'albumSize'>): PageRequest | null {
  if (face.kind === 'page' && pages[face.index]) return { page: pages[face.index], pageIndex: face.index, albumSize, photos, width: px };
  if (face.kind === 'cover') return { page: cover, pageIndex: 0, albumSize, photos, width: px, coverMode: true };
  return null;
}

/** One side of a leaf: a page as it prints, the front cover, or the inside of a cover.
 *  Drawn only while the Preview is the screen on top: under "Edit pages" or
 *  the cover editor it keeps its last picture and asks for no new one, so
 *  every edit there draws the page once, for the screen the customer sees. */
function Face({ face, W, H, px, pages, cover, photos, albumSize, text, onNotDrawn }: FaceProps) {
  const focused = useIsFocused();
  const req = focused ? faceRequest(face, { px, pages, cover, photos, albumSize }) : null;
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
function TurnLayer({ plan, W, H, spineX, face, onDone, drive }: {
  plan: TurnPlan; W: number; H: number; spineX: number; face: (f: TurnFace) => ReactNode; onDone: () => void;
  /** A finger turning the page (pageDrag.ts): the leaf's angle is its, and it plays nothing itself. */
  drive?: Animated.Value;
}) {
  const own = useRef(new Animated.Value(plan.leaf.from)).current;
  const angle = drive ?? own;
  // The screen re-renders during a turn (a page finishing drawing): the turn
  // carries on; only its own end (finished) ends it.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (drive) return undefined;
    const anim = Animated.timing(own, { toValue: plan.leaf.to, duration: plan.ms, easing: EASE, useNativeDriver: true });
    anim.start(({ finished }) => { if (finished) done.current(); });
    return () => anim.stop();
  }, [own, plan, drive]);
  const rotate = angle.interpolate({ inputRange: [-180, 0], outputRange: ['-180deg', '0deg'], extrapolate: 'extend' });
  const front = angle.interpolate({ inputRange: [-180, -90.01, -90, 0], outputRange: [0, 0, 1, 1] });
  const back = angle.interpolate({ inputRange: [-180, -90, -89.99, 0], outputRange: [1, 1, 0, 0] });
  const shade = angle.interpolate({ inputRange: [-180, -90, 0], outputRange: [0, 0.35, 0], extrapolate: 'clamp' });
  // The book look (owner, 2026-11-03: "page flips looking realistic"): the
  // lifted leaf bends like paper (darker at the spine, light where it curves,
  // its edge a little darker), most while it stands up; and it throws a
  // shadow that moves with its free edge over the page it uncovers or is
  // about to cover.
  const lift = angle.interpolate({ inputRange: [-180, -90, 0], outputRange: [0, 1, 0], extrapolate: 'clamp' });
  const edgeX = angle.interpolate({ inputRange: TURN_LOOK.angles, outputRange: TURN_LOOK.angles.map((a) => W * Math.cos((a * Math.PI) / 180)), extrapolate: 'clamp' });
  const band = Math.round(W * TURN_LOOK.band);
  const onRight = angle.interpolate({ inputRange: [-180, -90.01, -90, -45, 0], outputRange: [0, 0, 0.9, 0.7, 0], extrapolate: 'clamp' });
  const onLeft = angle.interpolate({ inputRange: [-180, -135, -90, -89.99, 0], outputRange: [0, 0.7, 0.9, 0, 0], extrapolate: 'clamp' });
  const leftBandX = Animated.add(edgeX, W - band);
  const castLeft = plan.layout === 'spread' && !plan.hideLeft;
  const persp = W * 6;
  const sideLeft = (side: 'left' | 'right') => (side === 'left' ? spineX - W : spineX);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="preview-page-turn">
      {plan.patch && <View style={[styles.layerFace, { left: sideLeft(plan.patch.side), width: W, height: H }]}>{face(plan.patch.face)}</View>}
      <View style={[styles.castClip, { left: spineX, width: W, height: H }]} testID="preview-turn-cast-right">
        <Animated.View style={[styles.cast, { width: band, height: H, backgroundImage: TURN_LOOK.castRight, opacity: onRight, transform: [{ translateX: edgeX }] }]} />
      </View>
      {castLeft && (
        <View style={[styles.castClip, { left: spineX - W, width: W, height: H }]} testID="preview-turn-cast-left">
          <Animated.View style={[styles.cast, { width: band, height: H, backgroundImage: TURN_LOOK.castLeft, opacity: onLeft, transform: [{ translateX: leftBandX }] }]} />
        </View>
      )}
      <Animated.View style={[styles.layerFace, { left: spineX, width: W, height: H, opacity: front, transformOrigin: 'left center', transform: [{ perspective: persp }, { rotateY: rotate }] }]}>
        {face(plan.leaf.front)}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundImage: TURN_LOOK.leafFront, opacity: lift }]} testID="preview-turn-bend" />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
      </Animated.View>
      {plan.leaf.back && (
        <Animated.View style={[styles.layerFace, { left: spineX, width: W, height: H, opacity: back, transformOrigin: 'left center', transform: [{ perspective: persp }, { rotateY: rotate }, { translateX: W }, { rotateY: '180deg' }] }]}>
          {face(plan.leaf.back)}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundImage: TURN_LOOK.leafBack, opacity: lift }]} />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
        </Animated.View>
      )}
    </View>
  );
}


/** A round turn button beside (or under) the book on its side: ‹ back, ›
 *  forward (filled terracotta: the way forward), or Done at the album's end.
 *  Its words are the portrait bar's ("Next pages"), for TalkBack. */
function TurnButton({ box, label, mark, main, onPress, testID }: { box: Box; label: string; mark: string; main: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [styles.round, main ? styles.roundMain : styles.roundPlain, pressed && styles.pressed,
        { left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.w / 2 }]}
    >
      <Text style={[mark.length > 1 ? styles.roundWord : styles.roundMark, main ? styles.roundMainText : styles.roundPlainText]}>{mark}</Text>
    </Pressable>
  );
}

/** "Edit pages" on its side: a plain button in its place (previewLayout
 *  edit), the words on two lines in the narrow strip beside the book. */
function EditButton({ box, label, twoLines, onPress, testID }: { box: Box; label: string; twoLines: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.sideEdit, pressed && styles.pressed, { left: box.x, top: box.y, width: box.w, height: box.h }]}
    >
      <Text style={styles.sideEditText} numberOfLines={2}>{twoLines ? label.replace(' ', '\n') : label}</Text>
    </Pressable>
  );
}

export default function Preview() {
  const { builder, platform, text } = useBuilder();
  const { session } = useAuth();
  const { clear: clearDraft } = useDraft();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  // The one screen that turns with the phone, while it is on top.
  useTurnsWithThePhone('preview', focused);
  const sideways = isSideways(screenW, screenH);
  const once = useOncePerVisit();
  const pages = builder.albumPages;
  const total = pages.length;
  const [openBook, setOpenBook] = useState(false);
  // An app built before screen turning (an older APK) does not offer it.
  const [canTurn] = useState(screenCanTurn);
  // On its side the book is open (the website's way: the open book shows
  // when the phone is really turned); upright, on "See it as an open book".
  const view: PreviewView = sideways || openBook ? 'spread' : 'page';
  const index = Math.min(builder.currentPageIndex, Math.max(0, total - 1));
  const [coverAt, setCoverAt] = useState<number | null>(() => (index === 0 ? 0 : null));
  const onCover = coverAt === index;
  const pos: PreviewPosition = { view, index, total, onCover, hasCover: true };
  const [turn, setTurn] = useState<{ plan: TurnPlan; n: number; drive?: Animated.Value } | null>(null);
  const seq = useRef(0);
  const [notDrawn, setNotDrawn] = useState<Record<string, string[]>>({});

  // On the phone now (the builder's own write, not its 30 s timer). Signed
  // in, a newly made album goes to the account once: for the whole app, on
  // any screen (accountSave.ts useAccountSave, in BuilderProvider).
  const signedIn = !!session;
  const madeAt = pages[0]?.madeAt ?? 0;
  useEffect(() => {
    builder.saveDraftNow();
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

  // Sizes (previewLayout.ts): on its side, the open book filling the safe
  // area; upright, as wide as the screen and as tall as the scrolling area
  // allows (measured: viewH; a guess for the first moment).
  const size = ALBUM_SIZES.find((s) => s.preset === builder.albumSize) ?? ALBUM_SIZES[1];
  const aspect = size.width / size.height;
  const layout: TurnPlan['layout'] = onCover ? 'closed' : view === 'page' ? 'page' : 'spread';
  const [viewH, setViewH] = useState<number | null>(null);
  const side = sideways ? sidewaysBook({ screenW, screenH, insets, aspect }) : null;
  const { pageW: singleW, pageH: H } = side ?? uprightBook({ screenW, viewH: viewH ?? screenH - UPRIGHT_CHROME_GUESS, aspect, shows: layout });
  // The pictures: one size both ways up, so turning the phone draws no page again.
  const px = pagePictureWidth({ screenW, screenH, aspect, pixelRatio: PixelRatio.get() });

  // A turn shows its leaf's pages at once: they are drawn first (usually
  // already, ahead of time below), at most TURN_WAIT_MS, then the book turns.
  const turning = useRef(false);
  // A page a finger is turning (pageDrag.ts): the book is already where the
  // turn goes; let go short of a swipe, `undo` puts it back.
  type Where = { pos: PreviewPosition; coverAt: number | null };
  const drag = useRef<{ n: number; plan: TurnPlan; angle: Animated.Value; dir: 'forward' | 'back'; reach: number; before: Where; undo: () => void; back: Animated.CompositeAnimation | null } | null>(null);
  /** A page going back down after a finger let it go: the book is put back
   *  now, and where it is, is where it was (the screen hasn't caught up). */
  const settleDrag = (): Where => {
    const d = drag.current;
    drag.current = null;
    if (d?.back) {
      d.back.stop();
      d.undo();
      return d.before;
    }
    return { pos, coverAt };
  };
  const go = async (t: Turn | null, from: PreviewPosition) => {
    if (!t || turning.current) return;
    const plan = planTurn(from, t);
    if (plan && text) {
      turning.current = true;
      const faces = [plan.leaf.front, plan.leaf.back, plan.patch?.face].filter((f): f is TurnFace => !!f);
      const reqs = faces.map((f) => faceRequest(f, faceProps)).filter((r): r is PageRequest => !!r);
      await Promise.race([Promise.all(reqs.map((r) => preparePagePicture(text, r))), new Promise((r) => setTimeout(r, TURN_WAIT_MS))]);
      turning.current = false;
    }
    if (t.cover) setCoverAt(from.index);
    else {
      setCoverAt(null);
      if (t.index !== from.index) builder.goToPage(t.index);
    }
    setTurn(plan ? { plan, n: ++seq.current } : null);
  };
  const back = () => { const from = settleDrag().pos; void go(turnBack(from), from); };
  const forward = () => { const from = settleDrag().pos; void go(turnForward(from), from); };
  // "Next page" is where "Make my album" was: the second tap of a double tap
  // on it opened the album at page 1, not the cover (useJustArrived).
  const justArrived = useJustArrived();
  const nextPage = () => { if (!justArrived()) forward(); };

  // A finger on a page turns it as it moves (owner, 2026-11-03: the page
  // follows the finger). The cover still turns on a swipe, as before.
  const startDrag = (dir: 'forward' | 'back'): boolean => {
    const before = settleDrag();
    const from = before.pos;
    if (turning.current) return false;
    const t = dir === 'forward' ? turnForward(from) : turnBack(from);
    // To the cover: a swipe, as before.
    if (!t || t.cover) return false;
    const plan = planTurn(from, t);
    if (!plan || !dragTurns(plan, from.onCover, false)) return false;
    setCoverAt(null);
    if (t.index !== from.index) builder.goToPage(t.index);
    const angle = new Animated.Value(plan.leaf.from);
    const n = ++seq.current;
    drag.current = {
      n, plan, angle, dir, before, back: null,
      reach: dragReach(plan.layout, singleW),
      undo: () => { setCoverAt(before.coverAt); if (before.pos.index !== t.index) builder.goToPage(before.pos.index); },
    };
    setTurn({ plan, n, drive: angle });
    return true;
  };
  const moveDrag = (dx: number) => {
    const d = drag.current;
    if (d && !d.back) d.angle.setValue(dragAngle(d.plan, d.dir, dx, d.reach));
  };
  const endDrag = (dx: number, dy: number, vx: number) => {
    const d = drag.current;
    if (!d || d.back) return;
    const progress = dragProgress(d.dir, dx, d.reach);
    const keep = dragKeeps(d.dir, dx, dy, vx, progress);
    const toValue = keep ? d.plan.leaf.to : d.plan.leaf.from;
    const ms = Math.max(DRAG_SETTLE_MIN_MS, Math.round(d.plan.ms * (keep ? 1 - progress : progress)));
    const anim = Animated.timing(d.angle, { toValue, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const end = () => setTurn((cur) => (cur && cur.n === d.n ? null : cur));
    if (keep) {
      drag.current = null;
      anim.start(({ finished }) => { if (finished) end(); });
    } else {
      d.back = anim;
      anim.start(({ finished }) => {
        if (!finished || drag.current !== d) return;
        drag.current = null;
        d.undo();
        end();
      });
    }
  };
  const goRef = useRef({ back, forward, startDrag, moveDrag, endDrag });
  goRef.current = { back, forward, startDrag, moveDrag, endDrag };
  const swipe = useMemo(() => {
    let dragging = false;
    let tried = false;
    const release = (dx: number, dy: number, vx: number) => {
      if (dragging) goRef.current.endDrag(dx, dy, vx);
      else {
        const s = swipeTurn(dx, dy);
        if (s === 'forward') goRef.current.forward();
        else if (s === 'back') goRef.current.back();
      }
      dragging = false;
      tried = false;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { dragging = false; tried = false; },
      onPanResponderMove: (_e, g) => {
        if (!tried && g.dx !== 0) {
          tried = true;
          dragging = goRef.current.startDrag(g.dx < 0 ? 'forward' : 'back');
        }
        if (dragging) goRef.current.moveDrag(g.dx);
      },
      onPanResponderRelease: (_e, g) => release(g.dx, g.dy, g.vx),
      // Taken away (the screen scrolling): the page goes back.
      onPanResponderTerminate: () => release(0, 0, 0),
    });
  }, []);

  const faceProps = { W: singleW, H, px, pages, cover: builder.coverFront, photos: builder.uploadedPhotos, albumSize: builder.albumSize, text };

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
  }, [text, index, view, onCover, total, px, pages, builder.coverFront, focused]);
  // A quick double tap opens one editor, not two (useOncePerVisit).
  const editPages = once(() => {
    setCoverAt(null);
    builder.goToPage(index);
    router.push('/edit-pages');
  });
  const editCover = once(() => router.push(COVER_ROUTE));

  // "Order this album" (orderStart.ts): the website's checks, then the save
  // to the account (signed in), then checkout on this album.
  const [orderAsk, setOrderAsk] = useState<Exclude<OrderCheck, { kind: 'go' }> | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const orderingRef = useRef(false);
  const order = async (anyway = false) => {
    if (orderingRef.current) return;
    const r = orderCheck({ pages, photos: builder.uploadedPhotos, coverFront: builder.coverFront, albumSize: builder.albumSize, measurer: platform.textMeasurer() }, { anyway });
    setOrderError(null);
    if (r.kind !== 'go') { setOrderAsk(r); return; }
    setOrderAsk(null);
    const albumId = builder.getAlbumId();
    if (signedIn) {
      // Checkout orders the account's copy: it must be this one, saved now.
      orderingRef.current = true;
      setOrdering(true);
      const saved = await builder.manualSave().catch(() => false);
      orderingRef.current = false;
      setOrdering(false);
      if (!saved) { setOrderError(orderSaveError(!!builder.getCloudConflict())); return; }
      markAccountSaved(platform.deviceStore, albumId, madeAt);
    }
    router.push({ pathname: '/order', params: albumId ? { albumId } : {} });
  };
  // "Show me" / "Back to my pages": the cover editor, or the pages at the first one to fix.
  const showOrderFix = () => {
    const ask = orderAsk;
    setOrderAsk(null);
    if (ask?.kind === 'warn' && ask.coverFirst) { router.push(COVER_ROUTE); return; }
    setCoverAt(null);
    if (ask?.kind === 'warn' && ask.firstPage != null) builder.goToPage(ask.firstPage);
    else builder.goToPage(index);
    router.push('/edit-pages');
  };
  // Upright, the answer comes under the page buttons, below the screen: the
  // tap looked dead until the page was scrolled (beta round 3). It is
  // scrolled into view (on its side it has its own room).
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (orderAsk || orderError) scrollRef.current?.scrollToEnd({ animated: true });
  }, [orderAsk, orderError]);
  const orderAskBox = (orderAsk || orderError) && (
    <View style={styles.ask} testID="preview-order-ask-box">
      <Text style={styles.askText} testID={orderError ? 'preview-order-error' : 'preview-order-ask'}>{orderError ?? orderAsk?.message}</Text>
      {orderAsk?.kind === 'warn' && (
        <>
          <Button label="Order anyway" onPress={() => { void order(true); }} testID="preview-order-anyway" />
          <Button label="Show me" kind="plain" onPress={showOrderFix} testID="preview-order-show" />
        </>
      )}
      {orderAsk?.kind === 'tooFew' && <Button label="Back to my pages" kind="plain" onPress={showOrderFix} testID="preview-order-back-to-pages" />}
      {orderAsk?.kind === 'missing' && <Button label="Add the photos" kind="plain" onPress={() => { setOrderAsk(null); router.push('/photos'); }} testID="preview-order-add-photos" />}
      {orderError && <Button label="Close" kind="plain" onPress={() => setOrderError(null)} testID="preview-order-error-close" />}
    </View>
  );
  const orderLabel = ordering ? 'Saving your album…' : 'Order this album';
  const noteNotDrawn = (key: string, list: string[]) => setNotDrawn((m) => (m[key]?.join('|') === list.join('|') ? m : { ...m, [key]: list }));
  const face = (f: TurnFace) => <Face face={f} {...faceProps} />;

  // What shows now.
  const s = spreadStart(index);
  const bookW = layout === 'spread' ? singleW * 2 : singleW;
  const turnNow = turn && turn.plan.layout === layout ? turn : null;
  // On its side the closed book is one page of the open book, in the middle:
  // opening or closing slides the book there (the website's bookSlide,
  // planTurn's shift), and while the cover opens the left side is still
  // empty until the cover lands on it (hideLeft). Upright, the closed cover
  // is drawn bigger than the open book's pages, so nothing slides.
  const slide = useRef(new Animated.Value(0)).current;
  const slideTurn = side && turnNow ? turnNow : null;
  const hideLeft = !!slideTurn?.plan.hideLeft;
  useLayoutEffect(() => {
    const plan = slideTurn?.plan;
    if (!plan || (plan.shift[0] === 0 && plan.shift[1] === 0)) { slide.setValue(0); return undefined; }
    slide.setValue(plan.shift[0] * singleW);
    const anim = Animated.timing(slide, { toValue: plan.shift[1] * singleW, duration: plan.ms, easing: EASE, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // One slide per turn (its number); the page size is the same through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideTurn?.n]);
  const shownKeys = onCover ? ['cover'] : view === 'page' ? [`p${index}`] : [`p${s}`, `p${s + 1}`];
  const missingHere = [...new Set(shownKeys.flatMap((k) => notDrawn[k] ?? []))];
  const word = view === 'page' ? 'page' : 'pages';

  if (total === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.caption}>No pages yet.</Text>
        <Button label="Make my album" onPress={() => router.replace('/album-cover')} />
      </View>
    );
  }

  // On its side the book fills the screen: no header, no status bar.
  const chrome = (
    <>
      <Stack.Screen options={{ headerShown: !sideways }} />
      {sideways && focused && <StatusBar hidden />}
    </>
  );
  // The book look (bookLook.tsx): the cover board and page edges under the
  // pages, the bend into the spine over them.
  const sides = bookSides({ shows: layout, index, start: s, total });
  const book = (
    <View style={[styles.stage, layout === 'closed' && styles.stageClosed, hideLeft && styles.stageOpening, !side && styles.stageUpright, { width: bookW, height: H }]} {...swipe.panHandlers} testID="preview-book">
      {!hideLeft && <BookUnder shows={layout} W={singleW} H={H} sides={sides} />}
      {layout === 'closed' && <Face face={{ kind: 'cover' }} {...faceProps} onNotDrawn={noteNotDrawn} />}
      {layout === 'page' && <Face face={{ kind: 'page', index }} {...faceProps} onNotDrawn={noteNotDrawn} />}
      {layout === 'spread' && (
        <View style={styles.spread}>
          <View style={hideLeft ? styles.notYet : null} testID="preview-left-side">
            <Face face={s >= 0 ? { kind: 'page', index: s } : { kind: 'inside', cover: 'front' }} {...faceProps} onNotDrawn={noteNotDrawn} />
          </View>
          <Face face={s + 1 < total ? { kind: 'page', index: s + 1 } : { kind: 'inside', cover: 'back' }} {...faceProps} onNotDrawn={noteNotDrawn} />
        </View>
      )}
      {!hideLeft && <SpineShade shows={layout} W={singleW} H={H} sides={sides} />}
      {turnNow && (
        <TurnLayer key={turnNow.n} plan={turnNow.plan} W={singleW} H={H} spineX={layout === 'spread' ? singleW : 0} face={face} drive={turnNow.drive}
          onDone={() => setTurn((t) => (t && t.n === turnNow.n ? null : t))} />
      )}
    </View>
  );

  // ON ITS SIDE: the open book (or the closed cover, one page of it) where
  // previewLayout puts it, the turn buttons beside or under it, the count.
  // Everything else waits until the phone is upright again.
  if (side) {
    const at = layout === 'spread' ? side.spread : side.closed;
    const c = side.counter;
    return (
      <View style={styles.sideways} testID="preview-sideways">
        {chrome}
        <Animated.View style={[styles.place, { left: at.x, top: at.y, transform: [{ translateX: slide }] }]} testID="preview-book-place">{book}</Animated.View>
        {/* The way into the editor, on its side too: "Edit cover" on the cover. */}
        <EditButton box={side.edit} label={onCover ? EDIT_COVER : EDIT_PAGES} twoLines={side.controls === 'sides'}
          onPress={onCover ? editCover : editPages} testID={onCover ? 'preview-edit-cover' : 'preview-edit-pages'} />
        {canTurnBack(pos) && <TurnButton box={side.back} label={`Previous ${word}`} mark="‹" main={false} onPress={back} testID="preview-prev" />}
        {canTurnForward(pos)
          ? <TurnButton box={side.forward} label={`Next ${word}`} mark="›" main onPress={nextPage} testID="preview-next" />
          : <TurnButton box={side.forward} label="Order this album" mark={ordering ? '…' : 'Order'} main onPress={() => { void order(); }} testID="preview-order" />}
        {/* "Order this album"'s question or a failed save, over the book. */}
        {orderAskBox && <View style={[styles.sideAsk, { left: side.room.x, top: side.room.y, width: side.room.w, height: side.room.h }]}>{orderAskBox}</View>}
        <Text style={[styles.sideCounter, { left: c.x, top: c.y, width: c.w, height: c.h }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} testID="preview-counter">
          {previewCounter(pos)}
        </Text>
      </View>
    );
  }

  // UPRIGHT: the book as wide as the screen, the line under it says what
  // shows (the count over it is gone: it said the same), then the buttons.
  return (
    <View style={styles.page}>
      {chrome}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        testID="preview-scroll"
        onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); setViewH((v) => (v === h ? v : h)); }}
      >
        {book}
        <View style={styles.below}>
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
          {/* The website's line under its open-book button: the other way to see it. */}
          {!onCover && !openBook && canTurn && <Text style={styles.hint} testID="preview-turn-hint">or turn your phone sideways</Text>}
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
          {orderAskBox}
        </View>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={styles.turnRow}>
          {canTurnBack(pos) && <Button label={`‹ Previous ${word}`} kind="plain" onPress={back} style={styles.turnButton} testID="preview-prev" />}
          {canTurnForward(pos)
            ? <Button label={`Next ${word} ›`} onPress={nextPage} style={styles.turnButton} testID="preview-next" />
            : <Button label={orderLabel} busy={ordering} onPress={() => { void order(); }} style={styles.turnButton} testID="preview-order" />}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#EFE9E1' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.background },
  // Upright: the book UPRIGHT_EDGE from the screen's sides; the rest in from them as before.
  body: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: UPRIGHT_EDGE, gap: space.sm },
  below: { alignSelf: 'stretch', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md - UPRIGHT_EDGE },
  hint: { fontSize: 12, color: colors.muted, marginTop: -4 },
  // On its side: everything placed where previewLayout says.
  sideways: { flex: 1, backgroundColor: '#EFE9E1' },
  sideEdit: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border },
  sideEditText: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  place: { position: 'absolute' },
  round: { position: 'absolute', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4 },
  roundMain: { backgroundColor: colors.accent },
  roundPlain: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent },
  roundMark: { fontSize: 30, lineHeight: 34, fontWeight: '700', marginTop: -3 },
  roundWord: { fontSize: 14, fontWeight: '700' },
  roundMainText: { color: colors.accentText },
  roundPlainText: { color: colors.accent },
  pressed: { opacity: 0.85 },
  sideAsk: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: space.md },
  sideCounter: { position: 'absolute', fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  // The open book's shadow is its cover board's (bookLook.tsx); the closed
  // book is just its cover, with its own.
  stage: { backgroundColor: '#FFFFFF' },
  stageClosed: { elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  // Upright: clear of the line under it, with the board and the page edges.
  stageUpright: { marginTop: BOARD, marginBottom: BOOK_DRESS_Y },
  // The cover opening on its side: only the right page is there yet.
  stageOpening: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  notYet: { opacity: 0 },
  spread: { flexDirection: 'row' },
  face: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inside: { backgroundColor: '#FFFFFF' },
  insideText: { fontSize: 12, color: '#B9A992', textAlign: 'center', padding: space.sm },
  layerFace: { position: 'absolute', top: 0, overflow: 'hidden', backgroundColor: '#FFFFFF', backfaceVisibility: 'hidden' },
  castClip: { position: 'absolute', top: 0, overflow: 'hidden' },
  cast: { position: 'absolute', left: 0, top: 0 },
  caption: { fontSize: 14, fontWeight: '600', color: colors.muted },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  toggle: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 8 },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.text },
  notDrawn: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: space.md },
  saved: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  ask: { alignSelf: 'stretch', gap: space.sm, backgroundColor: '#FFF1EA', borderWidth: 1, borderColor: '#EBC3AE', borderRadius: 12, padding: space.md },
  askText: { fontSize: 15, lineHeight: 21, color: '#7A3A1E' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
  turnRow: { flexDirection: 'row', gap: space.sm },
  turnButton: { flex: 1 },
});
