import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOBILENET_URL } from './mobileNet';

/* ════════════════════════════════════════════════════════════════════════
   THE MODEL MUST BE REACHABLE ON THE LIVE SITE. The website's
   Content-Security-Policy (vercel.json) lists the hosts a page may connect
   to. The look pass and Megy's album guess download MobileNet from
   MOBILENET_URL; a host the policy does not list is blocked by the browser,
   and the model then never loads, with nothing on screen to say so
   (2026-11-09: the mobilenet package's own address, tfhub.dev then
   kaggle.com, was blocked this way on the live site).
   ════════════════════════════════════════════════════════════════════════ */

const root = resolve(__dirname, '../..');

/** The hosts the live site may connect to (vercel.json, connect-src). */
function connectSources(): string[] {
  const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as { headers?: { headers?: { key: string; value: string }[] }[] };
  const policy = (config.headers ?? []).flatMap((h) => h.headers ?? []).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  const connect = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src '));
  return connect ? connect.split(/\s+/).slice(1) : [];
}

describe('the picture model on the live site', () => {
  it("is downloaded from a host the site's Content-Security-Policy lets the page reach", () => {
    const allowed = connectSources();
    expect(allowed.length, 'vercel.json has a connect-src list').toBeGreaterThan(0);
    expect(allowed).toContain(new URL(MOBILENET_URL).origin);
  });

  it('is MobileNet v2 1.0 at 224 px, as a TensorFlow.js model file', () => {
    expect(MOBILENET_URL).toMatch(/^https:\/\/.+mobilenet_v2_1\.0_224\/model\.json$/);
  });
});
