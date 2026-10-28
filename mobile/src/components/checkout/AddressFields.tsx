import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { STREET_MAX, streetLength, type AddressValue } from '@web/lib/contact';
import type { AddressErrors } from '../../lib/checkout/checkoutForm';
import {
  pickBarangay,
  pickCity,
  pickProvince,
  psgc,
  regionNames,
  sortProvinces,
  zipInput,
  type ProvinceItem,
  type PsgcItem,
} from '../../lib/checkout/psgc';
import { space } from '../../lib/theme';
import { ChoiceSheet } from './ChoiceSheet';
import { Field, PickField } from './Field';

type Level = 'prov' | 'city' | 'brgy';

/** The delivery address: Province → City / Municipality → Barangay, then
 *  the street and ZIP. The website's picker (AddressPicker), on a phone: no
 *  Region box (it is worked out and stored), picking a level clears the ones
 *  under it, and the street is never cut (its count shows near the limit). */
export function AddressFields({ value, onChange, errors }: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  errors: AddressErrors;
}) {
  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [regionByCode, setRegionByCode] = useState<Record<string, string>>({});
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loading, setLoading] = useState<Record<Level, boolean>>({ prov: true, city: false, brgy: false });
  const [failed, setFailed] = useState<Record<Level, boolean>>({ prov: false, city: false, brgy: false });
  const [tries, setTries] = useState<Record<Level, number>>({ prov: 0, city: 0, brgy: 0 });
  const [open, setOpen] = useState<Level | null>(null);

  const mark = (level: Level, l: boolean, f: boolean) => {
    setLoading((s) => ({ ...s, [level]: l }));
    setFailed((s) => ({ ...s, [level]: f }));
  };

  useEffect(() => {
    let ok = true;
    mark('prov', true, false);
    Promise.all([psgc.loadAllProvinces(), psgc.loadRegions()])
      .then(([provs, regions]) => {
        if (!ok) return;
        setProvinces(sortProvinces(provs));
        setRegionByCode(regionNames(regions));
        mark('prov', false, false);
      })
      .catch(() => { if (ok) { setProvinces([]); mark('prov', false, true); } });
    return () => { ok = false; };
  }, [tries.prov]);

  useEffect(() => {
    if (!value.provinceCode) { setCities([]); return; }
    let ok = true;
    mark('city', true, false);
    psgc.loadCities(value.provinceCode)
      .then((c) => { if (ok) { setCities(c); mark('city', false, false); } })
      .catch(() => { if (ok) { setCities([]); mark('city', false, true); } });
    return () => { ok = false; };
  }, [value.provinceCode, tries.city]);

  useEffect(() => {
    if (!value.cityCode) { setBarangays([]); return; }
    let ok = true;
    mark('brgy', true, false);
    psgc.loadBarangays(value.cityCode)
      .then((b) => { if (ok) { setBarangays(b); mark('brgy', false, false); } })
      .catch(() => { if (ok) { setBarangays([]); mark('brgy', false, true); } });
    return () => { ok = false; };
  }, [value.cityCode, tries.brgy]);

  const failedText = "Couldn't load the list. Tap to try again.";
  // A level whose parent isn't picked opens the parent, through the same
  // checks: still loading does nothing yet, a list that didn't load tries again.
  const tap = (level: Level): void => {
    if (level === 'city' && !value.provinceCode) return tap('prov');
    if (level === 'brgy' && !value.cityCode) return tap(value.provinceCode ? 'city' : 'prov');
    if (loading[level]) return;
    if (failed[level]) { setTries((t) => ({ ...t, [level]: t[level] + 1 })); return; }
    setOpen(level);
  };
  const prompt = (level: Level, ready: string) => (loading[level] ? 'Loading…' : failed[level] ? failedText : ready);

  const street = streetLength(value.street);
  return (
    <View style={styles.wrap}>
      <PickField label="Province" value={value.provinceName} prompt={prompt('prov', 'Select province…')} error={errors.provinceCode} onPress={() => tap('prov')} testID="address-province" />
      <PickField
        label="City / Municipality"
        value={value.cityName}
        prompt={value.provinceCode ? prompt('city', 'Select city / municipality…') : 'Choose the province first'}
        error={errors.cityCode}
        onPress={() => tap('city')}
        testID="address-city"
      />
      <PickField
        label="Barangay"
        value={value.barangayName}
        prompt={value.cityCode ? prompt('brgy', 'Select barangay…') : value.provinceCode ? 'Choose the city first' : 'Choose the province first'}
        error={errors.barangayCode}
        onPress={() => tap('brgy')}
        testID="address-barangay"
      />
      <Field
        label="House / Unit No. & Street"
        value={value.street}
        onChangeText={(t) => onChange({ ...value, street: t })}
        placeholder="123 Rizal St., Purok 2"
        autoComplete="street-address"
        error={errors.street}
        note={street >= STREET_MAX - 20 ? { text: `${street}/${STREET_MAX}`, bad: street > STREET_MAX } : null}
        testID="address-street"
      />
      <Field
        label="ZIP"
        value={value.zip}
        onChangeText={(t) => onChange({ ...value, zip: zipInput(t) })}
        placeholder="1109"
        keyboardType="number-pad"
        maxLength={4}
        autoComplete="postal-code"
        error={errors.zip}
        style={styles.zip}
        testID="address-zip"
      />

      <ChoiceSheet visible={open === 'prov'} title="Province" items={provinces} selected={value.provinceCode}
        onPick={(code) => { setOpen(null); onChange(pickProvince(value, provinces, regionByCode, code)); }} onClose={() => setOpen(null)} />
      <ChoiceSheet visible={open === 'city'} title="City / Municipality" items={cities} selected={value.cityCode}
        onPick={(code) => { setOpen(null); onChange(pickCity(value, cities, regionByCode, code)); }} onClose={() => setOpen(null)} />
      <ChoiceSheet visible={open === 'brgy'} title="Barangay" items={barangays} selected={value.barangayCode}
        onPick={(code) => { setOpen(null); onChange(pickBarangay(value, barangays, code)); }} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  zip: { maxWidth: 140 },
});
