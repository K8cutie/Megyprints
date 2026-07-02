// Generate lean PSGC lookup files served statically from public/psgc/.
// Source: @jobuntux/psgc (devDependency, build-time only — never shipped to the
// client). Re-run when PSGC updates: `node scripts/build-psgc.mjs`.
//
// Output (fetched on demand by the address picker; 0 bytes in the JS bundle):
//   public/psgc/regions.json    [{ code, name }]                     (~18)
//   public/psgc/provinces.json  [{ code, regCode, name }]            (~115)  code = regCode+provCode
//   public/psgc/muncities.json  [{ code, provKey, name }]            (~1656) code = regCode+munCityCode, provKey = regCode+provCode
//   public/psgc/brgy/<provKey>.json  [{ code, cityKey, name }]       per province; cityKey = regCode+munCityCode
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'node_modules/@jobuntux/psgc/data/2025-2Q';
const OUT = 'public/psgc';
const BRGY = path.join(OUT, 'brgy');

fs.mkdirSync(BRGY, { recursive: true });
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o));
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const byName = (a, b) => a.name.localeCompare(b.name);

const regions = read('regions.json');
const provinces = read('provinces.json');
const muncities = read('muncities.json');
const barangays = read('barangays.json');

write(path.join(OUT, 'regions.json'),
  regions.map((r) => ({ code: r.regCode, name: clean(r.regionName) })).sort(byName));

// Base provinces from source.
const provList = provinces.map((p) => ({ code: p.regCode + p.provCode, regCode: p.regCode, name: clean(p.provName) }));
const provCodes = new Set(provList.map((p) => p.code));

// Some PSGC municipalities are PROVINCE-LEVEL units with no parent-province row —
// independent cities / HUCs (e.g. Isabela City), lone NCR municipality (Pateros),
// and the BARMM Special Geographic Area. Without a synthesized province they'd be
// unreachable in the cascade (= undeliverable). Add a selectable entry for each.
const SPECIAL_PROV_NAMES = { '09901': 'Isabela City', '13817': 'Pateros', '19999': 'Special Geographic Area' };
const orphans = new Map(); // provKey -> { regCode, cities: [] }
for (const m of muncities) {
  const key = m.regCode + m.provCode;
  if (provCodes.has(key)) continue;
  if (!orphans.has(key)) orphans.set(key, { regCode: m.regCode, cities: [] });
  orphans.get(key).cities.push(clean(m.munCityName));
}
for (const [key, info] of orphans) {
  const name = SPECIAL_PROV_NAMES[key] || (info.cities.length === 1 ? info.cities[0] : 'Independent Areas');
  provList.push({ code: key, regCode: info.regCode, name });
}

write(path.join(OUT, 'provinces.json'), provList.sort(byName));

write(path.join(OUT, 'muncities.json'),
  muncities.map((m) => ({ code: m.regCode + m.munCityCode, provKey: m.regCode + m.provCode, name: clean(m.munCityName) })).sort(byName));

// Barangays split per province so checkout only fetches the selected province's set.
const byProv = new Map();
for (const b of barangays) {
  const provKey = b.regCode + b.provCode;
  if (!byProv.has(provKey)) byProv.set(provKey, []);
  byProv.get(provKey).push({ code: b.brgyCode, cityKey: b.regCode + b.munCityCode, name: clean(b.brgyName) });
}
for (const [provKey, list] of byProv) write(path.join(BRGY, provKey + '.json'), list.sort(byName));

console.log(`regions=${regions.length} provinces=${provinces.length} muncities=${muncities.length} barangays=${barangays.length} brgyFiles=${byProv.size}`);
