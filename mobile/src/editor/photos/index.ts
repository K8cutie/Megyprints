/* ══════════════════════════════════════════════════════════════════════════
   PART 1: PHOTOS, LAYOUTS AND PAGES in the "Edit pages" screen.

   This folder is this part's own: the shared screen is reached only through
   registerEditorPart (../registry.ts). Add files here; change nothing in
   ../EditPagesScreen.tsx, ../PageStage.tsx or another part's folder (if the
   registry lacks something, add it to registry.ts in a small, separate step).
   Words go in this folder (photos/words.ts), held to the website's source by
   this part's own test (test/editorPhotos*.test.ts; test/editorHarness.ts
   makes an album through the app's steps and taps it).

   To build here, each the website's way and words (MobileReview.tsx), every
   change through ctx.builder (the website's useBuilderState):
   • "Add Photo" in "Add to this box" (addChoices, id 'photo', kinds
     ['emptySlot'], order ORDER.addChoices.photo, CHOICE_WORDS.photo) and a tap on a caption
     box's photo (taps, kinds ['boxPhoto']): the "Add a photo" sheet, every
     album photo tagged with its page ("This page" / "Page 3"), fillSlot (ONE
     PHOTO, ONE PLACE: slotSwap swapNotice said with ctx.say) or
     setTextSlotPhoto.
   • The selected photo (selectedActions, kinds ['photo']): Replace photo,
     move and zoom it in its frame (slotPhotoFit is THE fit; setSlotOffset /
     setSlotScale), Shape and Look (setSlotMask / setSlotLook, the guard
     lines), and Remove photo (below; the website's trash button).
   • Tools: "Add photos" (ORDER.tools.addPhotos: the Photos step's picker,
     then addPhotos with the honest count) and "Change layout"
     (ORDER.tools.changeLayout; LayoutPicker: "✓ Current" first,
     layoutChoicesForPage, the 16% rule; applyPageLayout, layoutChangeLoses).
   • Pages (registry banners): the blank pages reminder ("5 pages are
     blank", Delete / Edit, the 40-page floor: deletePages) and, on a page
     the customer changed (page.studio), "This page is yours · Megy, fix
     this page" (resetStudioPage).
   Moving a frame (updateSlotGeometry, clampSlotGeometry) can be an overlay
   (registry overlays): the page hands it the touches its views claim.
   Gesture Handler and Reanimated are switched off in this app
   (react-native.config.js): PanResponder covers drag and pinch, or turn one
   on there and rebuild.
   Not this part: video memories and QR codes ("Add memory video", a tap on
   a QR) are Phase 6; a tap on one selects it and nothing more for now.
   ══════════════════════════════════════════════════════════════════════════ */
import { registerEditorPart } from '../registry';
import { REMOVE_PHOTO } from '../editorWords';

registerEditorPart({
  id: 'photos',
  selectedActions: [{
    // The website's phone editor: the trash button on every photo (PageView
    // onRemoveFromSlot → clearSlot). One undo step.
    id: 'remove',
    label: REMOVE_PHOTO,
    kinds: ['photo'],
    order: 900,
    danger: true,
    onPress(target, ctx) {
      ctx.builder.clearSlot(target.index);
    },
  }],
});
