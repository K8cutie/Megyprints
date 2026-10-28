/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW: the album as a book, the website's way (BuilderPreview, its
   words), its rules shared: where a turn goes (previewPaging.ts) and what a
   turning leaf shows (pageTurn.ts planTurn).

   It opens on the closed book's front cover. "Next page" opens it on page 1;
   an upright phone shows one page at a time, and "See it as an open book"
   shows two facing pages, as they print: page 1 on the right across from the
   inside of the front cover, then 2 | 3, 4 | 5… A swipe turns the page too.
   Each turn plays the website's page turn (the leaf hinged at the spine).

   Every page is drawn by the app's page renderer from the builder's own page
   data (usePagePicture). What it can't draw yet is listed under the book.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { atAlbumEnd, canTurnBack, canTurnForward, previewCaption, previewCounter, swipeTurn, turnBack, turnForward, spreadStart, type PreviewPosition, type PreviewView, type Turn } from '@web/pages/builder/previewPaging';
import { planTurn, type TurnFace, type TurnPlan } from '@web/pages/builder/pageTurn';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { preparePagePicture, usePagePicture } from '../builder/usePagePicture';
import type { PageRequest } from '../builder/pageImages';
import { useAuth } from '../lib/auth';
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

/** One side of a leaf: a page as it prints, the front cover, or the inside of a cover. */
function Face({ face, W, H, pages, cover, photos, albumSize, text, onNotDrawn }: FaceProps) {
  const req = faceRequest(face, { W, pages, cover, photos, albumSize });
  const picture = usePagePicture(text, req);
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
        <Text style={styles.insideText}>This page could not be drawn: {picture.error}</Text>
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
  const { builder, text } = useBuilder();
  const { session } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();
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

  // The album goes to the account once it is made (signed in); on the phone it is saved already.
  const [cloud, setCloud] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn || total === 0) return;
    let live = true;
    setCloud('saving');
    void builder.manualSave().then((ok) => { if (live) setCloud(ok ? 'saved' : 'error'); }).catch(() => { if (live) setCloud('error'); });
    return () => { live = false; };
    // Once per opening of the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

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
    if (!text || total === 0) return;
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
  }, [text, index, view, onCover, total, singleW, pages, builder.coverFront]);
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
        {!onCover && (
          <Pressable accessibilityRole="button" onPress={() => setOpenBook((v) => !v)} style={styles.toggle} testID="preview-open-book">
            <Text style={styles.toggleText}>{openBook ? 'One page at a time' : 'See it as an open book'}</Text>
          </Pressable>
        )}
        {missingHere.length > 0 && (
          <Text style={styles.notDrawn} testID="preview-not-drawn">Not drawn in the app yet: {missingHere.join(', ')}.</Text>
        )}
        <Text style={styles.saved} testID="preview-saved">
          {cloud === 'saved' ? 'Saved on this phone and in your account.'
            : cloud === 'saving' ? 'Saved on this phone. Saving to your account…'
              : cloud === 'error' ? 'Saved on this phone. It could not be saved to your account just now: it will try again.'
                : 'Saved on this phone. Sign in to keep it in your account too.'}
        </Text>
        {end && <Text style={styles.endNote}>Ordering from the app comes in a later version. Your album stays saved.</Text>}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={styles.turnRow}>
          {canTurnBack(pos) && <Button label={`‹ Previous ${word}`} kind="plain" onPress={back} style={styles.turnButton} testID="preview-prev" />}
          {canTurnForward(pos)
            ? <Button label={`Next ${word} ›`} onPress={forward} style={styles.turnButton} testID="preview-next" />
            : <Button label="Done" onPress={() => router.replace('/')} style={styles.turnButton} testID="preview-done" />}
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
  toggle: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 8 },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.text },
  notDrawn: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: space.md },
  saved: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  endNote: { fontSize: 14, color: colors.text, textAlign: 'center', paddingHorizontal: space.md },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
  turnRow: { flexDirection: 'row', gap: space.sm },
  turnButton: { flex: 1 },
});
