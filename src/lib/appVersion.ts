/* ══════════════════════════════════════════════════════════════════════════
   appVersion — make sure a phone runs the newest app before it makes print
   files (owner, 2026-10-25: MP-2026-XNWRQT9 was ordered on 25 Oct with the
   ½" binding edge that became 3/8" on 22 Oct: the phone had kept an old copy
   of the app open for days, and print files are made on the phone).

   Every build stamps its id into the app (__MEGY_BUILD__, vite.config) and
   into /version.json. Before checkout or "Send the cover" makes print files,
   ensureLatestApp() reads /version.json fresh. When the live build is a
   different one, it brings the new version into the app's offline cache,
   leaves a note for the next screen, and reloads. Nothing is lost: the album,
   the photos and the checkout details are all kept on the phone, and
   checkout rebuilds its print job after a reload.

   It never stands in the way of an order: offline, an unreadable
   version.json, or a phone that is still on the old copy after two reloads
   in a row → carry on with this copy.
   ══════════════════════════════════════════════════════════════════════════ */

declare const __MEGY_BUILD__: string | undefined;

/** This copy's build id ('dev' when no build stamped it). */
export const BUILD_ID: string = typeof __MEGY_BUILD__ === 'string' && __MEGY_BUILD__ ? __MEGY_BUILD__ : 'dev';

/** Said after the reload, on the screen the customer comes back to. */
export const UPDATED_PLACE_ORDER = 'Megy Prints was just updated. Your album and details are saved: check them, then tap Place order again.';
export const UPDATED_SEND_COVER = 'Megy Prints was just updated. Tap Send the cover again.';
/** Shown on the button while the newest version comes in. */
export const GETTING_NEWEST = 'Getting the newest version of Megy Prints…';

const RELOAD_KEY = 'megy-update-reload';
const NOTE_KEY = 'megy-update-note';
/** Reloads closer together than this count as one try in a row. */
const RETRY_WINDOW_MS = 2 * 60 * 1000;
/** How long the "was just updated" note stays up after the reload. */
const NOTE_FOR_MS = 10 * 60 * 1000;
/** How long to wait for the new version to reach the offline cache. */
const SW_WAIT_MS = 10_000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AppUpdateEnv {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  storage: Store | null;
  reload: () => void;
  serviceWorker?: ServiceWorkerContainer;
  caches?: CacheStorage;
  now: () => number;
  build: string;
}

function browserEnv(): AppUpdateEnv {
  let storage: Store | null = null;
  try { storage = window.sessionStorage; } catch { /* private mode: no notes, no retry guard */ }
  return {
    fetch: (url, init) => window.fetch(url, init),
    storage,
    reload: () => window.location.reload(),
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    caches: typeof caches !== 'undefined' ? caches : undefined,
    now: () => Date.now(),
    build: BUILD_ID,
  };
}

/** The live build id, or null when it can't be read (offline, dev, an old
 *  deploy without version.json). */
export async function liveBuild(env: Pick<AppUpdateEnv, 'fetch' | 'now'> = browserEnv()): Promise<string | null> {
  try {
    const res = await env.fetch(`./version.json?t=${env.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown };
    return typeof body.build === 'string' && body.build ? body.build : null;
  } catch {
    return null;
  }
}

/** Ask the offline cache for the new version and wait (a while) for it to
 *  take over the page, so the reload loads the new copy, not the cached one. */
async function freshServiceWorker(sw: ServiceWorkerContainer | undefined): Promise<void> {
  if (!sw) return;
  const reg = await sw.getRegistration().catch(() => undefined);
  if (!reg) return;
  const takenOver = new Promise<void>((resolve) => {
    sw.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, SW_WAIT_MS);
  });
  await reg.update().catch(() => undefined);
  if (reg.installing || reg.waiting) await takenOver;
}

/** Drop the offline cache altogether, so the next load comes from the site. */
async function dropServiceWorker(env: AppUpdateEnv): Promise<void> {
  const regs = await env.serviceWorker?.getRegistrations().catch(() => []) ?? [];
  await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  const keys = await env.caches?.keys().catch(() => []) ?? [];
  await Promise.all(keys.map((k) => env.caches!.delete(k).catch(() => false)));
}

export type Freshness = 'latest' | 'unknown' | 'reloading';

/**
 * Is this copy the live one? 'latest' (go), 'unknown' (couldn't tell, or two
 * reloads didn't help: go), or 'reloading' (stop: the page is reloading into
 * the newest version, and `note` will be shown when it comes back).
 */
export async function ensureLatestApp(note: string, env: AppUpdateEnv = browserEnv()): Promise<Freshness> {
  const live = await liveBuild(env);
  if (!live) return 'unknown';
  if (live === env.build) {
    // The newest copy: the tries and the note have done their job.
    env.storage?.removeItem(RELOAD_KEY);
    env.storage?.removeItem(NOTE_KEY);
    return 'latest';
  }
  // Reloads in a row: 1st = ask the offline cache for the new copy; 2nd =
  // drop the offline cache; after that, go ahead rather than loop.
  let tries = 0;
  try {
    const last = JSON.parse(env.storage?.getItem(RELOAD_KEY) ?? 'null') as { at?: number; tries?: number } | null;
    if (last && typeof last.at === 'number' && env.now() - last.at < RETRY_WINDOW_MS) tries = Number(last.tries) || 0;
  } catch { /* a bad note counts as none */ }
  if (tries >= 2) return 'unknown';
  env.storage?.setItem(RELOAD_KEY, JSON.stringify({ at: env.now(), tries: tries + 1 }));
  env.storage?.setItem(NOTE_KEY, JSON.stringify({ note, at: env.now() }));
  if (tries === 0) await freshServiceWorker(env.serviceWorker);
  else await dropServiceWorker(env);
  env.reload();
  return 'reloading';
}

/** The note left before an update reload. It stays (a screen may draw twice
 *  while it loads) until the customer taps again on the newest copy, or for
 *  10 minutes. */
export function readUpdateNote(storage: Store | null = browserEnv().storage, now: number = Date.now()): string | null {
  try {
    const saved = JSON.parse(storage?.getItem(NOTE_KEY) ?? 'null') as { note?: unknown; at?: unknown } | null;
    if (saved && typeof saved.note === 'string' && typeof saved.at === 'number' && now - saved.at < NOTE_FOR_MS) return saved.note;
  } catch { /* a bad note counts as none */ }
  storage?.removeItem(NOTE_KEY);
  return null;
}
