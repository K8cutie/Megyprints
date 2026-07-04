import { useEffect, useState } from 'react';
import { loadRegions, loadAllProvinces, loadCities, loadBarangays, type PsgcItem, type ProvinceItem } from '../lib/psgc';
import type { AddressValue } from '../lib/contact';

type Errors = Partial<Record<keyof AddressValue, string>>;

/* Cascading PH address picker (Province → City/Municipality → Barangay) + street
   line + ZIP. There's no Region field: a PH delivery is routed by province → city
   → barangay (the region is redundant on the label), so we DERIVE the region from
   the chosen province and store it silently. Selecting a level resets everything
   deeper. Each list is fetched on demand from public/psgc/ and cached. */
export default function AddressPicker({ value, onChange, errors }: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  errors?: Errors;
}) {
  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [regionByCode, setRegionByCode] = useState<Record<string, string>>({});
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loading, setLoading] = useState<{ prov?: boolean; city?: boolean; brgy?: boolean }>({ prov: true });

  // Load every province once (sorted), plus a regCode → region-name map so a
  // picked province fills in its region behind the scenes.
  useEffect(() => {
    let ok = true;
    Promise.all([loadAllProvinces(), loadRegions()])
      .then(([provs, regions]) => {
        if (!ok) return;
        setProvinces([...provs].sort((a, b) => a.name.localeCompare(b.name)));
        const map: Record<string, string> = {};
        regions.forEach((r) => { map[r.code] = r.name; });
        setRegionByCode(map);
      })
      .catch(() => { if (ok) setProvinces([]); })
      .finally(() => { if (ok) setLoading((l) => ({ ...l, prov: false })); });
    return () => { ok = false; };
  }, []);

  useEffect(() => {
    if (!value.provinceCode) { setCities([]); return; }
    let ok = true; setLoading((l) => ({ ...l, city: true }));
    loadCities(value.provinceCode)
      .then((c) => { if (ok) setCities(c); })
      .catch(() => { if (ok) setCities([]); })
      .finally(() => { if (ok) setLoading((l) => ({ ...l, city: false })); });
    return () => { ok = false; };
  }, [value.provinceCode]);

  useEffect(() => {
    if (!value.provinceCode || !value.cityCode) { setBarangays([]); return; }
    let ok = true; setLoading((l) => ({ ...l, brgy: true }));
    loadBarangays(value.provinceCode, value.cityCode)
      .then((b) => { if (ok) setBarangays(b); })
      .catch(() => { if (ok) setBarangays([]); })
      .finally(() => { if (ok) setLoading((l) => ({ ...l, brgy: false })); });
    return () => { ok = false; };
  }, [value.provinceCode, value.cityCode]);

  const pickProvince = (code: string) => {
    const p = provinces.find((x) => x.code === code);
    onChange({
      ...value,
      provinceCode: code, provinceName: p?.name ?? '',
      // Region derived from the province — stored, never asked for.
      regionCode: p?.regCode ?? '', regionName: p ? (regionByCode[p.regCode] ?? '') : '',
      cityCode: '', cityName: '', barangayCode: '', barangayName: '',
    });
  };
  const pickCity = (code: string) => {
    const c = cities.find((x) => x.code === code);
    onChange({ ...value, cityCode: code, cityName: c?.name ?? '', barangayCode: '', barangayName: '' });
  };
  const pickBarangay = (code: string) => {
    const b = barangays.find((x) => x.code === code);
    onChange({ ...value, barangayCode: code, barangayName: b?.name ?? '' });
  };

  const selCls = (e?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-[#F7F7F7] disabled:text-[#B4B4B4] ${e ? 'border-red-400' : 'border-[#E8E8E8]'}`;
  const inputCls = (e?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm ${e ? 'border-red-400' : 'border-[#E8E8E8]'}`;
  const errText = (k: keyof AddressValue) => (errors?.[k] ? <p className="text-xs text-red-500 mt-1">{errors[k]}</p> : null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#6B6B6B] mb-1 block">Province</label>
          <select value={value.provinceCode} onChange={(e) => pickProvince(e.target.value)} disabled={loading.prov} aria-invalid={!!errors?.provinceCode} className={selCls(errors?.provinceCode)}>
            <option value="">{loading.prov ? 'Loading…' : 'Select province…'}</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          {errText('provinceCode')}
        </div>
        <div>
          <label className="text-xs text-[#6B6B6B] mb-1 block">City / Municipality</label>
          <select value={value.cityCode} onChange={(e) => pickCity(e.target.value)} disabled={!value.provinceCode || loading.city} aria-invalid={!!errors?.cityCode} className={selCls(errors?.cityCode)}>
            <option value="">{loading.city ? 'Loading…' : 'Select city / municipality…'}</option>
            {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          {errText('cityCode')}
        </div>
      </div>

      <div>
        <label className="text-xs text-[#6B6B6B] mb-1 block">Barangay</label>
        <select value={value.barangayCode} onChange={(e) => pickBarangay(e.target.value)} disabled={!value.cityCode || loading.brgy} aria-invalid={!!errors?.barangayCode} className={selCls(errors?.barangayCode)}>
          <option value="">{loading.brgy ? 'Loading…' : 'Select barangay…'}</option>
          {barangays.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
        {errText('barangayCode')}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
        <div>
          <label className="text-xs text-[#6B6B6B] mb-1 block">House / Unit No. &amp; Street</label>
          <input
            value={value.street}
            onChange={(e) => onChange({ ...value, street: e.target.value })}
            maxLength={120} autoComplete="address-line1" placeholder="123 Rizal St., Purok 2"
            aria-invalid={!!errors?.street} className={inputCls(errors?.street)}
          />
          {errText('street')}
        </div>
        <div>
          <label className="text-xs text-[#6B6B6B] mb-1 block">ZIP</label>
          <input
            value={value.zip}
            onChange={(e) => onChange({ ...value, zip: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            inputMode="numeric" maxLength={4} autoComplete="postal-code" placeholder="1109"
            aria-invalid={!!errors?.zip} className={inputCls(errors?.zip)}
          />
          {errText('zip')}
        </div>
      </div>
    </div>
  );
}
