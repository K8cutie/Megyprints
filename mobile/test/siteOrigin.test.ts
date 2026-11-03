/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S CALLS TO THE WEBSITE'S OWN SERVER SAY WHERE THEY COME FROM
   (src/lib/siteOrigin.ts). Owner's phone test: the AI quote works on the
   website and not in the app. The website's endpoints share a guard
   (api/_guard.mjs) with an optional origin list (ALLOWED_ORIGINS); a
   browser always sends its Origin, the app sent none:
     • the app's call now carries the endpoint's own address as its Origin,
       every other header as it was;
     • the website's REAL guard, run with the list switched on: the app's old
       call refused ("origin not allowed"), the new one let through; with the
       list off, both through (nothing else changes);
     • the AI quote and "Delete my account" both use it;
     • a failed AI quote: the test app shows what the server said, the Play
       app only the usual words.
   ══════════════════════════════════════════════════════════════════════════ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { originOf, siteFetch, withSiteOrigin } from '../src/lib/siteOrigin';
import { PHOTO_QUOTES_URL, writeLinesForPhotos } from '../src/editor/text/photoQuotes';
import { LIVE_DELETE_ACCOUNT_URL } from '../src/lib/account/deleteAccount';
import { testAppDetail } from '../src/editor/text/words';

const REPO = path.resolve(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const SITE = 'https://megyprints.vercel.app';

describe('the Origin the app sends', () => {
  it('is the endpoint\'s own address, for both of the website\'s endpoints the app calls', () => {
    expect(originOf(PHOTO_QUOTES_URL)).toBe(SITE);
    expect(originOf(LIVE_DELETE_ACCOUNT_URL)).toBe(SITE);
    expect(originOf('HTTPS://Megyprints.Vercel.app:443/api/x?y=1')).toBe('https://megyprints.vercel.app:443');
    expect(originOf('not a url')).toBe('');
  });

  it('every other header as it was; the call itself unchanged', async () => {
    expect(withSiteOrigin(PHOTO_QUOTES_URL, { Authorization: 'Bearer t', 'content-type': 'application/json' }))
      .toEqual({ Authorization: 'Bearer t', 'content-type': 'application/json', Origin: SITE });
    expect(withSiteOrigin('relative/path', { a: '1' })).toEqual({ a: '1' });
    const seen: { url: string; init: unknown }[] = [];
    const f = siteFetch(async (url, init) => { seen.push({ url, init }); return 'answer'; });
    expect(await f(PHOTO_QUOTES_URL, { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{}' })).toBe('answer');
    expect(seen).toEqual([{ url: PHOTO_QUOTES_URL, init: { method: 'POST', headers: { Authorization: 'Bearer t', Origin: SITE }, body: '{}' } }]);
  });
});

describe('the website\'s real guard (api/_guard.mjs)', () => {
  /** The guard's answer for these request headers, with ALLOWED_ORIGINS as given. */
  function guardSays(allowed: string, headers: Record<string, string>): unknown {
    // A file:// address: Windows (where CI runs) can't load a module by a plain D:\ path.
    const script = `import { guard } from ${JSON.stringify(pathToFileURL(path.join(REPO, 'api', '_guard.mjs')).href)};
      const lower = Object.fromEntries(Object.entries(${JSON.stringify(headers)}).map(([k, v]) => [k.toLowerCase(), v]));
      process.stdout.write(JSON.stringify(guard({ headers: { 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 200), ...lower }, body: {} }) ?? 'through'));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, ALLOWED_ORIGINS: allowed }, encoding: 'utf8' });
    return JSON.parse(out);
  }
  const before = { Authorization: 'Bearer t', 'content-type': 'application/json' };
  const now = withSiteOrigin(PHOTO_QUOTES_URL, before);

  it('with the origin list switched on: the app\'s old call refused, the new one through', () => {
    const list = `${SITE},https://www.megyprints.com`;
    expect(guardSays(list, before)).toEqual({ status: 403, error: 'origin not allowed' });
    expect(guardSays(list, now)).toBe('through');
  });

  it('with the list off: both through, as before', () => {
    expect(guardSays('', before)).toBe('through');
    expect(guardSays('', now)).toBe('through');
  });
});

describe('the app uses it', () => {
  it('the AI quote and "Delete my account" call the website through siteFetch', () => {
    expect(read('mobile/src/editor/text/appPhotoQuotes.ts')).toContain('fetch: (url, init) => siteFetch((u, i) => fetch(u, i))(url, init),');
    expect(read('mobile/src/app/delete-account.tsx')).toContain('fetch: (url, init) => siteFetch((u, i) => fetch(u, i))(url, init),');
  });
});

describe('a failed AI quote says what the server answered (the test app only)', () => {
  const deps = (answer: { status: number; body: unknown } | Error) => ({
    token: async () => 't',
    shrink: async (u: string) => `b64:${u}`,
    fetch: async () => {
      if (answer instanceof Error) throw answer;
      return { status: answer.status, ok: answer.status < 400, json: async () => answer.body };
    },
  });

  it('the status and the server\'s words; no answer at all: why', async () => {
    expect(await writeLinesForPhotos(deps({ status: 403, body: { error: 'origin not allowed' } }), ['u'], 't')).toEqual({ error: 'failed', detail: '403 origin not allowed' });
    expect(await writeLinesForPhotos(deps({ status: 503, body: { error: 'unavailable' } }), ['u'], 't')).toEqual({ error: 'failed', detail: '503 unavailable' });
    expect(await writeLinesForPhotos(deps(new Error('Network request failed')), ['u'], 't')).toEqual({ error: 'failed', detail: 'Network request failed' });
    expect(testAppDetail('403 origin not allowed')).toBe('(Test app: the server said "403 origin not allowed".)');
  });

  it('the picker adds it only in the test app', () => {
    const src = read('mobile/src/editor/text/QuotePickerSheet.tsx');
    expect(src).toContain("setNote(r.detail && buildKind() === 'dev' ? `${PHOTO_QUOTE_MESSAGES[r.error]}\\n${testAppDetail(r.detail)}` : PHOTO_QUOTE_MESSAGES[r.error]);");
  });
});
