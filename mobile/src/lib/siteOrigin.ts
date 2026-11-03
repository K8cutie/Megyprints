/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S CALLS TO THE WEBSITE'S OWN SERVER SAY WHERE THEY COME FROM.

   The website's paid and account endpoints (api/photo-quotes, api/
   delete-account) share an abuse guard (api/_guard.mjs) with an optional
   origin list (ALLOWED_ORIGINS on Vercel). A browser always says which site
   a request comes from (Origin); the app said nothing, so with that list
   switched on every AI quote and account deletion from the app was refused
   while the website went on working (owner's phone test, 2026-11-03).

   So the app's request carries the endpoint's own address as its Origin
   (https://megyprints.vercel.app for https://megyprints.vercel.app/api/…):
   the request the website itself sends. Nothing else changes: the endpoint
   still asks for the signed-in account's token and keeps its daily limits.
   ══════════════════════════════════════════════════════════════════════════ */

/** The scheme and host of a full https:// address ('' when it is not one). */
export function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : '';
}

/** The headers, with Origin set to the endpoint's own address. */
export function withSiteOrigin(url: string, headers: Record<string, string> = {}): Record<string, string> {
  const origin = originOf(url);
  return origin ? { ...headers, Origin: origin } : { ...headers };
}

type Init = { method: string; headers?: Record<string, string>; body?: string };

/** fetch for the website's endpoints: the same call, saying where it comes from. */
export function siteFetch<R>(fetchFn: (url: string, init: Init) => Promise<R>) {
  return (url: string, init: Init): Promise<R> => fetchFn(url, { ...init, headers: withSiteOrigin(url, init.headers ?? {}) });
}
