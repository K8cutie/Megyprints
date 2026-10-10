/* ══════════════════════════════════════════════════════════════════════════
   useModalDialog — a dialog that a keyboard (and a screen reader) can use.

   1-star testers round 2 (KB-2): opening Sign Up left focus on the button
   behind it; Tab walked the blurred page underneath (31 presses to reach
   "Full Name"); Escape did nothing in Log In, Choose a layout or Add a video
   memory; and after a dialog closed, focus fell to the page itself.

   Attach the returned ref to the dialog's panel (with role="dialog",
   aria-modal="true", a name, and tabIndex={-1}). While `open`:
     • focus moves in — to [data-autofocus] if there is one, else the first
       control, else the panel;
     • Tab and Shift+Tab stay inside;
     • Escape closes (when `onClose` is given) — after any open dropdown in
       it (aria-expanded="true"), which takes that Escape itself;
     • on close, focus goes back to whatever opened it.
   Dialogs over dialogs: only the top one answers the keyboard.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** The controls in `root` a Tab can reach, in order (hidden ones left out). */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert],[aria-hidden="true"],[hidden]')) return false;
    // Real browsers: skip display:none / visibility:hidden (e.g. a hidden file
    // input). jsdom has no layout, so there everything counts as visible.
    const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
    return typeof check === 'function' ? check.call(el, { visibilityProperty: true }) : true;
  });
}

/** Open dialogs, oldest first, with their panels. */
const stack: { id: symbol; panel: () => HTMLElement | null }[] = [];

/** The dialog the keyboard talks to: the newest one with no other open
 *  dialog inside it (a dialog mounted inside another, at the same time, runs
 *  its effects first — so "newest" alone would pick the outer one). */
function topDialog(): symbol | undefined {
  const open = stack.map((d) => ({ ...d, el: d.panel() }));
  const leaves = open.filter((d) => !open.some((o) => o !== d && o.el && d.el && d.el !== o.el && d.el.contains(o.el)));
  return leaves[leaves.length - 1]?.id;
}

export function useModalDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const me = Symbol('dialog');
    stack.push({ id: me, panel: () => ref.current });
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onTop = () => topDialog() === me;

    // Into the dialog — after it has rendered (and after any autoFocus inside it).
    const focusIn = window.setTimeout(() => {
      const panel = ref.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusablesIn(panel)[0] ?? panel;
      target.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      const panel = ref.current;
      if (!panel || !onTop()) return;
      if (e.key === 'Escape') {
        if (!closeRef.current) return;
        // An open dropdown inside (the font list) closes first, on its own.
        if (panel.querySelector('[aria-expanded="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusablesIn(panel);
      const active = document.activeElement;
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!(active instanceof Node) || !panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      window.clearTimeout(focusIn);
      document.removeEventListener('keydown', onKey, true);
      const i = stack.findIndex((d) => d.id === me);
      if (i >= 0) stack.splice(i, 1);
      // Back where the customer was — if that button is still on the page.
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  return ref;
}
