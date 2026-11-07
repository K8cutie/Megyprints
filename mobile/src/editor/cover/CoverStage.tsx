/* The front cover in the cover editor, as print draws it (the page renderer,
   coverMode), and the finger on it (CoverEditor's preview):
     • dragging words placed by hand (owner, 2026-11-07: "Add text") moves
       them, and a tap on them opens them (the screen says which);
     • dragging the title (inside its dashed box) moves the title;
     • dragging anywhere else moves the photo in its frame, when the cover
       has a photo.
   It reports how far the finger went as fractions of the cover's width and
   height; the screen turns that into the website's calls (coverEdits.ts).
   Everything drawn here lets the touch through to the stage itself, so the
   finger's place is measured from the cover's own corner.

   While a finger moves the photo, zooms it, or moves the title, the album is
   not changed at every step: what it would look like is drawn here, live,
   over the cover picture (`live`: the photo placed as print places it,
   bgCoverFit, and the title's words in their box), and the screen sends one
   change when the finger lets go. */
import { useMemo, useRef, type ReactNode } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { CAPTION_PAD_X, curveCentreX, type CurveGlyph } from '@web/pages/builder/wordArtRules';
import { colors } from '../../lib/theme';

/** The title, the photo, or words placed by hand (`words:<id>`). */
export type DragWhat = 'title' | 'photo' | `words:${string}`;
export type DragPhase = 'start' | 'move' | 'end';
type Rect = { x: number; y: number; w: number; h: number };
/** Words placed by hand: where their letters are (fractions of the cover). */
export interface WordsRect { id: string; rect: Rect }

/** What the finger shows before the album has it (screen px for the photo,
 *  fractions of the cover for the title's box). */
export interface LiveCover {
  photo: { uri: string; x: number; y: number; w: number; h: number } | null;
  /** The title's words in their box, styled for the screen. */
  title: { rect: Rect; text: string; style: TextStyle; ghost: boolean; letters: { size: number; width: number; glyphs: CurveGlyph[] } | null } | null;
}

/** What a finger coming down at (x, y) (fractions of the cover) drags: words
 *  placed by hand (the last on top), else the title inside its box, else the
 *  photo when there is one, else nothing. */
export function dragTarget(x: number, y: number, title: Rect | null, hasPhoto: boolean, words: readonly WordsRect[] = []): DragWhat | null {
  const inside = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  for (let i = words.length - 1; i >= 0; i--) if (inside(words[i].rect)) return `words:${words[i].id}`;
  if (title && inside(title)) return 'title';
  return hasPhoto ? 'photo' : null;
}

