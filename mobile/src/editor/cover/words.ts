/* The cover editor's words: the website's own for the same control
   (CoverEditor.tsx, PageColorPicker.tsx, TextColorPicker.tsx, FontList.tsx:
   .tsx files with the website's icons, so they can't be shared as they are).
   test/editorCover.test.ts fails if one stops matching the website's source.
   Words the website has no control for are marked APP below, and kept plain. */

/** CoverEditor.tsx: the header, and the one-photo line under it. */
export const DESIGN_YOUR_COVER = 'Design your cover';
export const ONE_PHOTO = 'Pick 1 photo for the front cover';
/** CoverEditor.tsx: the line under the cover (the back is Megy's). */
export const BACK_NOTE = 'The back cover carries the Megy Prints mark in your cover colour.';
/** BuilderPreview.tsx: the caption under the closed book. */
export const FRONT_COVER = 'Front cover';

/** CoverEditor.tsx: the two tabs. */
export const TABS = { background: 'Background', text: 'Text' } as const;

/** CoverEditor.tsx Background tab. */
export const YOUR_PHOTOS = 'Your photos, best ones first. Tap one.';
export const SHOW_FEWER = 'Show fewer';
export const showAllPhotos = (n: number) => `Show all ${n} photos`;
export const COLOUR = 'Colour';
export const ZOOM = 'Zoom';
export const RESET = 'Reset';
export const DRAG_HINT = 'Drag the cover above to reposition the photo.';
export const REMOVE_PHOTO = 'Remove photo';
/** PageColorPicker.tsx: the button under the swatches once one is chosen. */
export const useOnEveryPage = (colourName: string) => `Use ${colourName.toLowerCase()} on every page`;

/** CoverEditor.tsx Text tab. */
export const COVER_TITLE = 'Cover title';
export const TITLE_PLACEHOLDER = 'e.g. The Cruz Family';
export const tooLongLine = (canShrink: boolean) =>
  `Too long for the front cover: part of it will be cut off in print. Shorten it${canShrink ? ', or make the text smaller' : ''}.`;
export const makeItFit = (size: number) => `Make it fit (size ${size})`;
export const FONT = 'Font';
export const ALIGNMENT = 'Alignment';
/** CoverEditor.tsx: each alignment button's title. */
export const alignLabel = (a: 'left' | 'center' | 'right') => `Align ${a}`;
/** APP: the alignment buttons' visible words (the website shows icons). */
export const ALIGN_WORDS = { left: 'Left', center: 'Center', right: 'Right' } as const;
export const STYLE = 'Style';
export const BOLD = 'Bold';
export const ITALIC = 'Italic';
export const SHADOW = 'Shadow';
/** CoverEditor.tsx: the Shadow button's title. */
export const SHADOW_HINT = 'Shadow under the words';
export const SIZE = 'Size';
export const sizeLine = (px: number) => `${px}px`;
/** CoverEditor.tsx (as a dialog): the one way out. */
export const DONE = 'Done';
/** FontList.tsx: the font list's name. */
export const FONTS_LABEL = 'Fonts';

/** APP: the tile before page 1 in the "Edit pages" strip that opens this
 *  editor (the website opens it from the Preview's "Edit cover"). */
export const COVER_TILE = 'Cover';
export const EDIT_COVER = 'Edit cover';

/** APP: the title's colour doesn't show on the cover's colour (the website's
 *  3:1 bar, pageColors.readsOn; its words follow the spine's note, "Your
 *  colour wouldn't show on the spine"). The button names the ink that shows. */
export const TITLE_HARD_TO_SEE = "Your colour wouldn't show on this cover colour.";
export const useInk = (colourName: string) => `Use ${colourName.toLowerCase()}`;
