/** Draws words as pictures, so a press sheet needs no font (the shop's
 *  printer had none of ours, 2026-10-21). The console's is a canvas
 *  (lib/canvasTextPainter); printSheetPdf places what it draws. Sizes are in
 *  points. Its own file so the painter never imports the pdf-lib module. */
export interface TextPainter {
  /** How wide the words are at this size. */
  width(text: string, sizePt: number, bold?: boolean): number;
  /** The words as a PNG on a clear background, and its size; `descentPt` is
   *  how far it reaches below the baseline. */
  png(text: string, sizePt: number, color: string, bold?: boolean): { bytes: Uint8Array; wPt: number; hPt: number; descentPt: number };
}
