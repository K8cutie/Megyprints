/* The website's address lists, read from the repo (public/psgc/) instead of
   the website, for tests. `fetchFromDisk` answers like fetch does. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PSGC_DIR = path.resolve(__dirname, '../../../public/psgc');
export const BASE = 'https://site.test/psgc/';

export const fetchFromDisk = async (url: string) => {
  const file = path.join(PSGC_DIR, url.slice(BASE.length));
  if (!url.startsWith(BASE) || !existsSync(file)) return { ok: false, status: 404, json: async () => null };
  const text = readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown };
};