export function CoverStage({ uri, busy, failed, width, height, titleRect, hasPhoto, onDrag, label, live = null, words = [], over = null }: {
  /** The cover's picture (file://), or null while it is first drawn. */
  uri: string | null;
  /** A newer picture is being drawn (the last one stays on show). */
  busy: boolean;
  failed: string | null;
  width: number;
  height: number;
  /** The title's box as shown now (fractions of the cover), or null: nothing to move. */
  titleRect: Rect | null;
  hasPhoto: boolean;
  onDrag: (what: DragWhat, phase: DragPhase, dx: number, dy: number) => void;
  label: string;
  live?: LiveCover | null;
  /** Words placed by hand, each with a dashed handle like the title's. */
  words?: readonly WordsRect[];
  /** Drawn over the cover (words moving, the safe print area's line). */
  over?: ReactNode;
}) {
  const on = useRef({ titleRect, hasPhoto, onDrag, width, height, words });
  on.current = { titleRect, hasPhoto, onDrag, width, height, words };
  const what = useRef<DragWhat | null>(null);
  const finger = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // The finger stays with the cover once it has it (no scroll or swipe takes it).
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const c = on.current;
      const x = e.nativeEvent.locationX / Math.max(1, c.width);
      const y = e.nativeEvent.locationY / Math.max(1, c.height);
      what.current = dragTarget(x, y, c.titleRect, c.hasPhoto, c.words);
      if (what.current) c.onDrag(what.current, 'start', 0, 0);
    },
    onPanResponderMove: (_e, g) => {
      const c = on.current;
      if (what.current) c.onDrag(what.current, 'move', g.dx / Math.max(1, c.width), g.dy / Math.max(1, c.height));
    },
    onPanResponderRelease: (_e, g) => {
      const c = on.current;
      if (what.current) c.onDrag(what.current, 'end', g.dx / Math.max(1, c.width), g.dy / Math.max(1, c.height));
      what.current = null;
    },
    onPanResponderTerminate: (_e, g) => {
      const c = on.current;
      if (what.current) c.onDrag(what.current, 'end', g.dx / Math.max(1, c.width), g.dy / Math.max(1, c.height));
      what.current = null;
    },
  }), []);

  return (
    <View style={[styles.stage, { width, height }]} {...finger.panHandlers} accessibilityLabel={label} testID="cover-stage">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {uri ? (
          <Image source={{ uri }} style={{ width, height }} contentFit="fill" transition={0} cachePolicy="memory-disk" testID="cover-stage-picture" />
        ) : failed ? (
          <View style={styles.center}><Text style={styles.failed}>{failed}</Text></View>
        ) : (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        )}
        {live?.photo && (
          <Image source={{ uri: live.photo.uri }} testID="cover-stage-live-photo" contentFit="fill" transition={0} cachePolicy="memory-disk"
            style={{ position: 'absolute', left: live.photo.x, top: live.photo.y, width: live.photo.w, height: live.photo.h }} />
        )}
        {live?.title && (
          <View testID="cover-stage-live-title" style={[styles.liveTitle, {
            left: live.title.rect.x * width, top: live.title.rect.y * height, width: live.title.rect.w * width, height: live.title.rect.h * height,
            opacity: live.title.ghost ? 0.9 : 1,
          }]}>
            {live.title.letters ? (() => {
              const { letters, rect, style } = live.title;
              const boxW = rect.w * width;
              const align = style.textAlign === 'left' || style.textAlign === 'right' ? style.textAlign : 'center';
              const cx = curveCentreX(align === 'left' ? boxW * CAPTION_PAD_X : align === 'right' ? boxW * (1 - CAPTION_PAD_X) : boxW / 2, align, letters.width);
              const cy = (rect.h * height) / 2;
              const cell = letters.size * 2;
              return letters.glyphs.map((g, i) => (
                <Text key={i} style={[style, styles.letter, {
                  width: cell, height: cell, lineHeight: cell, left: cx + g.x - cell / 2, top: cy + g.y - cell / 2,
                  transform: [{ rotate: `${g.angle}rad` }],
                }]}>{g.text}</Text>
              ));
            })() : <Text style={live.title.style}>{live.title.text}</Text>}
          </View>
        )}
        {over}
        {busy && uri && <ActivityIndicator style={styles.busy} color={colors.accent} />}
        {/* CoverEditor's drag handle over the title, once it has words. */}
        {titleRect && (
          <View testID="cover-title-handle" style={[styles.handle, {
            left: titleRect.x * width, top: titleRect.y * height, width: titleRect.w * width, height: titleRect.h * height,
          }]} />
        )}
        {words.map((w) => (
          <View key={w.id} testID={`cover-words-handle-${w.id}`} style={[styles.handle, {
            left: w.rect.x * width, top: w.rect.y * height, width: w.rect.w * width, height: w.rect.h * height,
          }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, overflow: 'hidden', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 },
  busy: { position: 'absolute', top: 8, right: 8 },
  liveTitle: { position: 'absolute', justifyContent: 'center', overflow: 'visible' },
  letter: { position: 'absolute', textAlign: 'center', textAlignVertical: 'center' },
  handle: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(232,165,152,0.95)', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
});
