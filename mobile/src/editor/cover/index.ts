/* ══════════════════════════════════════════════════════════════════════════
   PART 3: THE COVER EDITOR, from the "Edit pages" screen.

   This folder is this part's own: the shared screen is reached only through
   registerEditorPart (../registry.ts). Add files here (and its screen as a
   NEW route file, e.g. src/app/edit-cover.tsx, which sets its own title with
   <Stack.Screen options={…} /> so src/app/_layout.tsx needs no line); change
   nothing in ../EditPagesScreen.tsx, ../PageStage.tsx or another part's
   folder (if the registry lacks something, add it to registry.ts in a
   small, separate step). Words go in this folder (cover/words.ts), held to
   the website's source by this part's own test (test/editorCover*.test.ts;
   test/editorHarness.ts makes an album through the app's steps).

   To build here, the website's CoverEditor (FRONT only; the spine follows
   the title, the back is Megy's), every change through ctx.builder:
   • The way in: a "Cover" tile before page 1 in the page strip (registry
     stripStart), opening the cover screen.
   • While the cover screen is focused the builder edits the cover
     (setEditScope('coverFront') on focus, 'interior' on blur: useFocusEffect,
     as src/app/album-cover.tsx does). The Edit pages screen puts the scope
     back to 'interior' whenever it is focused, so a page edit can never land
     on the cover.
   • Background: the album's photos (setCoverToPhoto), the focal point and
     zoom (setBackgroundCrop), page colours (setPageColor under the cover
     scope). Text: the title (setBoxText box 0), its font and colour, moved
     with setBoxTextOffset; the cover's float shadow.
   • The cover is NOT in the undo history (the website's Snapshot has no
     coverFront): show no Undo or Redo on the cover screen. A cover change
     still adds an undo step that changes nothing (the website does the
     same: test/editorUndo.test.ts pins it).
   • Taps on the cover, if wanted: pageTargets({ coverMode: true }) (a title
     moved by its offset is hit where it is drawn; empty boxes take no tap)
     and selection with the page key 'cover'.
   ══════════════════════════════════════════════════════════════════════════ */
import { registerEditorPart } from '../registry';

registerEditorPart({ id: 'cover' });
