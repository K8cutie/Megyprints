// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   SEE WHAT YOU TYPE (owner, 2026-10-24: "put the eye on it so users see what
   they type"). Every password box — sign in, sign up (both boxes), "Make a
   new password" — has Show / Hide. One component, PasswordInput.
   ══════════════════════════════════════════════════════════════════════════ */

// One stable object: the modals' open effects depend on clearError, so a new
// function every render would loop them forever.
const h = vi.hoisted(() => ({
  auth: {
    user: { email: 'pat@example.test' },
    login: () => Promise.resolve(), signup: () => Promise.resolve(false), signInWithOAuth: () => Promise.resolve(),
    loading: false, error: null, clearError: () => {},
  },
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../../lib/passwordRecovery', () => ({ sendResetLink: vi.fn(), resendSignupLink: vi.fn(), saveNewPassword: vi.fn() }));

import { PasswordInput } from './PasswordInput';
import LoginModal from './LoginModal';
import SignupModal from './SignupModal';
import NewPasswordModal from './NewPasswordModal';
import { setRecoveryState, endRecovery } from '../../lib/recoveryState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); endRecovery(); });

const box = (id: string) => document.getElementById(id) as HTMLInputElement;
const eyeFor = (id: string) => document.querySelector<HTMLButtonElement>(`button[aria-controls="${id}"]`)!;
const tap = (b: HTMLButtonElement) => act(() => { b.click(); });
const type = (input: HTMLInputElement, text: string) => act(() => {
  // React tracks the value itself; set it the way a real keystroke does.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

function Harness() {
  const [v, setV] = useState('');
  return createElement(PasswordInput, { id: 'pw', value: v, onChange: setV, placeholder: 'Password', autoComplete: 'current-password' });
}

describe('PasswordInput', () => {
  it('starts hidden; Show turns it to plain text, Hide turns it back, the typing stays', () => {
    act(() => { root.render(createElement(Harness)); });
    const input = box('pw');
    const eye = eyeFor('pw');
    expect(input.type).toBe('password');
    expect(eye.textContent).toBe('Show');
    expect(eye.getAttribute('aria-label')).toBe('Show password');

    type(input, 'Megy2026!');
    tap(eye);
    expect(input.type).toBe('text');
    expect(input.value).toBe('Megy2026!');
    expect(eye.textContent).toBe('Hide');
    expect(eye.getAttribute('aria-label')).toBe('Hide password');

    tap(eye);
    expect(input.type).toBe('password');
    expect(input.value).toBe('Megy2026!');
  });

  it('the eye is a plain button: it never submits the form', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    act(() => { root.render(createElement('form', { onSubmit }, createElement(Harness))); });
    tap(eyeFor('pw'));
    expect(eyeFor('pw').type).toBe('button');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pressing the eye keeps focus in the box (the phone keyboard stays up)', () => {
    act(() => { root.render(createElement(Harness)); });
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    eyeFor('pw').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('shown as text, the keyboard must not capitalize or "correct" the password', () => {
    act(() => { root.render(createElement(Harness)); });
    const input = box('pw');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
});

describe('every password box in the app has the eye', () => {
  const checkEye = (id: string) => {
    const input = box(id);
    expect(input, id).not.toBeNull();
    expect(input.type, id).toBe('password');
    tap(eyeFor(id));
    expect(input.type, id).toBe('text');
    tap(eyeFor(id));
    expect(input.type, id).toBe('password');
  };

  it('Sign in', () => {
    act(() => { root.render(createElement(LoginModal, { isOpen: true, onClose: vi.fn(), onSwitchToSignup: vi.fn() })); });
    checkEye('login-password');
    expect(box('login-password').autocomplete).toBe('current-password');
  });

  it('Sign up: Password and Confirm Password, each with its own eye', () => {
    act(() => { root.render(createElement(SignupModal, { isOpen: true, onClose: vi.fn(), onSwitchToLogin: vi.fn() })); });
    checkEye('signup-password');
    checkEye('signup-confirm');
    tap(eyeFor('signup-password'));
    expect(box('signup-password').type).toBe('text');
    expect(box('signup-confirm').type).toBe('password');
  });

  it('"Make a new password" (from the emailed link) keeps its eye, and focus still starts in the box', () => {
    act(() => { setRecoveryState('ready'); root.render(createElement(NewPasswordModal, { onAskForNewLink: vi.fn() })); });
    checkEye('new-password');
    expect(box('new-password').hasAttribute('data-autofocus')).toBe(true);
    expect(box('new-password').autocomplete).toBe('new-password');
  });

  it('no bare type="password" box anywhere else in the app (source guard)', () => {
    const src = resolve(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(src);
    // Any 'password' literal: type="password", type={x ? 'text' : 'password'}, { type: 'password' }.
    const bare = files.filter((f) => /['"`]password['"`]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(src, f).replace(/\\/g, '/'));
    expect(bare).toEqual(['pages/auth/PasswordInput.tsx']);
  });
});
