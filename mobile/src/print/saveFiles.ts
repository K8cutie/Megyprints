/* ══════════════════════════════════════════════════════════════════════════
   WHERE THE APP PUTS THE PRINT FILES IT MADE: a folder of its own on the
   phone, one per order (print/<order number>/), under the names the console
   saves them with (pressSheetFiles: "megyprints-<order>.pdf", "-cover.pdf",
   "-sheets.pdf", "-cover-sheet.pdf", "-jpeg.zip"). Nothing is uploaded here:
   sending them to the print bucket at checkout is a later step of the port.
   ══════════════════════════════════════════════════════════════════════════ */

import type { PrintFiles } from './printFiles';

/** Somewhere files can be written (the app's folder; a map in a test). */
export interface PrintFolder {
  write(name: string, bytes: Uint8Array): Promise<void>;
}

/** The files' names, as the console names its downloads. */
export function printFileNames(orderNumber: string) {
  const base = `megyprints-${orderNumber}`;
  return {
    interior: `${base}.pdf`,
    cover: `${base}-cover.pdf`,
    sheets: `${base}-sheets.pdf`,
    coverSheet: `${base}-cover-sheet.pdf`,
    jpegZip: `${base}-jpeg.zip`,
  } as const;
}

/** Writes every file there is (a missing cover is left out) and returns what
 *  was written, name → bytes. */
export async function savePrintFiles(folder: PrintFolder, orderNumber: string, files: PrintFiles): Promise<Record<string, number>> {
  const names = printFileNames(orderNumber);
  const all: [string, Uint8Array | null][] = [
    [names.interior, files.interiorPdf],
    [names.cover, files.coverPdf],
    [names.sheets, files.sheetsPdf],
    [names.coverSheet, files.coverSheetPdf],
    [names.jpegZip, files.jpegZip],
  ];
  const written: Record<string, number> = {};
  for (const [name, bytes] of all) {
    if (!bytes) continue;
    await folder.write(name, bytes);
    written[name] = bytes.length;
  }
  return written;
}

/** The app's own folder for an order's print files (expo-file-system). */
export async function appPrintFolder(orderNumber: string): Promise<PrintFolder> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const safe = orderNumber.replace(/[^A-Za-z0-9-]/g, '_');
  const dir = new Directory(Paths.document, 'print', safe);
  if (!dir.exists) dir.create({ intermediates: true });
  return { write: async (name, bytes) => { await new File(dir, name).write(bytes); } };
}
