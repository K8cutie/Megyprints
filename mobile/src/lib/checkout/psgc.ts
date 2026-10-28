/* ══════════════════════════════════════════════════════════════════════════
   THE DELIVERY ADDRESS LISTS (PSGC): province → city / municipality →
   barangay, the same lists and the same rules as the website's address
   picker (src/lib/psgc.ts + src/components/AddressPicker.tsx).

   THE DATA is the website's own: public/psgc/ (regions.json, provinces.json,
   muncities.json, and one barangay file per province-level unit in brgy/),
   read from the website the way its pages read it, each file once per app
   run (see site.ts for why it is not inside the app).

   THE RULES are a MIRROR: psgc.ts can't be shared as it is (it reads a
   Vite-only value, import.meta.env.BASE_URL) and the picker is a web
   component. test/checkoutPsgc.test.ts runs the website's psgc.ts on the real
   data next to these and fails on any difference:
     • provinces are the ones people write on mail (Metro Manila is one),
       sorted by name; there is no Region field;
     • the region is worked out and stored silently: from the province, then
       from the CITY's code once a city is picked (a city can sit in another
       region than the province it is listed under: Isabela City is Region IX,
       listed under Basilan, BARMM);
     • a city's barangays come from its own unit's file (first 5 characters
       of its code), which can differ from the province it is listed under
       (Makati is its own unit, listed under Metro Manila);
     • picking a level clears everything under it.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AddressValue } from '@web/lib/contact';
import { siteFile } from './site';

export interface PsgcItem { code: string; name: string }
export interface ProvinceItem extends PsgcItem { regCode: string }
interface Muncity extends PsgcItem { provKey: string }
interface Barangay extends PsgcItem { cityKey: string }

export type JsonLoader = <T>(file: string) => Promise<T>;

/** Reads the website's psgc/ files, each once (a failed read is tried again
 *  next time). `get` is fetch on the phone; tests pass the files on disk. */
export function psgcLoader(get: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>, base: string = siteFile('psgc/')): JsonLoader {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(file: string): Promise<T> => {
    if (!cache.has(file)) {
      cache.set(
        file,
        get(base + file).then((r) => {
          if (!r.ok) throw new Error(`PSGC load failed (${r.status}): ${file}`);
          return r.json();
        }).catch((e: unknown) => { cache.delete(file); throw e; }),
      );
    }
    return cache.get(file) as Promise<T>;
  };
}

/** A city's PSGC province-level unit: the first 5 characters of its code.
 *  That is its barangay file. Its first 2 characters are its region. */
export const cityUnit = (cityCode: string) => cityCode.slice(0, 5);
export const cityRegion = (cityCode: string) => cityCode.slice(0, 2);

export interface Psgc {
  loadRegions: () => Promise<PsgcItem[]>;
  loadAllProvinces: () => Promise<ProvinceItem[]>;
  loadProvinces: (regionCode: string) => Promise<PsgcItem[]>;
  loadCities: (provinceCode: string) => Promise<PsgcItem[]>;
  loadBarangays: (cityCode: string) => Promise<PsgcItem[]>;
}

export function makePsgc(load: JsonLoader): Psgc {
  return {
    loadRegions: () => load<PsgcItem[]>('regions.json'),
    loadAllProvinces: () => load<ProvinceItem[]>('provinces.json'),
    loadProvinces: async (regionCode) => (await load<ProvinceItem[]>('provinces.json')).filter((p) => p.regCode === regionCode),
    loadCities: async (provinceCode) => (await load<Muncity[]>('muncities.json')).filter((m) => m.provKey === provinceCode),
    loadBarangays: async (cityCode) => (await load<Barangay[]>(`brgy/${cityUnit(cityCode)}.json`)).filter((b) => b.cityKey === cityCode),
  };
}

/** The app's lists, read from the website. */
export const psgc: Psgc = makePsgc(psgcLoader((url) => fetch(url)));

/** The province list as the picker shows it: sorted by name. */
export function sortProvinces(provinces: readonly ProvinceItem[]): ProvinceItem[] {
  return [...provinces].sort((a, b) => a.name.localeCompare(b.name));
}

/** regCode → region name, to fill in the region behind the scenes. */
export function regionNames(regions: readonly PsgcItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  regions.forEach((r) => { map[r.code] = r.name; });
  return map;
}

/* ── Picking a level (AddressPicker's pickProvince / pickCity / pickBarangay) ── */

export function pickProvince(value: AddressValue, provinces: readonly ProvinceItem[], regionByCode: Record<string, string>, code: string): AddressValue {
  const p = provinces.find((x) => x.code === code);
  return {
    ...value,
    provinceCode: code, provinceName: p?.name ?? '',
    regionCode: p?.regCode ?? '', regionName: p ? (regionByCode[p.regCode] ?? '') : '',
    cityCode: '', cityName: '', barangayCode: '', barangayName: '',
  };
}

export function pickCity(value: AddressValue, cities: readonly PsgcItem[], regionByCode: Record<string, string>, code: string): AddressValue {
  const c = cities.find((x) => x.code === code);
  const regionCode = c ? cityRegion(c.code) : value.regionCode;
  return {
    ...value, cityCode: code, cityName: c?.name ?? '', barangayCode: '', barangayName: '',
    regionCode, regionName: regionByCode[regionCode] ?? value.regionName,
  };
}

export function pickBarangay(value: AddressValue, barangays: readonly PsgcItem[], code: string): AddressValue {
  const b = barangays.find((x) => x.code === code);
  return { ...value, barangayCode: code, barangayName: b?.name ?? '' };
}

/** The ZIP box keeps digits only, at most 4 (as on the website). */
export function zipInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/** Find-as-you-type in a long list (a city can have hundreds of barangays):
 *  every word typed must appear in the name, any case, ñ as n. */
export function filterChoices<T extends PsgcItem>(items: readonly T[], typed: string): T[] {
  const fold = (s: string) => {
    const lower = s.toLowerCase();
    try { return lower.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch { return lower.replace(/ñ/g, 'n'); }
  };
  const words = fold(typed).split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  return items.filter((it) => { const n = fold(it.name); return words.every((w) => n.includes(w)); });
}
