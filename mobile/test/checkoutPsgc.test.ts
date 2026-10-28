/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the app's address picker must offer exactly the provinces,
   cities and barangays the website's does, and store the same region, or a
   phone order would carry an address the website could never have made.

   It runs the WEBSITE's own src/lib/psgc.ts on the real lists in
   public/psgc/ (the only change: its Vite-only import.meta.env.BASE_URL is
   set to the test folder, since jest can't read Vite values) next to the
   app's psgc.ts, for EVERY province and EVERY city, and requires the same
   answers. The picking rules (AddressPicker.tsx is a web component, so it
   can't run here) are checked against its source and on the tricky places.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { EMPTY_ADDRESS } from '@web/lib/contact';
import {
  cityRegion,
  cityUnit,
  filterChoices,
  makePsgc,
  pickBarangay,
  pickCity,
  pickProvince,
  psgcLoader,
  regionNames,
  sortProvinces,
  zipInput,
  type ProvinceItem,
  type Psgc,
  type PsgcItem,
} from '../src/lib/checkout/psgc';
import { BASE, fetchFromDisk } from './helpers/psgcFiles';

const WEB_SRC = path.resolve(__dirname, '../../src');

/** The website's psgc.ts, run as it is (BASE_URL set, fetch = the files). */
function websitePsgc(): Psgc {
  const source = readFileSync(path.join(WEB_SRC, 'lib/psgc.ts'), 'utf8');
  expect(source).toContain('`${import.meta.env.BASE_URL}psgc/`');
  const js = ts.transpileModule(source.replace('import.meta.env.BASE_URL', JSON.stringify(BASE.replace(/psgc\/$/, ''))), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'module', 'fetch', js)(mod.exports, mod, fetchFromDisk);
  return mod.exports as unknown as Psgc;
}

const web = websitePsgc();
const app = makePsgc(psgcLoader(fetchFromDisk, BASE));

describe("the lists are the website's, everywhere", () => {
  it('every province, every city, every barangay: the same', async () => {
    const [webProvs, appProvs] = await Promise.all([web.loadAllProvinces(), app.loadAllProvinces()]);
    expect(appProvs).toEqual(webProvs);
    expect(await app.loadRegions()).toEqual(await web.loadRegions());
    let cities = 0;
    let barangays = 0;
    for (const p of webProvs) {
      const [wc, ac] = await Promise.all([web.loadCities(p.code), app.loadCities(p.code)]);
      expect(ac).toEqual(wc);
      expect(await app.loadProvinces(p.regCode)).toEqual(await web.loadProvinces(p.regCode));
      for (const c of wc) {
        const [wb, ab] = await Promise.all([web.loadBarangays(c.code), app.loadBarangays(c.code)]);
        expect(ab).toEqual(wb);
        barangays += wb.length;
      }
      cities += wc.length;
    }
    console.log(`PSGC compared with the website's psgc.ts: ${webProvs.length} provinces, ${cities} cities/municipalities, ${barangays} barangays, all the same`);
    expect(webProvs.length).toBeGreaterThan(80);
    expect(cities).toBeGreaterThan(1600);
    expect(barangays).toBeGreaterThan(40000);
  });

  it('cityUnit and cityRegion are the website\'s', () => {
    const exp = web as unknown as { cityUnit: (c: string) => string; cityRegion: (c: string) => string };
    for (const code of ['1380300', '0990101', '0730600', '0403403', '1374000']) {
      expect(cityUnit(code)).toBe(exp.cityUnit(code));
      expect(cityRegion(code)).toBe(exp.cityRegion(code));
    }
  });

  it('a list that fails to load is tried again next time (not stuck failed)', async () => {
    let calls = 0;
    const flaky = psgcLoader(async (url) => { calls++; return calls === 1 ? { ok: false, status: 503, json: async () => null } : fetchFromDisk(url); }, BASE);
    const p = makePsgc(flaky);
    await expect(p.loadRegions()).rejects.toThrow('PSGC load failed (503): regions.json');
    expect((await p.loadRegions()).length).toBeGreaterThan(10);
  });
});

describe("picking is the website's (AddressPicker)", () => {
  const picker = readFileSync(path.join(WEB_SRC, 'components/AddressPicker.tsx'), 'utf8');

  it('the same rules as the website\'s picker source', () => {
    // Provinces sorted by name; region from the province, then from the city's code.
    expect(picker).toContain('setProvinces([...provs].sort((a, b) => a.name.localeCompare(b.name)));');
    expect(picker).toContain("regionCode: p?.regCode ?? '', regionName: p ? (regionByCode[p.regCode] ?? '') : '',");
    expect(picker).toContain("cityCode: '', cityName: '', barangayCode: '', barangayName: '',");
    expect(picker).toContain('const regionCode = c ? cityRegion(c.code) : value.regionCode;');
    expect(picker).toContain("regionCode, regionName: regionByCode[regionCode] ?? value.regionName,");
    expect(picker).toContain("onChange({ ...value, barangayCode: code, barangayName: b?.name ?? '' });");
    expect(picker).toContain("zip: e.target.value.replace(/\\D/g, '').slice(0, 4)");
    // Words on the boxes.
    for (const w of ['Province', 'City / Municipality', 'Barangay', 'House / Unit No. &amp; Street', 'ZIP', 'Select province…', 'Select city / municipality…', 'Select barangay…', '123 Rizal St., Purok 2', '1109']) {
      expect(picker).toContain(w);
    }
  });

  async function lists() {
    const provinces = sortProvinces(await app.loadAllProvinces());
    const regions = regionNames(await app.loadRegions());
    return { provinces, regions };
  }
  const named = (items: readonly PsgcItem[], name: string) => {
    const it = items.find((x) => x.name === name);
    if (!it) throw new Error(`not found: ${name}`);
    return it;
  };

  it('Isabela City is stored as Region IX, though listed under Basilan (BARMM)', async () => {
    const { provinces, regions } = await lists();
    const basilan = named(provinces, 'Basilan') as ProvinceItem;
    let a = pickProvince(EMPTY_ADDRESS, provinces, regions, basilan.code);
    expect(a.regionName).toBe('Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)');
    const cities = await app.loadCities(basilan.code);
    a = pickCity(a, cities, regions, named(cities, 'Isabela City').code);
    expect(a).toMatchObject({ regionCode: '09', regionName: 'Region IX (Zamboanga Peninsula)', provinceName: 'Basilan', cityName: 'Isabela City' });
    const brgys = await app.loadBarangays(a.cityCode);
    expect(brgys.length).toBe(45);
  });

  it("Makati's barangays come from its own file, though it is listed under Metro Manila", async () => {
    const { provinces, regions } = await lists();
    const mm = named(provinces, 'Metro Manila');
    let a = pickProvince(EMPTY_ADDRESS, provinces, regions, mm.code);
    const cities = await app.loadCities(mm.code);
    a = pickCity(a, cities, regions, named(cities, 'Makati City').code);
    expect(cityUnit(a.cityCode)).not.toBe(mm.code);
    const brgys = await app.loadBarangays(a.cityCode);
    expect(brgys.length).toBeGreaterThan(20);
    a = pickBarangay(a, brgys, brgys[0].code);
    expect(a.barangayName).toBe(brgys[0].name);
    expect(a.regionName).toBe('National Capital Region (NCR)');
  });

  it('picking a province again clears the city and barangay; street and ZIP stay', async () => {
    const { provinces, regions } = await lists();
    const cebu = named(provinces, 'Cebu');
    let a = { ...pickProvince(EMPTY_ADDRESS, provinces, regions, cebu.code), street: '12 Osmeña Blvd', zip: '6000' };
    const cities = await app.loadCities(cebu.code);
    a = pickCity(a, cities, regions, named(cities, 'Cebu City').code);
    const brgys = await app.loadBarangays(a.cityCode);
    a = pickBarangay(a, brgys, brgys[3].code);
    const laguna = named(provinces, 'Laguna');
    const b = pickProvince(a, provinces, regions, laguna.code);
    expect(b).toMatchObject({ provinceName: 'Laguna', cityCode: '', cityName: '', barangayCode: '', barangayName: '', street: '12 Osmeña Blvd', zip: '6000', regionCode: '04' });
    // A new city clears the barangay only.
    const c = pickCity(a, cities, regions, named(cities, 'Cebu City').code);
    expect(c).toMatchObject({ barangayCode: '', barangayName: '', cityName: 'Cebu City', provinceName: 'Cebu' });
  });

  it('the ZIP box keeps 4 digits; find-as-you-type finds Biñan by "binan"', async () => {
    expect(zipInput('11a0 9 9')).toBe('1109');
    const cities = await app.loadCities(named(sortProvinces(await app.loadAllProvinces()), 'Laguna').code);
    expect(filterChoices(cities, 'binan').map((c) => c.name)).toEqual(['Biñan City']);
    expect(filterChoices(cities, '  ').length).toBe(cities.length);
  });
});
