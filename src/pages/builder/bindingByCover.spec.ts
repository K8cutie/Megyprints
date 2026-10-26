import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BINDING_INCHES, HARDBOUND_BINDING_INCHES, bindingInchesFor, bindingMarginFraction, marginForTemplate } from './binding';
import { COVERS } from './types';

/* Owner, 2026-10-25: "for softbind the edge allowance is .375 but for
   hardbound its still .5". The cover is picked at checkout, after the album
   is designed: the editor shows 3/8", a hardbound order's print file 1/2". */
describe('binding side allowance by cover', () => {
  it('softcover 3/8", every hardbound cover 1/2", not chosen yet 3/8"', () => {
    expect(BINDING_INCHES).toBe(0.375);
    expect(HARDBOUND_BINDING_INCHES).toBe(0.5);
    for (const { type } of COVERS) expect(bindingInchesFor(type), type).toBe(type === 'softcover' ? 0.375 : 0.5);
    for (const other of ['hardboundLinen', 'premiumVelvet', 'acrylicLayflat']) expect(bindingInchesFor(other)).toBe(0.5);
    expect(bindingInchesFor(null)).toBe(0.375);
    expect(bindingInchesFor(undefined)).toBe(0.375);
  });

  it('a hardbound page keeps 1/2" at the spine: a full-bleed 6x6 page 1 starts its photo 1/2" in, a framed one 4% + 1/2"', () => {
    expect(bindingMarginFraction('6x6', 0.5)).toBeCloseTo(0.5 / 6, 9);
    const fb = marginForTemplate({ fullBleed: true }, { top: 0, bottom: 0, left: 0, right: 0 }, '6x6', 0, { bindingIn: 0.5 });
    expect(fb).toEqual({ top: 0, bottom: 0, left: 0.5 / 6, right: 0 });
    const framed = marginForTemplate(null, { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 }, '6x6', 1, { bindingIn: 0.5 });
    expect(framed.right).toBeCloseTo(0.04 + 0.5 / 6, 9);
    // No allowance given: the editor's 3/8".
    expect(marginForTemplate({ fullBleed: true }, { top: 0, bottom: 0, left: 0, right: 0 }, '6x6', 0).left).toBeCloseTo(0.375 / 6, 9);
    // A cover panel has no spine gutter, whatever the allowance.
    expect(marginForTemplate({ fullBleed: true }, { top: 0, bottom: 0, left: 0, right: 0 }, '6x6', 0, { noBinding: true, bindingIn: 0.5 }).left).toBe(0);
  });

  it('checkout draws the print file with the ORDER\'s cover: Order → uploadOrderPrintPdf → generateAlbumPdf → every page margin', () => {
    const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    expect(src('../Order.tsx')).toContain('await uploadOrderPrintPdf(order.id, printJob, order.cover, onPrintFile);');
    expect(src('../../lib/orders.ts')).toContain('generateAlbumPdf(job.pages, job.photos, job.albumSize, pages, undefined, bindingInchesFor(cover))');
    const gen = src('./generateAlbumPdf.ts');
    expect(gen).toContain('renderAlbumForPrint(pages, photos, albumSize, onProgress, { bindingIn })');
    expect(gen).toContain('{ bakeWords: true, bindingIn }');
    const pipe = src('./printPipeline.ts');
    expect((pipe.match(/\{ noBinding: coverMode, bindingIn \}/g) ?? []).length).toBe(2);
    expect(pipe).not.toMatch(/\{ noBinding: coverMode \}\)/);
  });
});
