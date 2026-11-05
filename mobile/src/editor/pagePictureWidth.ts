import { PixelRatio } from 'react-native';
import { space } from '../lib/theme';

/** A page's picture in the editor is drawn for the widest the page can be on
 *  this phone (the short side: the same either way up), so a bar coming or
 *  going or the phone turning never draws it again, and "Edit text" opens on
 *  the picture the editor already has. */
export function editorPictureWidth(screenW: number, screenH: number): number {
  return Math.min(1400, Math.round((Math.min(screenW, screenH) - space.md * 2) * PixelRatio.get()));
}
