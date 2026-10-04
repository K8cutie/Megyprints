// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE PHONE MENU CAN LOG IN, SIGN UP AND SIGN OUT (1-star testers,
   2026-10-04: the Quitter found "No way to sign out on a phone"; the menu
   had no Log In or Sign Up either — only Home, Templates, About, Contact).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ user: null as null | { email: string; user_metadata?: { full_name?: string } }, logout: vi.fn(), openLogin: vi.fn(), openSignup: vi.fn() }));
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: h.user, logout: h.logout }) }));
vi.mock('./AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: h.openLogin, openSignup: h.openSignup }) }));
vi.mock('../lib/roles', () => ({ resolveRole: async () => null }));

import AuthNav from './AuthNav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); h.user = null; vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const show = async (onAction = vi.fn()) => {
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(AuthNav, { variant: 'menu', onAction }))); });
  const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { onAction, q };
};

describe('AuthNav in the phone menu', () => {
  it('signed out: Log In and Sign Up — each opens its form and closes the menu', async () => {
    const { onAction, q } = await show();
    expect(q('menu-log-in')?.textContent).toBe('Log In');
    expect(q('menu-sign-up')?.textContent).toBe('Sign Up');
    await act(async () => { q('menu-log-in')!.click(); });
    expect(h.openLogin).toHaveBeenCalledTimes(1);
    await act(async () => { q('menu-sign-up')!.click(); });
    expect(h.openSignup).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('signed in: the account, Memories, and Sign Out (which signs out)', async () => {
    h.user = { email: 'quinn@example.com', user_metadata: { full_name: 'Quinn Returner' } };
    const { onAction, q } = await show();
    const text = q('menu-account')!.textContent!;
    expect(text).toContain('Quinn Returner');
    expect(text).toContain('Memories');
    await act(async () => { q('menu-sign-out')!.click(); });
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('the phone menu shows it (source guard)', () => {
    const nav = readFileSync(resolve(__dirname, 'Navbar.tsx'), 'utf8');
    expect(nav).toMatch(/<AuthNav variant="menu" onAction=\{\(\) => setMobileOpen\(false\)\} \/>/);
  });
});
