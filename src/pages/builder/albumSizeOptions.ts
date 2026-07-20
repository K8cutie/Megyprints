import { ALBUM_SIZES, type AlbumSizeConfig, type AlbumSizePreset } from './types';
import { getTemplatesForAlbum } from './pageTemplates';
import { getDisabledSizes } from '../../lib/storeSettings';

/** ══════════════════════════════════════════════════════════════════════════
 *  Which album sizes may a customer actually choose?
 *
 *  TWO independent gates, and every size picker must honour both:
 *    1. OWNER curation — sizes switched off in /admin (store_settings).
 *    2. LAYOUT SUPPLY — a size with zero selectable page layouts cannot build
 *       an album at all. This is the honest guard while a size is being
 *       re-authored (see PER_SIZE_AUTHORED / templates6x6.ts): the size drops
 *       out of the picker instead of the builder dealing blank pages or
 *       crashing on an empty template pool, and it comes back automatically the
 *       moment its first layout is authored.
 *  ══════════════════════════════════════════════════════════════════════════ */

/** Does this size have at least one selectable interior layout? */
export function sizeHasLayouts(size: AlbumSizePreset): boolean {
  return getTemplatesForAlbum(size).length > 0;
}

/** Can this size be offered to a customer right now? */
export function isSizeOfferable(size: AlbumSizePreset): boolean {
  return !getDisabledSizes().includes(size) && sizeHasLayouts(size);
}

/** The size cards/choices to show, in ALBUM_SIZES order. */
export function offerableAlbumSizes(): AlbumSizeConfig[] {
  return ALBUM_SIZES.filter((s) => isSizeOfferable(s.preset));
}

/** Why a size isn't offered — for operator-facing surfaces (/admin) that should
 *  explain the difference between "you switched it off" and "it has no layouts". */
export function sizeUnavailableReason(size: AlbumSizePreset): 'disabled' | 'no-layouts' | null {
  if (getDisabledSizes().includes(size)) return 'disabled';
  if (!sizeHasLayouts(size)) return 'no-layouts';
  return null;
}
