/* ══════════════════════════════════════════════════════════════════════════
   PART 1: PHOTOS, LAYOUTS AND PAGES in the "Edit pages" screen.

   This folder is this part's own: the shared screen is reached only through
   registerEditorPart (../registry.ts). Every change goes through ctx.builder
   (the website's useBuilderState), with the arguments the website's editor
   uses (actions.ts), so undo, saving and the account work as on the website.

   What it adds, the website's way and words (MobileReview.tsx, StudioPhone,
   LayoutPicker, SlotChooser; words.ts):
     • "Add Photo" in "Add to this box" (an empty frame) and a tap on a
       caption box's photo: the "Add a photo" sheet, every album photo tagged
       with its page ("This page" / "Page 3"); a pick fills the frame
       (fillSlot: ONE PHOTO, ONE PLACE, a photo placed elsewhere swaps with
       this frame's and the customer is told: swapNotice) or the caption box
       (setTextSlotPhoto). "Upload more photos" goes to the phone's photos.
     • The selected photo: moved with a finger and zoomed with two
       (FramingOverlay, framing.ts: slotPhotoFit is THE fit; setSlotOffset /
       setSlotScale), and its buttons: Replace photo, Swap photo (then a tap
       on the other photo, on this page or another: fillSlot swaps them),
       Mask, Filter (setSlotMask / setSlotLook, with the edge warning) and
       Remove photo (clearSlot: the frame is empty again, and a tap on it
       opens "Add to this box").
     • Tools: "Add photos" (the phone's photos, then the honest count),
       "Change layout" (LayoutSheet: "✓ Current" first, the 16% rule, a
       picture of each layout drawn by the page renderer; applyPageLayout,
       asking first when a layout can't hold everything), and "Add or delete
       pages" (addPage / deletePage, never under the 40-page floor).
     • Lines over the page: photos missing on this phone ("Add the photos":
       picked here, back in their places), a swap waiting, "✎ This page is
       yours · Megy, fix this page" (resetStudioPage), and the blank pages
       reminder ("5 pages are blank", Delete / Edit: deletePages).
   Not this part: video memories and QR codes are Phase 6 (a tap on one
   selects it and nothing more); words, quotes and page colours are part 2;
   the cover is part 3.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement } from 'react';
import { REMOVE_PHOTO, CHOICE_WORDS } from '../editorWords';
import { ORDER, registerEditorPart, type EditorContext, type SheetComponent } from '../registry';
import { pendingSwap, startSwap, swapOnTap } from './actions';
import { BlankPagesBanner, MissingPhotosBanner, StudioBanner, SwapBanner } from './banners';
import { FramingOverlay } from './FramingOverlay';
import { pickFromPhone } from './pickFromPhone';
import { FILTER_SHEET, FilterSheet, LAYOUT_SHEET, MASK_SHEET, MaskSheet, PAGES_SHEET, PagesSheet, PICK_SHEET, PickPhotoSheet } from './sheets';
import { ADD_PHOTOS, CHANGE_LAYOUT, FILTER, MASK, MOVE_HINT, PAGES_TOOL, REPLACE_PHOTO, SWAP_PHOTO } from './words';

/** The first few taps on a photo say how to move and zoom it. */
const HINTS = 2;
let hinted = 0;

/* Loaded when first shown: the layout pictures need the page renderer
   (Skia) and the photo trip the Photos step's list (the phone's storage),
   neither of which the tests have. Their logic is in actions.ts / intake.ts. */
/* eslint-disable @typescript-eslint/no-require-imports */
const LayoutSheetLazy: SheetComponent = (props) =>
  createElement((require('./LayoutSheet') as typeof import('./LayoutSheet')).LayoutSheet, props);
function Intake(props: { ctx: EditorContext }) {
  return createElement((require('./IntakeBanner') as typeof import('./IntakeBanner')).IntakeBanner, props);
}
/* eslint-enable @typescript-eslint/no-require-imports */

registerEditorPart({
  id: 'photos',
  taps: [
    // A swap waiting: the next photo or empty frame tapped takes it.
    { kinds: ['photo', 'emptySlot'], order: 10, onTap: swapOnTap },
    {
      kinds: ['photo'], order: 90,
      onTap(target, ctx) {
        // A second tap puts the photo down (on a full-page photo there is no
        // page left around it to tap).
        if (ctx.selected?.key === target.key) { ctx.select(null); return true; }
        if (hinted < HINTS && !pendingSwap()) { hinted++; ctx.say(MOVE_HINT); }
        return false; // the screen selects it
      },
    },
    // MobileReview onTextSlotPhotoTap: a caption box's photo opens "Add a photo".
    {
      kinds: ['boxPhoto'], order: 50,
      onTap(target, ctx) {
        ctx.select(target);
        ctx.openSheet(PICK_SHEET, { kind: 'box', index: target.index });
        return true;
      },
    },
  ],
  addChoices: [{
    // SlotChooser onPhoto: an empty frame's photo, from the "Add a photo" sheet.
    id: 'photo', label: CHOICE_WORDS.photo.label, desc: CHOICE_WORDS.photo.desc, short: 'Photo',
    kinds: ['emptySlot'], order: ORDER.addChoices.photo,
    onPick(target, ctx) { ctx.openSheet(PICK_SHEET, { kind: 'slot', index: target.index }); },
  }],
  selectedActions: [
    { id: 'replace', label: REPLACE_PHOTO, kinds: ['photo'], order: 10, onPress: (t, ctx) => ctx.openSheet(PICK_SHEET, { kind: 'slot', index: t.index }) },
    { id: 'swap', label: SWAP_PHOTO, kinds: ['photo'], order: 20, onPress: (t, ctx) => startSwap(t, ctx) },
    { id: 'mask', label: MASK, kinds: ['photo'], order: 30, onPress: (t, ctx) => ctx.openSheet(MASK_SHEET, { slot: t.index }) },
    { id: 'filter', label: FILTER, kinds: ['photo'], order: 40, onPress: (t, ctx) => ctx.openSheet(FILTER_SHEET, { slot: t.index }) },
    {
      // The website's phone editor: the trash button on every photo (PageView
      // onRemoveFromSlot → clearSlot). One undo step.
      id: 'remove', label: REMOVE_PHOTO, kinds: ['photo'], order: 900, danger: true,
      onPress(target, ctx) { ctx.builder.clearSlot(target.index); },
    },
  ],
  tools: [
    { id: 'addPhotos', label: ADD_PHOTOS, order: ORDER.tools.addPhotos, onPress: () => pickFromPhone() },
    { id: 'changeLayout', label: CHANGE_LAYOUT, order: ORDER.tools.changeLayout, onPress: (ctx) => ctx.openSheet(LAYOUT_SHEET) },
    { id: 'pages', label: PAGES_TOOL, order: 35, wide: true, onPress: (ctx) => ctx.openSheet(PAGES_SHEET) },
  ],
  sheets: {
    pick: PickPhotoSheet,
    layout: LayoutSheetLazy,
    mask: MaskSheet,
    filter: FilterSheet,
    pages: PagesSheet,
  },
  overlays: [FramingOverlay],
  banners: [
    // First over the page, as the website's MissingPhotosBar.
    { id: 'photos-missing', order: 5, Component: MissingPhotosBanner },
    { id: 'photos-swap', order: 10, Component: SwapBanner },
    { id: 'photos-studio', order: 20, Component: StudioBanner },
    { id: 'photos-blank', order: 30, Component: BlankPagesBanner },
    { id: 'photos-intake', order: 90, Component: Intake },
  ],
});
