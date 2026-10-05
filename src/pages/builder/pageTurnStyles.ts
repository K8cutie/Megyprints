/* The look of a page turn in words: the editor's PageTurnBar and the book
   preview's PreviewTurnBar share it, so the two can't drift apart. */

export type PageTurnVariant = 'phone' | 'desktop';

export const PAGE_TURN_STYLES: Record<PageTurnVariant, { row: string; prev: string; next: string; done: string; prevIcon: number; nextIcon: number; doneIcon: number | null }> = {
  // Thumb zone: full-width row, Next/Done take what Previous leaves. On a
  // 360-px phone the last page has 320 px for both buttons: "Previous page"
  // needs ~138, so Done drops its ✓ (the green + "Done" say it) and steps to
  // 13 px under 375 px wide — one line from 360 px up. (A 320-px phone has
  // no room for one line at a readable size; there it is two centred lines.)
  phone: {
    row: 'flex items-center gap-2',
    prev: 'h-12 shrink-0 px-3 rounded-xl bg-cream text-medium text-sm font-semibold flex items-center justify-center gap-0.5 active:scale-[0.98] transition-transform',
    next: 'flex-1 min-w-0 h-12 rounded-xl bg-peach text-white text-base font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform',
    done: 'flex-1 min-w-0 h-12 px-1 rounded-xl bg-success text-white text-sm max-[374px]:text-[13px] font-bold leading-tight text-center flex items-center justify-center active:scale-[0.98] transition-transform',
    prevIcon: 18, nextIcon: 20, doneIcon: null,
  },
  // Under the canvas: centred, sized to the words.
  desktop: {
    row: 'flex items-center justify-center gap-2',
    prev: 'h-10 px-4 rounded-xl bg-white border border-line text-medium text-sm font-semibold flex items-center gap-1 hover:bg-blush hover:text-blush-pink hover:border-peach transition-colors shadow-md',
    next: 'h-10 px-5 rounded-xl bg-peach text-white text-sm font-bold flex items-center gap-1 hover:brightness-105 transition-all shadow-md',
    done: 'h-10 px-5 rounded-xl bg-success text-white text-sm font-bold flex items-center gap-1.5 hover:brightness-105 transition-all shadow-md',
    prevIcon: 18, nextIcon: 18, doneIcon: 16,
  },
};
