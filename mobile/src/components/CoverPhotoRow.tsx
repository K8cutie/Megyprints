/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM'S PHOTOS FOR THE COVER, ABOVE THE COVER: the website's
   CoverEditor photo strip (#235, owner 2026-11-01: on a phone the photos sat
   under the cover, half hidden behind the bottom buttons; "The cover pic
   selection should put the pics on top").

   ONE row you swipe, every photo, best first (albumFlow.coverPhotos), no
   "Show all". The photo on the cover is ticked. When the screen opens, the
   row scrolls to it only if it's out of sight; a tap never moves the row (it
   keeps its order, so nothing jumps under a finger).

   The website's "From your phone" tile at the start of the row is not here:
   the app draws a cover photo only when it is one of the album's (see
   editor/cover/CoverScreen.tsx).

   Used by the cover step (app/album-cover.tsx) and Design your cover
   (editor/cover/CoverScreen.tsx), as the website uses one strip for both.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { Thumb } from './Thumb';
import { YOUR_PHOTOS } from '../editor/cover/words';
import { Tick } from '../home/homeIcons';
import { colors } from '../lib/theme';

/** The website's tile (h-16 w-16) and gap (gap-1.5). */
export const TILE = 64;
export const TILE_GAP = 6;

/** How far to scroll so the photo at `index` is in sight, or null when it
 *  already is (the website's scrollIntoView, inline 'nearest'). */
export function scrollToShow(index: number, rowWidth: number, pad: number): number | null {
  if (index < 0 || rowWidth <= 0) return null;
  const right = pad + index * (TILE + TILE_GAP) + TILE;
  return right <= rowWidth ? null : right - rowWidth + pad;
}

export function CoverPhotoRow({ photos, onCover, onPick, pad = 0 }: {
  /** Best first (albumFlow.coverPhotos), each with its small picture. */
  photos: readonly UploadedPhoto[];
  /** The photo on the cover now, if it is one of the album's. */
  onCover: string | null;
  onPick: (photo: UploadedPhoto) => void;
  /** Space before the first tile and after the last (the screen's margin). */
  pad?: number;
}) {
  const list = useRef<FlatList<UploadedPhoto>>(null);
  // The photo on the cover when the screen opened: scrolled to once, then never again.
  const firstOnCover = useRef(onCover);
  const scrolled = useRef(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (scrolled.current) return;
    scrolled.current = true;
    const at = firstOnCover.current ? photos.findIndex((p) => p.id === firstOnCover.current) : -1;
    const offset = scrollToShow(at, e.nativeEvent.layout.width, pad);
    if (offset !== null) list.current?.scrollToOffset({ offset, animated: false });
  }, [photos, pad]);

  return (
    <View testID="cover-your-photos">
      <Text style={[styles.label, { paddingHorizontal: pad }]}>{YOUR_PHOTOS}</Text>
      <FlatList
        ref={list}
        horizontal
        data={photos as UploadedPhoto[]}
        keyExtractor={(p) => p.id}
        extraData={onCover}
        onLayout={onLayout}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, gap: TILE_GAP }}
        getItemLayout={(_d, i) => ({ length: TILE + TILE_GAP, offset: pad + i * (TILE + TILE_GAP), index: i })}
        initialNumToRender={12}
        windowSize={5}
        testID="cover-photo-row"
        renderItem={({ item: p }) => {
          const on = p.id === onCover;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? 'On the cover' : 'Put this photo on the cover'}
              onPress={() => onPick(p)} style={[styles.tile, on && styles.tileOn]} testID={`cover-photo-${p.id}`}>
              <Thumb uri={p.previewUrl} size={TILE - 4} recyclingKey={p.id} />
              {on && (
                <View style={[StyleSheet.absoluteFill, styles.tickOver]}>
                  <Tick size={18} color="#FFFFFF" stroke={2.4} />
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: '#9B8B7A', marginBottom: 4 },
  tile: { width: TILE, height: TILE, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  tileOn: { borderColor: '#FB7185', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)' },
  tickOver: { backgroundColor: 'rgba(0, 0, 0, 0.25)', alignItems: 'center', justifyContent: 'center' },
});
