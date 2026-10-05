// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useModalDialog } from './useModalDialog';
import RemoveGraphicModal from '../pages/builder/RemoveGraphicModal';
import SlotChooser from '../pages/builder/SlotChooser';

/* ══════════════════════════════════════════════════════════════════════════
   DIALOGS A KEYBOARD CAN USE (1-star testers round 2, KB-2): Sign Up opened
   with focus left on the button behind it, Tab walked the page underneath
   (31 presses to "Full Name"), Escape closed nothing, and closing dropped
   focus on the page. Now every dialog takes focus, keeps Tab inside, closes
   on Escape and hands focus back.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

const key = (k: string, shift = false) => act(() => {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
});
const settle = () => act(() => { vi.advanceTimersByTime(10); });
const focused = () => (document.activeElement as HTMLElement | null)?.dataset.t ?? document.activeElement?.tagName;

function Dialog({ onClose, children, autofocusSecond }: { onClose?: () => void; children?: ReactNode; autofocusSecond?: boolean }) {
  const ref = useModalDialog<HTMLDivElement>(true, onClose);
  return createElement('div', { ref, role: 'dialog', 'aria-modal': 'true', tabIndex: -1 },
    createElement('button', { 'data-t': 'first' }, 'First'),
    createElement('button', { 'data-t': 'second', 'data-autofocus': autofocusSecond ? true : undefined }, 'Second'),
    createElement('button', { 'data-t': 'last' }, 'Last'),
    children);
}
function Page({ onClose, autofocusSecond, inner }: { onClose?: () => void; autofocusSecond?: boolean; inner?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return createElement('div', null,
    createElement('button', { 'data-t': 'opener', onClick: () => setOpen(true) }, 'Open'),
    createElement('button', { 'data-t': 'behind' }, 'Behind'),
    open && createElement(Dialog, { onClose: () => { onClose?.(); setOpen(false); }, autofocusSecond }, inner));
}
const openIt = async () => {
  const opener = host.querySelector<HTMLButtonElement>('[data-t="opener"]')!;
  opener.focus();
  act(() => { opener.click(); });
  settle();
};

describe('useModalDialog', () => {
  it('focus moves into the dialog — to [data-autofocus], else the first control', async () => {
    act(() => { root.render(createElement(Page)); });
    await openIt();
    expect(focused()).toBe('first');
    act(() => { root.render(createElement(Page, { autofocusSecond: true })); });
  });
  it('[data-autofocus] wins', async () => {
    act(() => { root.render(createElement(Page, { autofocusSecond: true })); });
    await openIt();
    expect(focused()).toBe('second');
  });
  it('Tab and Shift+Tab stay inside: from the last to the first, from the first to the last', async () => {
    act(() => { root.render(createElement(Page)); });
    await openIt();
    key('Tab', true);
    expect(focused()).toBe('last');
    key('Tab');
    expect(focused()).toBe('first');
    // Focus somehow behind it: the next Tab brings it back in.
    act(() => { host.querySelector<HTMLButtonElement>('[data-t="behind"]')!.focus(); });
    key('Tab');
    expect(focused()).toBe('first');
  });
  it('Escape closes, and focus goes back to the button that opened it', async () => {
    const onClose = vi.fn();
    act(() => { root.render(createElement(Page, { onClose })); });
    await openIt();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(focused()).toBe('opener');
  });
  it('a dialog over a dialog: Escape closes only the top one', async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    function Inner() {
      const ref = useModalDialog<HTMLDivElement>(true, innerClose);
      return createElement('div', { ref, role: 'dialog', tabIndex: -1 }, createElement('button', { 'data-t': 'inner' }, 'Inner'));
    }
    act(() => { root.render(createElement(Page, { onClose: outerClose, inner: createElement(Inner) })); });
    await openIt();
    expect(focused()).toBe('inner');
    key('Escape');
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });
  it('an open dropdown inside takes that Escape (the font list), not the dialog', async () => {
    const onClose = vi.fn();
    act(() => { root.render(createElement(Page, { onClose, inner: createElement('button', { 'aria-expanded': 'true' }, 'Font') })); });
    await openIt();
    key('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('without onClose (a step that must be answered), Escape does nothing', async () => {
    function NoClose() {
      const ref = useModalDialog<HTMLDivElement>(true);
      return createElement('div', { ref, role: 'dialog', tabIndex: -1 }, createElement('button', { 'data-t': 'only' }, 'Only'));
    }
    act(() => { root.render(createElement(NoClose)); });
    settle();
    key('Escape');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

describe('real dialogs', () => {
  it('"Remove this graphic?": focus on "Keep it", Escape keeps it', async () => {
    const onClose = vi.fn();
    const onRemove = vi.fn();
    act(() => { root.render(createElement(RemoveGraphicModal, { onRemove, onClose })); });
    settle();
    expect(document.activeElement?.textContent).toBe('Keep it');
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    key('Escape');
    expect(onClose).toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
  it('"Add to this box": focus on the first choice, Escape closes', async () => {
    const onClose = vi.fn();
    act(() => { root.render(createElement(SlotChooser, { onPhoto: vi.fn(), onText: vi.fn(), onClose })); });
    settle();
    expect(document.activeElement?.textContent).toContain('Add Photo');
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add to this box');
    key('Escape');
    expect(onClose).toHaveBeenCalled();
  });
  it('every dialog the testers named, and the others like them, use it (source guard)', () => {
    const files = [
      'pages/auth/LoginModal.tsx', 'pages/auth/SignupModal.tsx', 'pages/builder/LayoutPicker.tsx',
      'pages/builder/AddQrModal.tsx', 'pages/builder/QuotePickerModal.tsx', 'pages/builder/RemoveGraphicModal.tsx',
      'pages/builder/SlotChooser.tsx', 'pages/builder/BuilderBackGuard.tsx', 'pages/builder/CoverEditor.tsx',
      'pages/builder/BuilderEdit.tsx', 'components/SoftAuthGate.tsx', 'components/ResumePrompt.tsx',
      'components/StartNewAlbumPrompt.tsx', 'components/DeleteAccountSection.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      expect(src, f).toMatch(/useModalDialog<HTMLDivElement>\(/);
      expect(src, f).toMatch(/role="dialog"/);
      expect(src, f).toMatch(/aria-modal="true"/);
    }
  });
});

describe('the rest of the keyboard pass', () => {
  it('KB-3: the receipt picker is a focusable control, not display:none (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(src).toMatch(/type="file" accept="image\/jpeg,image\/png,image\/webp,application\/pdf" className="sr-only"/);
    expect(src).toMatch(/focus-within:ring-2/);
  });
  it('KB-5: order fields are named by their labels (source guard)', () => {
    const order = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    for (const id of ['order-name', 'order-phone', 'pay-reference']) {
      expect(order).toMatch(new RegExp(`htmlFor="${id}"`));
      expect(order).toMatch(new RegExp(`id="${id}"`));
    }
    const addr = readFileSync(resolve(__dirname, '../components/AddressPicker.tsx'), 'utf8');
    for (const k of ['province', 'city', 'barangay', 'street', 'zip']) {
      expect(addr).toMatch(new RegExp(`htmlFor=\\{fid\\('${k}'\\)\\}`));
      expect(addr).toMatch(new RegExp(`id=\\{fid\\('${k}'\\)\\}`));
    }
  });
  it('KB-7: a project\'s Delete button shows when it has keyboard focus (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../components/UserProjectsSection.tsx'), 'utf8');
    expect(src).toMatch(/opacity-0 group-hover:opacity-100 focus-visible:opacity-100/);
    expect(src).toMatch(/aria-label=\{`Delete album \$\{album\.title \|\| 'Untitled Album'\}`\}/);
  });
});
