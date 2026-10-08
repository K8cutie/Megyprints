/* ── Pages, sheets and price per copy ────────────────────────────────────────
   Pages round up to a multiple of 4 (4 pages of 8.5 × 11 print on one 13 × 19
   sheet). The price uses the store's live price schedule for an 8.5 × 11
   album until the owner sets a yearbook price table (build plan §4.3). */
import { DENSITIES, type Density } from './geometry';
import { sectionPageCount, type LayoutCtx } from './layout';
import type { YearbookProject } from './types';
import { priceOf, type PriceSchedule } from '../lib/pricing';

export const PAGES_PER_SHEET = 4;

export const roundPages = (pages: number): number => Math.ceil(Math.max(pages, PAGES_PER_SHEET) / PAGES_PER_SHEET) * PAGES_PER_SHEET;

export interface BookCount {
  sectionPages: number;
  otherPages: number;
  /** Rounded up to whole sheets. */
  totalPages: number;
  sheets: number;
  /** Blank pages added by the rounding (free space for autographs). */
  spare: number;
}

export function countBook(project: YearbookProject, ctx: Omit<LayoutCtx, 'firstPage'>, override?: { sectionId: string; density: Density }): BookCount {
  const sectionPages = project.sections.reduce((n, s) => n + sectionPageCount(s, { ...ctx, firstPage: 1 }, override && override.sectionId === s.id ? override.density : s.density), 0);
  const raw = sectionPages + project.otherPages;
  const totalPages = roundPages(raw);
  return { sectionPages, otherPages: project.otherPages, totalPages, sheets: totalPages / PAGES_PER_SHEET, spare: totalPages - raw };
}

export function pricePerCopy(schedule: PriceSchedule | null, binding: 'soft' | 'hard', pages: number): number | null {
  if (!schedule || !schedule.sizes['8.5x11']) return null;
  return priceOf(schedule, '8.5x11', binding, pages);
}

export interface DensityOption { density: Density; pages: number; price: number | null }

/** Every portrait size for one section, with the whole book's pages and price. */
export function densityOptions(project: YearbookProject, sectionId: string, ctx: Omit<LayoutCtx, 'firstPage'>, schedule: PriceSchedule | null): DensityOption[] {
  return DENSITIES.map((density) => {
    const c = countBook(project, ctx, { sectionId, density });
    return { density, pages: c.totalPages, price: pricePerCopy(schedule, project.binding, c.totalPages) };
  });
}

/** Biggest portraits whose price per copy fits the budget, or null if none do. */
export function fitBudget(options: DensityOption[], budget: number): DensityOption | null {
  const fitting = options.filter((o) => o.price !== null && o.price <= budget);
  if (!fitting.length) return null;
  return fitting.reduce((a, b) => (b.density < a.density ? b : a));
}
