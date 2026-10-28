/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTOS PART'S SHEETS, each the website's phone sheet for the same job,
   in the editor's shared bottom sheet (core/EditorSheet):
     • "Add a photo" (MobileReview): "Upload more photos" first, then every
       album photo, tagged with the page it is on; a pick fills the frame or
       caption box (actions.ts placePicked);
     • "Mask" and "Filter" (StudioPhone's sheets): the shapes and colour
       treatments by name, the one on the photo ticked;
     • "Pages" (the app's own: the website adds and deletes pages through
       Megy's chat): add a page after this one, delete this one (never under
       the 40-page floor: said instead of offered).
   ══════════════════════════════════════════════════════════════════════════ */
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MASKS, isMaskId, type MaskId } from '@web/pages/builder/maskShapes';
import { LOOKS, isLookId, type LookId } from '@web/pages/builder/lookRules';
import { Thumb } from '../../components/Thumb';
import { colors, space } from '../../lib/theme';
import { EditorSheet, SheetChoice } from '../core/EditorSheet';
import type { SheetProps } from '../registry';
import { addPageAfter, canDeletePage, deleteThisPage, photoTags, pickLook, pickMask, placePicked, type PickTarget } from './actions';
import { pickFromPhone } from './pickFromPhone';
import {
  ADD_A_PHOTO, ADD_PAGE, ADD_PAGE_DESC, CANT_DELETE_PAGE, DELETE_PAGE_DESC, deletePageLabel, FILTER, MASK, MASK_HINT,
  NO_PHOTOS_YET, ORIGINAL, PAGES_TITLE, UPLOAD_MORE,
} from './words';

export const PICK_SHEET = 'photos:pick';
export const LAYOUT_SHEET = 'photos:layout';
export const MASK_SHEET = 'photos:mask';
export const FILTER_SHEET = 'photos:filter';
export const PAGES_SHEET = 'photos:pages';

const COLUMNS = 3;
const GAP = 8;

export function PickPhotoSheet({ ctx, params, close }: SheetProps<PickTarget>) {
  const { width, height } = useWindowDimensions();
  const cell = Math.floor((width - space.md * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const photos = ctx.builder.uploadedPhotos;
  const tags = photoTags(ctx);
  return (
    <EditorSheet title={ADD_A_PHOTO} onClose={close} testID="photos-pick-sheet">
      {/* Running out of photos is found HERE, so the way to more is here too (MobileReview). */}
      <Pressable accessibilityRole="button" accessibilityLabel={UPLOAD_MORE} testID="photos-pick-upload"
        onPress={() => { close(); pickFromPhone({ id: PICK_SHEET, params }); }}
        style={({ pressed }) => [styles.upload, pressed && styles.pressed]}>
        <Text style={styles.uploadText}>{`＋  ${UPLOAD_MORE}`}</Text>
      </Pressable>
      {photos.length === 0 ? (
        <Text style={styles.empty}>{NO_PHOTOS_YET}</Text>
      ) : (
        <FlatList
          data={photos} keyExtractor={(p) => p.id} numColumns={COLUMNS}
          style={{ maxHeight: height * 0.5 }} columnWrapperStyle={styles.row} contentContainerStyle={styles.grid}
          renderItem={({ item, index }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={tags[index] ? `Photo ${index + 1}, ${tags[index]}` : `Photo ${index + 1}`}
              testID={`photos-pick-${index}`} onPress={() => { placePicked(ctx, params, index); close(); }}
              style={({ pressed }) => [{ width: cell, height: cell }, styles.cell, pressed && styles.pressed]}>
              <Thumb uri={item.previewUrl} size={cell} recyclingKey={item.id} />
              {tags[index] && <Text style={styles.tag}>{tags[index]}</Text>}
            </Pressable>
          )}
        />
      )}
    </EditorSheet>
  );
}

const tick = (label: string, on: boolean) => (on ? `✓ ${label}` : label);

export function MaskSheet({ ctx, params, close }: SheetProps<{ slot: number }>) {
  const raw = ctx.page.slotMasks?.[params.slot];
  const current: MaskId | 'none' = isMaskId(raw) ? raw : 'none';
  return (
    <EditorSheet title={MASK} onClose={close} scroll testID="photos-mask-sheet">
      <Text style={styles.hint}>{MASK_HINT}</Text>
      {MASKS.map((m) => (
        <SheetChoice key={m.id} label={tick(m.label, m.id === current)} testID={`photos-mask-${m.id}`}
          onPress={() => { close(); pickMask(ctx, params.slot, m.id); }} />
      ))}
    </EditorSheet>
  );
}

export function FilterSheet({ ctx, params, close }: SheetProps<{ slot: number }>) {
  const raw = ctx.page.slotLooks?.[params.slot];
  const current: LookId | 'none' = isLookId(raw) ? raw : 'none';
  const items: { id: LookId | 'none'; label: string }[] = [{ id: 'none', label: ORIGINAL }, ...LOOKS.map((l) => ({ id: l.id, label: l.label }))];
  return (
    <EditorSheet title={FILTER} onClose={close} scroll testID="photos-filter-sheet">
      {items.map((l) => (
        <SheetChoice key={l.id} label={tick(l.label, l.id === current)} testID={`photos-filter-${l.id}`}
          onPress={() => { close(); pickLook(ctx, params.slot, l.id); }} />
      ))}
    </EditorSheet>
  );
}

export function PagesSheet({ ctx, close }: SheetProps<undefined>) {
  return (
    <EditorSheet title={PAGES_TITLE} onClose={close} testID="photos-pages-sheet">
      <SheetChoice label={ADD_PAGE} desc={ADD_PAGE_DESC} testID="photos-page-add"
        // The new page has no frames yet: its layouts come next.
        onPress={() => { addPageAfter(ctx); ctx.openSheet(LAYOUT_SHEET); }} />
      {canDeletePage(ctx) ? (
        <SheetChoice label={deletePageLabel(ctx.pageIndex)} desc={DELETE_PAGE_DESC} danger testID="photos-page-delete"
          onPress={() => { close(); deleteThisPage(ctx); }} />
      ) : (
        <View style={styles.note}><Text style={styles.noteText} testID="photos-page-floor">{CANT_DELETE_PAGE}</Text></View>
      )}
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  upload: { minHeight: 48, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  uploadText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  pressed: { opacity: 0.85 },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center', padding: space.lg },
  grid: { gap: GAP },
  row: { gap: GAP },
  cell: { borderRadius: 8, overflow: 'hidden' },
  tag: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(45,45,45,0.75)', color: '#FFF8F0', fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  hint: { fontSize: 13, color: colors.muted },
  note: { borderRadius: 12, backgroundColor: colors.background, padding: space.md },
  noteText: { fontSize: 14, lineHeight: 20, color: colors.muted },
});
