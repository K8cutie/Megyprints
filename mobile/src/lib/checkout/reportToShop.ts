/* ══════════════════════════════════════════════════════════════════════════
   A STOPPED ORDER IS TOLD TO THE SHOP (MP-2026-9M5572U, 2026-11-22).

   The phone's send stopped after the cover and the first video, and the
   shop could only guess why from the server's logs: the app's own error
   message stayed on the phone. Now, when Place order (or Finish sending)
   stops, the app posts what happened to the website's error inbox
   (api/client-error.mjs → the console's Errors tab, owner only): the step
   it stopped at, the order's id, the app's version and the message. No
   name, phone, address or photo goes in it.

   It never waits on the answer and never throws: a report that can't go
   is dropped. The endpoint takes JSON only, cuts every field to size and
   scrubs anything shaped like a key or token.
   ══════════════════════════════════════════════════════════════════════════ */
import Constants from 'expo-constants';
import { siteFile } from './site';

/** The website's error inbox. */
export const CLIENT_ERROR_PATH = 'api/client-error';

/** What one report says. */
export interface ShopReport {
  message: string;
  stack: string | null;
  url: string;
  context: Record<string, string | number | boolean | null>;
}

/** The report for an error at a step of sending (`orderId` once the order exists). */
export function shopReport(e: unknown, ctx: { kind: string; step: string | null; orderId: string | null; finishing?: boolean }, version: string | null = appVersion()): ShopReport {
  const err = e instanceof Error ? e : null;
  return {
    message: (err?.message || String(e || 'Unknown error')).slice(0, 900),
    stack: err?.stack ? err.stack.slice(0, 1800) : null,
    url: 'app://megyprints/order',
    context: {
      kind: ctx.kind,
      step: ctx.step,
      orderId: ctx.orderId,
      finishing: !!ctx.finishing,
      error: err?.name ?? null,
      app: version,
    },
  };
}

function appVersion(): string | null {
  try {
    return (Constants.expoConfig as { version?: string } | null)?.version ?? null;
  } catch {
    return null;
  }
}

type Post = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<unknown>;

/** Post a report; never waits on it to matter, never throws. */
export async function reportToShop(report: ShopReport, post: Post = (u, i) => fetch(u, i)): Promise<void> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 10_000);
  try {
    await post(siteFile(CLIENT_ERROR_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
  } catch {
    // Dropped: the screen and the notification still say what happened.
  } finally {
    clearTimeout(timer);
  }
}
