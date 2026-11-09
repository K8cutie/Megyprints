/* Words on the photo screens that are not counts (those live with the logic:
   photoDraft.photoStep, pickerProgress). Plain English for second-language
   readers: say what happens, no taglines. */

import { Platform } from 'react-native';

const IPHONE = Platform.OS === 'ios';

/** Asked before the phone's own photo-access question. */
export const ASK_LINE = 'Megy Prints needs to see your photos so you can pick them for your album.';
export const ALLOW_PHOTOS = 'Allow access to photos';

/** "Choose from Files": Android only (filePhotos FILES_OFFERED). */
export const FILES_INSTEAD = 'Choose from Files instead';
export const FILES = 'Choose from Files';
export const FILES_WORKS = 'You can also choose photos from Files. That works without photo access.';

/** Where photo access is turned on, in the phone's own Settings words
 *  ("Open Settings" opens the app's own page on both). */
export const SETTINGS_HOW = IPHONE
  ? 'To turn it on: open Settings, then Photos, then tap Full Access.'
  : 'To turn it on: open Settings, then Permissions, then Photos and videos.';

/** Limited access: Android 14+ "Allow limited access", iPhone "Limited Access". */
export const LIMITED_TITLE = 'Megy Prints can see only the photos you chose.';
export const CHOOSE_MORE = 'Choose more photos';
export const LIMITED_HOW = IPHONE
  ? 'To show all your photos: open Settings, then Photos, then tap Full Access.'
  : 'To show all your photos: open Settings, then Permissions, then Photos and videos, then tap Allow all.';

export const ALREADY_IN = 'That photo is already in your album.';
export const TAP_TO_PICK = 'Tap the photos you want, or Select all.';
export const ALL_IN_ALBUM = 'Every photo here is already in your album.';

/** Your photos, when the album saved on the phone could not be opened (it is
 *  kept aside, never written over). */
export const COULD_NOT_OPEN = 'The photos you picked before could not be opened. Please pick your photos again.';
