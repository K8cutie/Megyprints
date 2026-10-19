/* ══════════════════════════════════════════════════════════════════════════
   pressSheetFiles — the console's "Print sheets" / "Cover sheet" buttons.

   Reads an order's print files from the private print-pdfs bucket (operators
   only), lays them out on the shop's 12.5 × 19 sheet (printSheetPdf) and hands
   the result to the browser as a download. pdf-lib only loads here, on the
   first click, so customers never download it.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase';
import { printFilesOf, type AdminOrder } from './adminOrders';
import { ALBUM_SIZES, type AlbumSizePreset, type CoverType } from '../pages/builder/types';

type PrintOrder = Pick<AdminOrder, 'id' | 'copy_of_order_id' | 'order_number' | 'album_size' | 'cover' | 'page_count'>;

async function readPrintFile(path: string, what: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('print-pdfs').download(path);
  if (error || !data) throw new Error(`The ${what} isn't in storage for this order yet.`);
  return data.arrayBuffer();
}

function sizeOf(o: PrintOrder): AlbumSizePreset {
  const size = ALBUM_SIZES.find((s) => s.preset === o.album_size)?.preset;
  if (!size) throw new Error(`This order's album size (${o.album_size ?? 'none'}) isn't one we print.`);
  return size;
}

/** The press-sheet tool, loaded on first use. After a deploy the old file is
 *  gone from the server: say so in words instead of a module error. */
async function pressTools() {
  try {
    return await import('../pages/builder/printSheetPdf');
  } catch {
    throw new Error('The console was updated. Reload this page and try again.');
  }
}

/** Give the browser a file to save. */
export function saveFile(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download the album pages laid out on press sheets. Returns what to tell the
 *  operator (sheet count, and a warning if the file and the order disagree). */
export async function downloadAlbumSheets(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  const src = await readPrintFile(`${printFilesOf(o)}.pdf`, 'print file');
  const { imposeAlbumSheets } = await pressTools();
  const { bytes, plan } = await imposeAlbumSheets(src, size, o.order_number);
  saveFile(bytes, `megyprints-${o.order_number}-sheets.pdf`);
  const piles = plan.layout.leavesPerSheet;
  const note = `${plan.sheets} sheets, both sides · cut into ${piles} ${piles === 1 ? 'pile' : 'piles'}, then stack pile 1 on top`;
  return plan.pageCount === o.page_count
    ? note
    : `${note}. Check: the print file has ${plan.pageCount} pages, the order says ${o.page_count}.`;
}

/** Download the flat cover on one press sheet. */
export async function downloadCoverSheet(o: PrintOrder): Promise<string> {
  const size = sizeOf(o);
  // Any cover but softcover binds as a hardcover (coverGeometry.isHardcover).
  const cover = (o.cover || 'softcover') as CoverType;
  const src = await readPrintFile(`${printFilesOf(o)}-cover.pdf`, 'cover file');
  const { imposeCoverSheet } = await pressTools();
  const { bytes } = await imposeCoverSheet(src, size, cover, o.page_count, o.order_number);
  saveFile(bytes, `megyprints-${o.order_number}-cover-sheet.pdf`);
  return 'Cover sheet: print one side only';
}

/** Download the one-sheet printer check. */
export async function downloadPressTestSheet(): Promise<void> {
  const { pressTestSheet } = await pressTools();
  saveFile(await pressTestSheet(), 'megyprints-press-test-sheet.pdf');
}
