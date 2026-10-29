/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE COVER EDITOR WARNS ABOUT, from the website's own rules (shared):
     • a blank front cover (orderReadiness.coverIsBlank, BLANK_COVER_MESSAGE:
       the website says it when Order is pressed, and "Show me" opens the
       cover editor; here it shows on the cover while the cover is blank);
     • a title too long for its box (textFit.coverTitleFit, CoverEditor's
       "Too long for the front cover" with "Make it fit (size N)"), measured
       only when the title's font is one the app has: measured in the phone's
       own font instead, the answer would be a guess (the album-cover step
       does the same);
     • a title colour that wouldn't show on the cover's colour (pageColors:
       the website's 3:1 bar, the ink that shows). A colour swatch already
       switches such a title for you (setPageColor → recolorPage); this
       catches a title colour picked after the cover's colour. A photo cover
       is not judged: its title floats on the shadow.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { coverIsBlank } from '@web/pages/builder/orderReadiness';
import { DARK_INK, inkFor, PAGE_WHITE } from '@web/pages/builder/pageColors';
import { coverTitleFit } from '@web/pages/builder/textFit';
import type { Measurer } from '@web/pages/builder/textFit';
import { bundledFace, familyFaces } from '../../render/fontTable';

export { BLANK_COVER_MESSAGE } from '@web/pages/builder/orderReadiness';

export function coverBlank(cover: AlbumPage): boolean {
  return coverIsBlank(cover);
}

/** The title's own font is one the app has (so it is measured as printed). */
export function titleFontInApp(cover: AlbumPage): boolean {
  const family = cover.textElements?.find((t) => t.boxIndex === 0)?.fontFamily;
  const first = familyFaces(family)[0];
  return !!first && bundledFace(first) !== null;
}

/** "Too long for the front cover", or null when it fits or can't be told. */
export function titleTooLong(cover: AlbumPage, albumSize: AlbumSizePreset, measurer: Measurer | null): { fitsAt: number | null } | null {
  if (!titleFontInApp(cover)) return null;
  const fit = coverTitleFit(cover, albumSize, measurer);
  return fit && !fit.fits ? { fitsAt: fit.fitsAt ?? null } : null;
}

/** The ink the title should switch to, when its colour wouldn't show on the
 *  cover's plain colour; null when it shows (or the cover is a photo). */
export function titleInkNeeded(cover: AlbumPage): string | null {
  const bg = cover.background;
  if (bg?.type !== 'solid') return null;
  const el = cover.textElements?.find((t) => t.boxIndex === 0);
  if (!el || !(el.text ?? '').trim()) return null;
  const own = el.color || DARK_INK;
  const ink = inkFor(el, bg.solid || PAGE_WHITE);
  return ink === own ? null : ink;
}
