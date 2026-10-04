/* ── Jump to the top of the page, NOW ──────────────────────────────────────
   The site scrolls through Lenis (smooth scrolling) with CSS
   scroll-behavior: smooth on top, so a plain window.scrollTo(0, 0) either
   animates or is pulled back by Lenis' own target. A new screen (checkout's
   payment and thank-you steps) must OPEN at its top — the testers' phones
   were left at the footer, the order number and amount out of sight. The
   Layout registers its Lenis here; scrollPageToTop() moves it instantly. */

interface Scroller { scrollTo: (target: number, opts?: { immediate?: boolean; force?: boolean }) => void }

let active: Scroller | null = null;

export function registerPageScroller(s: Scroller | null): void { active = s; }

export function scrollPageToTop(): void {
  try { active?.scrollTo(0, { immediate: true, force: true }); } catch { /* fall through */ }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
}
