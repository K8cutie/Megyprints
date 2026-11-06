/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE ABOVE THE WORDS, in "Edit text": the page with the words as they
   are now, the box being edited outlined, so every change shows where it will
   print (owner, 2026-11-05: "basically the same format as the mask"). It is
   the page renderer's own picture, on the page as saveWords would leave it
   (wordsFlow pageWithWords), and nothing is saved until Done.

   A button's change is drawn at once. Typing waits for a short pause, so the
   phone draws what was typed, not every letter on the way. While a new
   picture is being drawn the last one stays on show. A tap on the page puts
   the keyboard or the open list away, so the page gets the room.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { PRIORITY, usePagePicture } from '../../builder/usePagePicture';
import { PAGE_NOT_SHOWN } from '../../builder/screenWords';
import { colors, space } from '../../lib/theme';
import { pageTargets } from '../hitTest';
import { editorPictureWidth } from '../pagePictureWidth';
import { targetStyle } from '../PageStage';
import type { EditorContext } from '../registry';
import { renderedLines } from '../textLines';
import { WORDS_ON_PAGE } from './words';
import { contentOf, pageWithWords, sameWords, targetOfWords, type EditorState, type WordsTarget } from './wordsFlow';

/** How long typing has to pause before the page is drawn with it. */
export const TYPING_PAUSE_MS = 180;

export function WordsOnPage({ ctx, target, state, opened, onTap }: {
  ctx: EditorContext;
  target: WordsTarget;
  /** The words as they are now. */
  state: EditorState;
  /** The words as the editor opened with them: the page itself, already drawn. */
  opened: EditorState;
  onTap: () => void;
}) {
  const { builder, page, pageIndex, text } = ctx;
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [drawn, setDrawn] = useState(state);
  useEffect(() => {
    if (state.text === drawn.text) { setDrawn(state); return; }
    const t = setTimeout(() => setDrawn(state), TYPING_PAUSE_MS);
    return () => clearTimeout(t);
    // Only a new change starts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const draft = useMemo(
    () => (sameWords(contentOf(drawn), contentOf(opened)) ? page : pageWithWords(page, target, contentOf(drawn))),
    [drawn, opened, page, target],
  );
  const photoCount = builder.uploadedPhotos.length;
  const plan = useMemo(
    () => pageTargets({ page: draft, albumSize: builder.albumSize, pageIndex, photoCount, countLines: renderedLines(text) }),
    [draft, builder.albumSize, pageIndex, photoCount, text],
  );
  const box = targetOfWords(plan.targets, target);

  const picture = usePagePicture(text, { page: draft, pageIndex, albumSize: builder.albumSize, photos: builder.uploadedPhotos, width: editorPictureWidth(screenW, screenH) }, PRIORITY.editing);
  const lastShown = useRef<string | null>(null);
  if (picture.uri) lastShown.current = picture.uri;
  const uri = picture.uri ?? lastShown.current;

  // As large as the room above the words.
  const [area, setArea] = useState({ w: 0, h: 0 });
  const aspect = plan.width / plan.height;
  const w = Math.max(1, Math.floor(Math.min(area.w - PAD * 2, (area.h - PAD * 2) * aspect)));
  const h = Math.max(1, Math.round(w / aspect));
  const k = w / plan.width;

  return (
    <Pressable accessible={false} onPress={onTap} style={styles.area} testID="text-editor-page"
      onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {area.w > 0 && (
        <View style={[styles.page, { width: w, height: h }]} accessible accessibilityRole="image" accessibilityLabel={WORDS_ON_PAGE}>
          {uri ? (
            <Image source={{ uri }} style={{ width: w, height: h }} contentFit="fill" transition={0} cachePolicy="memory-disk" testID="text-editor-picture" />
          ) : picture.error ? (
            <View style={styles.center}><Text style={styles.failed}>{PAGE_NOT_SHOWN}</Text></View>
          ) : (
            <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
          )}
          {box && <View pointerEvents="none" style={[targetStyle(box, k), styles.outline]} testID="text-editor-box" />}
        </View>
      )}
    </Pressable>
  );
}

const PAD = space.sm;

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  page: { backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 },
  outline: { borderWidth: 2, borderColor: colors.accent },
});
