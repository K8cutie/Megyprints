#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   A LOCAL COPY OF THE WEBSITE'S DELETE-ACCOUNT ENDPOINT, for walking the
   app's "Delete my account" on an emulator without ever touching the live
   site.

   It runs the website's OWN handler (api/delete-account.mjs, unchanged)
   behind a tiny HTTP server, pointed at a LOCAL Supabase only: it refuses
   to start unless VITE_SUPABASE_URL is on this computer (127.0.0.1 or
   localhost). A walk build points the app at it with
     EXPO_PUBLIC_DELETE_ACCOUNT_URL=http://10.0.2.2:<port>/api/delete-account
   (10.0.2.2 is the computer, seen from the Android emulator).

   USAGE
     VITE_SUPABASE_URL=http://127.0.0.1:59321 \
     VITE_SUPABASE_ANON_KEY=<local anon key> \
     SUPABASE_SERVICE_ROLE_KEY=<local service key> \
     node mobile/scripts/local-delete-account.mjs [--port 59390]
   (the local keys: `supabase status` in the local stack's folder.)
   Every request is written to the console: method, path, status, answer.
   ══════════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 59390;

const url = process.env.VITE_SUPABASE_URL ?? '';
let host = '';
try { host = new URL(url).hostname; } catch { /* not a URL */ }
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.error(`Refusing to start: VITE_SUPABASE_URL must be a local Supabase (127.0.0.1 or localhost), not "${url}".`);
  process.exit(1);
}
if (!process.env.VITE_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Refusing to start: set VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (the LOCAL stack\'s keys).');
  process.exit(1);
}

// The handler reads its settings when it is loaded, so load it after the checks.
const { default: handler } = await import(pathToFileURL(path.resolve(here, '../../api/delete-account.mjs')).href);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = raw;
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* left as text, as Vercel does */ }
    const vreq = { method: req.method, headers: req.headers, body, url: req.url };
    let status = 200;
    const vres = {
      status(n) { status = n; return vres; },
      setHeader(k, v) { res.setHeader(k, v); return vres; },
      json(obj) {
        const text = JSON.stringify(obj);
        console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${status} ${text}`);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(text);
        return vres;
      },
    };
    if (req.url !== '/api/delete-account') { vres.status(404).json({ error: 'not found' }); return; }
    try {
      await handler(vreq, vres);
    } catch (e) {
      vres.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
});

// This computer only (the emulator's 10.0.2.2 is this computer's 127.0.0.1): never the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local delete-account endpoint on http://127.0.0.1:${PORT}/api/delete-account (Supabase: ${url})`);
});
