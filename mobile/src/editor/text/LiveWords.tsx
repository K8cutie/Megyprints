/* Words placed by hand as a finger moves them (on a page or on the cover):
   drawn on the screen at once, where the finger has them, in their font,
   colour, size and shape, plain letters (no outline or second colour) until
   the finger lets go and the page is drawn with them, as the cover title is
   (CoverStage). A free text's box: lines from its top, as print draws it. */
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { TextElement } from '@web/pages/builder/types';
import { curveCentreX, curveGlyphs, TEXT_LINE_HEIGHT, WORDART_FLOAT, WORDART_SHADOW } from '@web/pages/builder/wordArtRules';
import { freeTextBoxWidth } from '@web/pages/builder/wordArtRules';
import type { PageText } from '../../render/pageText';
import { fontStore } from './fonts/appFonts';

export function LiveWords({ words, x, y, k, text, onCover = false, testID = 'live-words' }: {
  words: TextElement;
  /** Where the words are now (design px). */
  x: number;
  y: number;
  /** Screen px per design px. */
  k: number;
  /** The page fonts, for a curve's letters (null: the words on one line). */
  text: PageText | null;
  onCover?: boolean;
  testID?: string;
}) {
  const size = Math.max(6, (words.fontSize || 24) * k);
  const ui = fontStore.uiFont(words.fontFamily, words.bold, words.italic);
  const align = words.alignment ?? 'center';
  const shadow = words.glow
    ? { textShadowColor: words.glow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: size * 0.25 }
    : onCover && words.shadow !== false
      ? { textShadowColor: WORDART_FLOAT.color, textShadowOffset: { width: 0, height: WORDART_FLOAT.offsetY * size }, textShadowRadius: WORDART_FLOAT.blur * size }
      : words.shadow
        ? { textShadowColor: WORDART_SHADOW.color, textShadowOffset: { width: WORDART_SHADOW.offsetX * k, height: WORDART_SHADOW.offsetY * k }, textShadowRadius: WORDART_SHADOW.blur * k }
        : {};
  const style: TextStyle = {
    fontFamily: ui.fontFamily, fontWeight: ui.fontWeight, fontStyle: ui.fontStyle, color: words.color || '#2D2D2D',
    fontSize: size, lineHeight: size * TEXT_LINE_HEIGHT, textAlign: align,
    textDecorationLine: words.underline ? 'underline' : 'none', ...shadow,
  };
  const boxW = freeTextBoxWidth(words) * k;
  const curve = words.curve && text
    ? curveGlyphs(words.text, text.measurer({ family: words.fontFamily, size, bold: words.bold, italic: words.italic }), size, words.curve)
    : null;
  return (
    <View pointerEvents="none" testID={testID} style={[styles.box, { left: x * k, top: y * k, width: boxW }]}>
      {curve ? (() => {
        const anchor = align === 'left' ? 0 : align === 'right' ? boxW : boxW / 2;
        const cx = curveCentreX(anchor, align, curve.width);
        const cy = (size * TEXT_LINE_HEIGHT) / 2;
        const cell = size * 2;
        return curve.glyphs.map((g, i) => (
          <Text key={i} style={[style, styles.letter, {
            width: cell, height: cell, lineHeight: cell, left: cx + g.x - cell / 2, top: cy + g.y - cell / 2,
            transform: [{ rotate: `${g.angle}rad` }],
          }]}>{g.text}</Text>
        ));
      })() : <Text style={style}>{words.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', overflow: 'visible' },
  letter: { position: 'absolute', textAlign: 'center', textAlignVertical: 'center' },
});
