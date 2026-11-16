/* Which album sizes may a customer choose, given the sizes the owner switched
   off: the pure half of albumSizeOptions.ts (which reads the owner's list
   from the store settings, a browser cache), so the 2.0 app uses the same
   rule with the list it reads itself (src/shared/sharedModules.ts). */
import { ALBUM_SIZES, type AlbumSizeConfig, type AlbumSizePreset } from './types';
import { getTemplatesForAlbum } from './pageTemplates';
import { isMiniSize } from '../../lib/megyMini';

/** Does this size have at least one selectable interior layout? */
export function sizeHasLayouts(size: AlbumSizePreset): boolean {
  return getTemplatesForAlbum(size).length > 0;
}

/** Can this size be offered as an ALBUM size, with `disabled` switched off by
 *  the owner? A5 is the Megy Mini's page, a product of its own, never an
 *  album size (lib/megyMini). */
export function isSizeOfferableAmong(size: AlbumSizePreset, disabled: readonly string[]): boolean {
  return !isMiniSize(size) && !disabled.includes(size) && sizeHasLayouts(size);
}

/** The sizes to show, in ALBUM_SIZES order, with `disabled` switched off. */
export function offerableSizesAmong(disabled: readonly string[]): AlbumSizeConfig[] {
  return ALBUM_SIZES.filter((s) => isSizeOfferableAmong(s.preset, disabled));
}
