/* ══════════════════════════════════════════════════════════════════════════
   PART 3: THE COVER EDITOR, from the "Edit pages" screen.

   This folder is this part's own: the shared screen is reached only through
   registerEditorPart (../registry.ts). The way in is a "Cover" tile before
   page 1 in the page strip (registry stripStart), which opens the cover
   screen: its own route file, src/app/edit-cover.tsx (it sets its own title
   with <Stack.Screen />, so src/app/_layout.tsx needs no line).

     CoverScreen.tsx  the website's CoverEditor on a phone: the cover as print
                      draws it, the Background and Text tabs, Done
     coverEdits.ts    each control's call on the website's builder, the same
                      call with the same arguments as CoverEditor.tsx, only
                      while the builder's cover scope is on
     coverChecks.ts   the website's warnings: a blank cover, a title too long,
                      a title colour that wouldn't show on the cover's colour
     CoverStage.tsx   the cover picture and the finger (move the title, move
                      the photo in its frame)
     Slider.tsx       zoom and size (the website's range inputs)
     throttle.ts      a drag sends at most one change every 100 ms
     words.ts         the website's words (test/editorCover.test.ts)
   The colour pickers and the font list are the words part's
   (../text/ColourPickers.tsx, ../text/FontPicker.tsx): one look, and fonts
   from the internet fetched the same way for a caption and the cover title.

   FRONT only (the spine follows the title, the back is Megy's). The cover is
   not in the album's undo history (the website's Snapshot has no coverFront):
   the cover screen shows no Undo or Redo. While it is on top the builder edits
   the cover (setEditScope('coverFront') on focus, 'interior' on blur); the
   Edit pages screen puts the scope back to 'interior' whenever it is focused.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { registerEditorPart } from '../registry';
import { COVER_TILE } from './words';

/** The cover screen's route (src/app/edit-cover.tsx). */
export const COVER_ROUTE = '/edit-cover';

registerEditorPart({
  id: 'cover',
  stripStart: [{
    id: 'cover',
    label: COVER_TILE,
    order: 10,
    onPress() {
      router.push(COVER_ROUTE);
    },
  }],
});
