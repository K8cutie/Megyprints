/* The front cover in the cover editor, as print draws it (the page renderer,
   coverMode), and the finger on it (CoverEditor's preview):
     • dragging the title (inside its dashed box) moves the title;
     • dragging anywhere else moves the photo in its frame, when the cover
       has a photo.
   It reports how far the finger went as fractions of the cover's width and
   height; the screen turns that into the website's calls (coverEdits.ts).
   Everything drawn here lets the touch through to the stage itself, so the
   finger's place is measured from the cover's own corner. */
import { useMemo, useRef } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../lib/theme';

export type DragWhat = 'title' | 'photo';
export type DragPhase = 'start' | 'move' | 'end';
type Rect = { x: number; y: number; w: number; h: number };

/** What a finger coming down at (x, y) (fractions of the cover) drags: the
 *  title inside its box, else the photo when there is one, else nothing. */
export function dragTarget(x: number, y: number, title: Rect | null, hasPhoto: boolean): DragWhat | null {
  if (title && x >= title.x && x <= title.x + title.w && y >= title.y && y <= title.y + title.h) return 'title';
  return hasPhoto ? 'photo' : null;
}

export function CoverStage({ uri, busy, failed, width, height, titleRect, hasPhoto, onDrag, label }: {
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
}) {
  const on = useRef({ titleRect, hasPhoto, onDrag, width, height });
  on.current = { titleRect, hasPhoto, onDrag, width, height };
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
      what.current = dragTarget(x, y, c.titleRect, c.hasPhoto);
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
        {busy && uri && <ActivityIndicator style={styles.busy} color={colors.accent} />}
        {/* CoverEditor's drag handle over the title, once it has words. */}
        {titleRect && (
          <View testID="cover-title-handle" style={[styles.handle, {
            left: titleRect.x * width, top: titleRect.y * height, width: titleRect.w * width, height: titleRect.h * height,
          }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, overflow: 'hidden', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 },
  busy: { position: 'absolute', top: 8, right: 8 },
  handle: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(232,165,152,0.95)', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
});
