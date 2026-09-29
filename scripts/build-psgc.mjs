// Generate lean PSGC lookup files served statically from public/psgc/.
// Source: @jobuntux/psgc (devDependency, build-time only — never shipped to the
// client). Re-run when PSGC updates: `node scripts/build-psgc.mjs`.
//
// Output (fetched on demand by the address picker; 0 bytes in the JS bundle):
//   public/psgc/regions.json    [{ code, name }]                     (~18)
//   public/psgc/provinces.json  [{ code, regCode, name }]            (84)    code = regCode+provCode
//   public/psgc/muncities.json  [{ code, provKey, name }]            (~1655) code = regCode+munCityCode, provKey = the province it is LISTED under
//   public/psgc/brgy/<code.slice(0,5)>.json  [{ code, cityKey, name }]  per PSGC province-level unit; cityKey = regCode+munCityCode
//
// The province list follows how Filipinos (and couriers, and Google's address
// data for PH — chromium-i18n.appspot.com/ssl-address/data/PH) address mail, not
// PSGC's administrative tree. PSGC puts every highly urbanized city (HUC) at
// province level, so used raw the list had no "Metro Manila" (its 16 cities sat
// among the provinces as "City of Makati", "Quezon City"…) and Cebu City was
// missing from Cebu, Davao City from Davao del Sur, Baguio from Benguet. Here:
//   • NCR's cities + Pateros are listed under one "Metro Manila".
//   • Every other HUC (and Isabela City) is listed under its geographic province.
//   • The 82 real provinces keep their PSGC names.
// A city's barangay file is still its own PSGC unit — the first 5 chars of its
// code — so regrouping the list never moves barangay data.
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

const NCR = '13';
const METRO_MANILA = '13000'; // synthetic — no PSGC province uses provCode 000
const CITY_OF_MANILA = '13806';

// HUC (and independent-city) province-level unit → the province it sits in.
// PSGC has no "geographic province" column, so this is the one hand-kept table.
// A PSGC update that adds a new HUC fails the build below until it's placed here.
const HOME_PROVINCE = {
  '03301': '03054', // Angeles → Pampanga
  '03314': '03071', // Olongapo → Zambales
  '04312': '04056', // Lucena → Quezon
  '06310': '06030', // Iloilo City → Iloilo
  '07306': '07022', // Cebu City → Cebu
  '07311': '07022', // Lapu-Lapu → Cebu
  '07313': '07022', // Mandaue → Cebu
  '08316': '08037', // Tacloban → Leyte
  '09317': '09073', // Zamboanga City → Zamboanga del Sur
  '09901': '19007', // Isabela City → Basilan
  '10305': '10043', // Cagayan de Oro → Misamis Oriental
  '10309': '10035', // Iligan → Lanao del Norte
  '11307': '11024', // Davao City → Davao del Sur
  '12308': '12063', // General Santos → South Cotabato
  '14303': '14011', // Baguio → Benguet
  '16304': '16002', // Butuan → Agusan del Norte
  '17315': '17053', // Puerto Princesa → Palawan
  '18302': '18045', // Bacolod → Negros Occidental
};

// Province-level units that stay their own entry (no parent province exists).
const OWN_ENTRY = { '19999': 'Special Geographic Area (BARMM)' };

const realProvinces = provinces.filter((p) => !p.cityClass);
const provList = [
  ...realProvinces.map((p) => ({ code: p.regCode + p.provCode, regCode: p.regCode, name: clean(p.provName) })),
  { code: METRO_MANILA, regCode: NCR, name: 'Metro Manila' },
  ...Object.entries(OWN_ENTRY).map(([code, name]) => ({ code, regCode: code.slice(0, 2), name })),
];
const listed = new Set(provList.map((p) => p.code));

/** Which province entry a PSGC province-level unit is listed under. */
function listedUnder(unit) {
  if (listed.has(unit)) return unit;
  if (unit.startsWith(NCR)) return METRO_MANILA;
  if (HOME_PROVINCE[unit]) return HOME_PROVINCE[unit];
  throw new Error(`build-psgc: province-level unit ${unit} has no home — add it to HOME_PROVINCE or OWN_ENTRY`);
}

// Which cities actually have barangays — PSGC also carries "City of Manila"
// itself (1380600) next to its 14 districts, and it has none: a dead end.
const citiesWithBrgy = new Set(barangays.map((b) => b.regCode + b.munCityCode));

// Display name. "City of Makati" → "Makati City" (how it's written on mail and
// in every courier list, and it sorts under M instead of piling up under C).
// Manila's 14 districts read "Manila – Sampaloc" so they sit together under M;
// the district stays on the label because Manila mail is addressed by district
// (each has its own ZIP).
function cityName(m) {
  const raw = clean(m.munCityName);
  const name = raw.replace(/^City of (.+)$/, '$1 City');
  return m.regCode + m.provCode === CITY_OF_MANILA ? `Manila – ${name}` : name;
}

const cityList = muncities
  .filter((m) => citiesWithBrgy.has(m.regCode + m.munCityCode))
  .map((m) => ({ code: m.regCode + m.munCityCode, provKey: listedUnder(m.regCode + m.provCode), name: cityName(m) }));

// Guardrails: a province with no cities, or a city pointing at a province that
// isn't listed, is an address nobody can finish.
for (const p of provList) {
  if (!cityList.some((c) => c.provKey === p.code)) throw new Error(`build-psgc: province ${p.code} ${p.name} has no cities`);
}
for (const c of cityList) {
  if (!listed.has(c.provKey)) throw new Error(`build-psgc: city ${c.code} ${c.name} is under unlisted province ${c.provKey}`);
}

write(path.join(OUT, 'provinces.json'), provList.sort(byName));
write(path.join(OUT, 'muncities.json'), cityList.sort(byName));

// Barangays split per PSGC province-level unit so checkout only fetches one file.
const byProv = new Map();
for (const b of barangays) {
  const provKey = b.regCode + b.provCode;
  if (!byProv.has(provKey)) byProv.set(provKey, []);
  byProv.get(provKey).push({ code: b.brgyCode, cityKey: b.regCode + b.munCityCode, name: clean(b.brgyName) });
}
for (const [provKey, list] of byProv) write(path.join(BRGY, provKey + '.json'), list.sort(byName));

console.log(`regions=${regions.length} provinces=${provList.length} (source ${provinces.length}) muncities=${cityList.length} (source ${muncities.length}) barangays=${barangays.length} brgyFiles=${byProv.size}`);
