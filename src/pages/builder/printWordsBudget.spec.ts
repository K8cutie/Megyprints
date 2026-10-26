// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rgbaToPng } from '../../lib/rgbaPng';

/* Sharp words (printWords.spec) add a little to every page that has words. The
   storage plan takes 50 MB a file: if the words would tip the print file past
   that, it is made the old way (words drawn into the page pictures) rather
   than not arriving at the shop at all. */

const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCKiiivjz74/9k='), (c) => c.charCodeAt(0));
const WORD = { png: rgbaToPng(new Uint8Array(4 * 4 * 4).fill(255), 4, 4), x: 0.1, y: 0.1, w: 0.2, h: 0.05 };

const renderAlbumForPrint = vi.fn();
vi.mock('./printPipeline', () => ({
  renderAlbumForPrint: (...a: unknown[]) => renderAlbumForPrint(...a),
  renderCoverWrapForPrint: vi.fn(),
}));

/** The PDF's bytes as text (jsdom's Blob has no .text()). */
const textOf = (b: Blob) => new Promise<string>((resolve) => { const f = new FileReader(); f.onload = () => resolve(f.result as string); f.readAsBinaryString(b); });
const pageOf = (words: typeof WORD[]) => ({ pageIndex: 0, image: new Blob([JPEG], { type: 'image/jpeg' }), words, filename: 'p.jpg' });

describe('generateAlbumPdf — never past the upload cap because of sharp words', () => {
  beforeEach(() => {
    renderAlbumForPrint.mockReset();
    renderAlbumForPrint.mockImplementation(async (_p, _ph, _s, _on, opts?: { bakeWords?: boolean }) =>
      [pageOf(opts?.bakeWords ? [] : [WORD]), pageOf([])]);
  });

  it('under the cap: one pass, words on top', async () => {
    const { generateAlbumPdf } = await import('./generateAlbumPdf');
    const pdf = await generateAlbumPdf([], [], '8x8');
    expect(renderAlbumForPrint).toHaveBeenCalledTimes(1);
    expect(await textOf(pdf)).toMatch(/\/SMask \d+ 0 R/); // the word picture is in
  });

  it('over the cap: made again with the words in the page pictures', async () => {
    const { generateAlbumPdf } = await import('./generateAlbumPdf');
    const pdf = await generateAlbumPdf([], [], '8x8', undefined, 100);
    expect(renderAlbumForPrint).toHaveBeenCalledTimes(2);
    expect(renderAlbumForPrint.mock.calls[1][4]).toEqual({ bakeWords: true });
    expect(await textOf(pdf)).not.toMatch(/\/SMask/);
  });

  it('the second pass tells the progress bar it is the "smaller" pass, so the bar never starts over', async () => {
    const { generateAlbumPdf } = await import('./generateAlbumPdf');
    const seen: unknown[][] = [];
    const onProgress = (...a: unknown[]) => { seen.push(a); };
    await generateAlbumPdf([], [], '8x8', onProgress, 100);
    expect(renderAlbumForPrint.mock.calls[0][3]).toBe(onProgress);
    (renderAlbumForPrint.mock.calls[1][3] as (d: number, t: number) => void)(4, 70);
    expect(seen).toEqual([[4, 70, true]]);
  });

  it('over the cap with no words anywhere: nothing to take back, one pass', async () => {
    renderAlbumForPrint.mockImplementation(async () => [pageOf([]), pageOf([])]);
    const { generateAlbumPdf } = await import('./generateAlbumPdf');
    await generateAlbumPdf([], [], '8x8', undefined, 100);
    expect(renderAlbumForPrint).toHaveBeenCalledTimes(1);
  });

  it('the cap leaves room under the storage plan\'s 50 MB a file', async () => {
    const { PRINT_FILE_BUDGET_BYTES } = await import('./generateAlbumPdf');
    expect(PRINT_FILE_BUDGET_BYTES).toBeLessThan(50 * 1000 * 1000);
  });
});
