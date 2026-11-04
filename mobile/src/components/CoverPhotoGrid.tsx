/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM'S PHOTOS FOR THE COVER, ABOVE THE COVER, as a grid you scroll down
   (owner, 2026-11-04: "just show all the photos to choose from not a side
   scrolling thing"; only the app, the website keeps its row, CoverEditor's
   photo strip).

   ABOVE the cover since #235 (owner, 2026-11-01: on a phone the photos sat
   under the cover, half hidden behind the bottom buttons; "The cover pic
   selection should put the pics on top"). So the grid has a height of its own
   (`rows`) and scrolls inside it: an album's 150 photos must not push the cover
   off the screen, and a tap shows on the cover right under it. It is a list
   that draws only the photos near the screen.

   Every photo, best first (albumFlow.coverPhotos). The photo on the cover is
   ticked. When the screen opens, the grid scrolls to it only if it's out of
   sight; a tap never moves the grid (it keeps its order, so nothing jumps
   under a finger).

   The website's "From your phone" tile is not here: the app draws a cover
   photo only when it is one of the album's (see editor/cover/CoverScreen.tsx).

   Used by the cover step (app/album-cover.tsx) and Design your cover
   (editor/cover/CoverScreen.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { Thumb } from './Thumb';
import { YOUR_PHOTOS } from '../editor/cover/words';
import { Tick } from '../home/homeIcons';
import { colors } from '../lib/theme';

export const COLUMNS = 5;
export const TILE_GAP = 6;
/** Half a row shows at the bottom, so the grid says there are more below. */
const ROWS_SHOWN = 3.5;

/** A tile's side: five across, between the screen's margins. */
export function gridTile(screenW: number, pad: number): number {
  return (screenW - pad * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS;
}

/** How far to scroll so the photo at `index` is in sight, or null when it
 *  already is (the website's scrollIntoView, nearest). */
export function offsetToShow(index: number, tile: number, gridH: number): number | null {
  if (index < 0 || gridH <= 0) return null;
  const row = Math.floor(index / COLUMNS);
  const rowH = tile + TILE_GAP;
  return row * rowH + tile <= gridH ? null : row * rowH;
}

export function CoverPhotoGrid({ photos, onCover, onPick, pad = 0, rows = ROWS_SHOWN }: {
  /** Best first (albumFlow.coverPhotos), each with its small picture. */
  photos: readonly UploadedPhoto[];
  /** The photo on the cover now, if it is one of the album's. */
  onCover: string | null;
  onPick: (photo: UploadedPhoto) => void;
  /** Space at the grid's sides (the screen's margin). */
  pad?: number;
  /** How many rows show before it scrolls. */
  rows?: number;
}) {
  const { width } = useWindowDimensions();
  const tile = gridTile(width, pad);
  const rowH = tile + TILE_GAP;
  const list = useRef<FlatList<UploadedPhoto>>(null);
  // The photo on the cover when the screen opened: scrolled to once, then never again.
  const firstOnCover = useRef(onCover);
  const scrolled = useRef(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (scrolled.current) return;
    scrolled.current = true;
    const at = firstOnCover.current ? photos.findIndex((p) => p.id === firstOnCover.current) : -1;
    const offset = offsetToShow(at, tile, e.nativeEvent.layout.height);
    if (offset !== null) list.current?.scrollToOffset({ offset, animated: false });
  }, [photos, tile]);

  return (
    <View testID="cover-your-photos">
      <Text style={[styles.label, { paddingHorizontal: pad }]}>{YOUR_PHOTOS}</Text>
      <FlatList
        ref={list}
        data={photos as UploadedPhoto[]}
        keyExtractor={(p) => p.id}
        numColumns={COLUMNS}
        extraData={onCover}
        onLayout={onLayout}
        style={{ maxHeight: rows * rowH }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: pad }}
        columnWrapperStyle={{ gap: TILE_GAP, marginBottom: TILE_GAP }}
        // FlatList's index here is a row's.
        getItemLayout={(_d, i) => ({ length: rowH, offset: i * rowH, index: i })}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        testID="cover-photo-grid"
        renderItem={({ item: p }) => {
          const on = p.id === onCover;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? 'On the cover' : 'Put this photo on the cover'}
              onPress={() => onPick(p)} style={[styles.tile, { width: tile, height: tile }, on && styles.tileOn]} testID={`cover-photo-${p.id}`}>
              <Thumb uri={p.previewUrl} size={tile - 4} recyclingKey={p.id} />
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
  tile: { borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  tileOn: { borderColor: '#FB7185', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)' },
  tickOver: { backgroundColor: 'rgba(0, 0, 0, 0.25)', alignItems: 'center', justifyContent: 'center' },
});
