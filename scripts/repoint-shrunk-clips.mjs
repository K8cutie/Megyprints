#!/usr/bin/env node
// One-off: memory rows that name a file the bucket doesn't have, next to the
// MP4 the phone really uploaded (found 2026-11-02).
//
// The Add QR box named a clip after the PICKED file (<code>.mov from an
// iPhone). The phone then shrank the video to an MP4 and checkout uploaded
// <code>.mp4, but the memory row kept <code>.mov. The scan page (api/m.mjs)
// plays exactly the row's destination, so the printed QR played nothing.
// Checkout is fixed (withUploadedClipExt); this finds the rows made before the
// fix and, with --apply, moves each one to its .mp4.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=… node scripts/repoint-shrunk-clips.mjs
//       → lists what it would do and changes nothing
//   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/repoint-shrunk-clips.mjs --apply
//       → re-points those rows
//
// A row is moved only when its own file is NOT in the bucket and <code>.mp4
// IS, and only while it still names that file (the same guard as checkout's
// moveMemoryDestination), so a row re-pointed in the meantime is left alone.
// Rows with neither file are listed as dead: nothing here can bring those back.
// Prints codes only, never a destination URL (anyone with one can watch the
// video, the same rule as api/m.mjs's logs).
import { pathToFileURL } from 'node:url';

const BUCKET_PATH = '/storage/v1/object/public/memory-clips/';
const CLIP_DEST = /\/storage\/v1\/object\/public\/memory-clips\/([a-z2-9]{4,32})\.(mp4|mov|webm|m4v)(\?v=\d+)?$/;

/** What to do with one memory row, given the bucket's object names for its
 *  code: 'skip' (not a non-MP4 hosted clip), 'ok' (its file is there),
 *  'dead' (neither its file nor an MP4) or 'move' (to `to`, the same URL with
 *  <code>.mp4, keeping any ?v= version). */
export function planFor(row, names) {
  const m = typeof row?.destination === 'string' ? row.destination.match(CLIP_DEST) : null;
  if (!m || m[1] !== row.code || m[2] === 'mp4') return { action: 'skip' };
  const [whole, code, ext, version = ''] = m;
  if (names.includes(`${code}.${ext}`)) return { action: 'ok' };
  if (!names.includes(`${code}.mp4`)) return { action: 'dead', ext };
  const origin = row.destination.slice(0, row.destination.length - whole.length);
  return { action: 'move', ext, to: `${origin}${BUCKET_PATH}${code}.mp4${version}` };
}

async function main() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_KEY ?? '';
  const apply = process.argv.includes('--apply');
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (the service key reads every account\'s rows and the bucket).');
    process.exit(2);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('qr_memories')
      .select('code, destination')
      .like('destination', `%${BUCKET_PATH}%`)
      .order('code')
      .range(from, from + 999);
    if (error) throw new Error(`qr_memories: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const named = rows.filter((r) => /\.(mov|webm|m4v)(\?v=\d+)?$/.test(r.destination ?? ''));
  console.log(`${rows.length} hosted clip rows; ${named.length} name a .mov, .webm or .m4v.${apply ? '' : ' (dry run: nothing is changed)'}`);

  const counts = { ok: 0, move: 0, dead: 0, skip: 0, moved: 0 };
  for (const row of named) {
    const { data, error } = await admin.storage.from('memory-clips').list('', { search: row.code, limit: 20 });
    if (error) throw new Error(`memory-clips list (${row.code}): ${error.message}`);
    const plan = planFor(row, (data ?? []).map((o) => o?.name).filter((n) => typeof n === 'string'));
    counts[plan.action] += 1;
    if (plan.action === 'dead') console.log(`dead   ${row.code}  .${plan.ext} (neither it nor .mp4 is in the bucket)`);
    if (plan.action !== 'move') continue;
    if (!apply) { console.log(`would  ${row.code}  .${plan.ext} → .mp4`); continue; }
    const { data: hit, error: upErr } = await admin.from('qr_memories')
      .update({ destination: plan.to })
      .eq('code', row.code)
      .eq('destination', row.destination)
      .select('code');
    if (upErr) throw new Error(`re-point ${row.code}: ${upErr.message}`);
    if (hit?.length) { counts.moved += 1; console.log(`moved  ${row.code}  .${plan.ext} → .mp4`); }
    else console.log(`left   ${row.code}  (re-pointed since this run read it)`);
  }
  console.log(`ok ${counts.ok} · ${apply ? `moved ${counts.moved} of ${counts.move}` : `to move ${counts.move}`} · dead ${counts.dead}`);
  if (!apply && counts.move) console.log('Run again with --apply to re-point them.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
