/* ══════════════════════════════════════════════════════════════════════════
   "CHANGE LAYOUT" (the website's LayoutPicker, on the phone a bottom sheet):
   the page's own layout first ("✓ Current"), then every layout that holds
   its photos without a bad crop, frame by frame (the 16% rule: the builder's
   availableTemplatesForCurrentPage → layoutChoicesForPage), same photo count
   first. Each is a picture of THIS page on that layout, with these photos,
   drawn by the app's page renderer (the page a tap would make:
   relayPageOnTemplate, shared). A layout that can't hold every photo or
   caption asks first where they go (LeftoverQuestion).

   An album size can have 50+ layouts: the grid is a list that draws only the
   pictures near the screen (FlatList), after the page being edited
   (PRIORITY.thumbnail), and a picture not drawn yet when it scrolls away or
   the sheet closes is never drawn (usePagePicture drops it).
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { ALBUM_SIZES, type PageTemplate } from '@web/pages/builder/types';
import { relayPageOnTemplate } from '@web/pages/builder/useBuilderState';
import { memoriesOn } from '@web/pages/builder/generateAlbum';
import { PRIORITY, usePagePicture } from '../../builder/usePagePicture';
import { Button } from '../../components/Button';
import { colors, space } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import type { EditorContext, SheetProps } from '../registry';
import { applyLayout, chooseLayout, layoutChoices, photosHeld, type LayoutAsk } from './actions';
import { LAYOUT_CURRENT, LAYOUT_MEMORY_NOTE, LAYOUT_NONE, LAYOUT_TITLE, leftoverWords } from './words';

const COLUMNS = 2;
const GAP = 12;
/** A tile's padding and border, both sides: every tile is as wide as its
 *  picture plus this, so a long layout name is cut short, never widening it. */
const TILE_EDGE = 12;

/** One layout, as this page would look on it. */
function LayoutThumb({ ctx, t, width, height }: { ctx: EditorContext; t: PageTemplate; width: number; height: number }) {
  const page = useMemo(() => relayPageOnTemplate(ctx.page, t), [ctx.page, t]);
  const px = Math.min(600, Math.round(width * PixelRatio.get()));
  const picture = usePagePicture(ctx.text, { page, pageIndex: ctx.pageIndex, albumSize: ctx.builder.albumSize, photos: ctx.builder.uploadedPhotos, width: px }, PRIORITY.thumbnail);
  return (
    <View style={[styles.thumb, { width, height }]}>
      {picture.uri
        ? <Image source={{ uri: picture.uri }} style={{ width, height }} contentFit="fill" transition={0} cachePolicy="memory-disk" />
        : <ActivityIndicator color={colors.accent} />}
    </View>
  );
}

export function LayoutSheet({ ctx, close }: SheetProps<undefined>) {
  const [asking, setAsking] = useState<LayoutAsk | null>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const layouts = layoutChoices(ctx);
  const current = ctx.page.templateId;
  // A video memory only ever sits on a full-page photo: say why there are no more.
  const hasMemory = memoriesOn(ctx.page).length > 0;
  const size = ALBUM_SIZES.find((s) => s.preset === ctx.builder.albumSize) ?? ALBUM_SIZES[1];
  const tileW = Math.floor((screenW - space.md * 2 - GAP * (COLUMNS - 1)) / COLUMNS) - 12;
  const tileH = Math.round(tileW * (size.height / size.width));

  const choose = (t: PageTemplate) => {
    const ask = chooseLayout(ctx, t);
    if (ask) setAsking(ask); else close();
  };
  const apply = (leftover: 'new-page' | 'leave-out') => {
    if (!asking) return;
    applyLayout(ctx, asking, leftover);
    close();
  };

  const memoryNote = hasMemory ? <Text style={styles.note} testID="photos-layout-memory">{LAYOUT_MEMORY_NOTE}</Text> : null;
  const onlyCurrent = layouts.length === 1 && layouts[0].id === current && !hasMemory;
  return (
    <EditorSheet title={LAYOUT_TITLE} onClose={close} scroll={!!asking || layouts.length === 0} testID="photos-layout-sheet">
      {asking ? (
        <Leftover ask={asking} onNewPage={() => apply('new-page')} onLeaveOut={() => apply('leave-out')} onBack={() => setAsking(null)} />
      ) : layouts.length === 0 ? (
        <>
          {memoryNote}
          <Text style={styles.none}>{LAYOUT_NONE}</Text>
        </>
      ) : (
        <FlatList
          data={layouts}
          keyExtractor={(t) => t.id}
          numColumns={COLUMNS}
          style={{ maxHeight: Math.round(screenH * 0.62) }}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={3}
          ListHeaderComponent={memoryNote ?? undefined}
          ListFooterComponent={onlyCurrent ? <Text style={styles.none}>{LAYOUT_NONE}</Text> : undefined}
          testID="photos-layout-grid"
          renderItem={({ item: t }) => {
            const isCurrent = t.id === current;
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={isCurrent ? `${t.name}, current layout` : t.name}
                accessibilityState={{ selected: isCurrent }} onPress={() => choose(t)} testID={`photos-layout-${t.id}`}
                style={({ pressed }) => [styles.tile, { width: tileW + TILE_EDGE }, isCurrent && styles.tileNow, pressed && styles.pressed]}>
                <LayoutThumb ctx={ctx} t={t} width={tileW} height={tileH} />
                <Text numberOfLines={1} style={[styles.name, isCurrent && styles.nameNow]}>{isCurrent ? LAYOUT_CURRENT : t.name}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </EditorSheet>
  );
}

/** "Where should they go?" for the photos (and captions) a layout can't hold. */
function Leftover({ ask, onNewPage, onLeaveOut, onBack }: { ask: LayoutAsk; onNewPage: () => void; onLeaveOut: () => void; onBack: () => void }) {
  const w = leftoverWords(ask.t.name, photosHeld(ask.t), ask.photos, ask.captions);
  return (
    <View style={styles.leftover} testID="photos-layout-leftover">
      <Text style={styles.heading}>{w.heading}</Text>
      {w.photos && <Text style={styles.body}>{w.photos}</Text>}
      {w.captions && <Text style={styles.body}>{w.captions}</Text>}
      {ask.photos > 0 ? (
        <>
          <Button label={w.newPage} onPress={onNewPage} testID="photos-layout-new-page" />
          <Text style={styles.under}>{w.newPageDesc}</Text>
          <Button label={w.leaveOut} kind="plain" onPress={onLeaveOut} testID="photos-layout-leave-out" />
          <Text style={styles.under}>{w.leaveOutDesc}</Text>
        </>
      ) : (
        <Button label={w.apply} onPress={onLeaveOut} testID="photos-layout-apply" />
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={w.back} onPress={onBack} style={styles.back} testID="photos-layout-back">
        <Text style={styles.backText}>{w.back}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 14, lineHeight: 20, color: colors.muted },
  none: { fontSize: 14, color: colors.muted, textAlign: 'center', padding: space.md },
  list: { gap: GAP },
  row: { gap: GAP },
  tile: { borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, padding: 4, alignItems: 'center' },
  tileNow: { borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  pressed: { opacity: 0.85 },
  thumb: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderRadius: 6, overflow: 'hidden' },
  name: { fontSize: 13, color: colors.muted, marginTop: 6, marginBottom: 2, maxWidth: '100%' },
  nameNow: { color: '#9A4A2C', fontWeight: '700' },
  leftover: { gap: space.sm },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.muted },
  under: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: -4 },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
