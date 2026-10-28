/* The "Page colour" sheet (the website's PageColorSheet, from MobileReview's
   "Page colour" tool): a swatch colours this page (setPageColor); "Use
   <colour> on every page" colours every page and the cover
   (applyPageColorToAllPages), closes, and says so ("Every page is red
   now."). Words that wouldn't show on a colour switch to an ink that does
   (pageColors.recolorPage, inside the builder's actions). */
import { StyleSheet, Text } from 'react-native';
import { pageColorOf, solidPage } from '@web/pages/builder/pageColors';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { colors } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import type { SheetProps } from '../registry';
import { PageColourPicker } from './ColourPickers';
import { everyPageIs, PAGE_COLOUR, PAGE_COLOUR_HINT } from './words';

/** MobileReview's onPick / onPickAll: the website's actions, its line. */
export function pickPageColour(b: Pick<BuilderActions, 'setPageColor'>, hex: string): void {
  b.setPageColor(hex);
}
export function pickPageColourEverywhere(b: Pick<BuilderActions, 'applyPageColorToAllPages'>, hex: string, say: (m: string) => void): void {
  b.applyPageColorToAllPages(hex);
  say(everyPageIs(pageColorOf(solidPage(hex))?.name));
}

export function PageColourSheet({ ctx, close }: SheetProps<unknown>) {
  return (
    <EditorSheet title={PAGE_COLOUR} onClose={close} testID="page-color-sheet">
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
