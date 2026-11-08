/* The "Page colour" sheet (the website's PageColorSheet, from MobileReview's
   "Page colour" tool): a swatch colours this page (setPageColor); "Use
   <colour> on every page" colours every page and the cover
   (applyPageColorToAllPages), closes, and says so ("Every page is red
   now."). Words that wouldn't show on a colour switch to an ink that does
   (pageColors.recolorPage, inside the builder's actions). */
import { StyleSheet, Text } from 'react-native';
import { pageFillOfKey } from '@web/pages/builder/pageColors';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { colors } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import type { SheetProps } from '../registry';
import { PageColourPicker } from './ColourPickers';
import { everyPageIs, PAGE_COLOUR, PAGE_COLOUR_HINT } from './words';

/** MobileReview's onPick / onPickAll: the website's actions, its line. A key
 *  is a colour's hex or a gradient ('gradient:<id>'). */
export function pickPageColour(b: Pick<BuilderActions, 'setPageColor'>, key: string): void {
  b.setPageColor(key);
}
export function pickPageColourEverywhere(b: Pick<BuilderActions, 'applyPageColorToAllPages'>, key: string, say: (m: string) => void): void {
  b.applyPageColorToAllPages(key);
  say(everyPageIs(pageFillOfKey(key)?.name));
}

export function PageColourSheet({ ctx, close }: SheetProps<unknown>) {
  return (
    <EditorSheet title={PAGE_COLOUR} onClose={close} scroll live testID="page-color-sheet">
      <PageColourPicker background={ctx.page.background}
        onPick={(hex) => pickPageColour(ctx.builder, hex)}
        onPickAll={(hex) => { close(); pickPageColourEverywhere(ctx.builder, hex, ctx.say); }} />
      <Text style={styles.hint}>{PAGE_COLOUR_HINT}</Text>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.muted },
});
