/* ══════════════════════════════════════════════════════════════════════════
   BOLD TEXT — Megy's messages mark key words with **double asterisks**
   ("I'm **Megy**", "Right now it's **8x8**"). splitBold cuts a message into
   plain and bold runs so the panel can show the bold ones as <strong> instead
   of printing the asterisks. Every run is rendered as a React text node, so
   nothing is ever parsed as HTML — an album name the customer typed stays
   plain text.

   A ** pairs with the next ** on the same line. An unpaired **, and a single
   *, is shown as typed.
   ══════════════════════════════════════════════════════════════════════════ */

export interface TextRun {
  text: string;
  bold: boolean;
}

// The capture group makes split() keep the bold words: they land at the odd indexes.
const BOLD = /\*\*(.+?)\*\*/;

export function splitBold(text: string): TextRun[] {
  return text
    .split(BOLD)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((run) => run.text !== '');
}
