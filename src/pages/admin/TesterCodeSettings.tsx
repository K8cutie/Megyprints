import { useEffect, useState } from 'react';
import { loadTesterSettings, normalizeTesterCode, saveTesterSettings, TESTER_CODE_PATTERN, type TesterSettings } from '../../lib/testerCode';

/* The tester code (0057), owner only. Testers type it at checkout: they see
   the real price, and the album is free. */
export default function TesterCodeSettings() {
  const [saved, setSaved] = useState<TesterSettings | null>(null);
  const [code, setCode] = useState('');
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    loadTesterSettings().then((s) => {
      if (!alive) return;
      setLoading(false);
      if (!s) { setErr("Couldn't load the tester code. Reload the page."); return; }
      setSaved(s); setCode(s.code); setOn(s.on);
    });
    return () => { alive = false; };
  }, []);

  const changed = (fn: () => void) => { fn(); setDone(''); setErr(''); };
  const save = async () => {
    const clean = normalizeTesterCode(code);
    if (!TESTER_CODE_PATTERN.test(clean)) { setErr('The code must be 4 to 24 letters or numbers, no spaces.'); return; }
    setSaving(true); setErr(''); setDone('');
    const next = { code: clean, on };
    const problem = await saveTesterSettings(next);
    setSaving(false);
    if (problem) { setErr(problem); return; }
    setSaved(next); setCode(clean);
    setDone(on ? `Saved. Testers who type ${clean} get the album free.`
      : 'Saved. The tester code is off: everyone pays the normal price.');
  };
  const choice = (active: boolean) => (active
    ? { background: '#fff', borderColor: '#BF5E3E', color: '#2D2D2D' }
    : { background: '#F1EDE7', borderColor: '#DED5C9', color: '#8A8A8A' });

  return (
    <div className="rounded-2xl border-2 border-rust/40 bg-warm-white px-5 py-4" data-testid="tester-code-settings">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-semibold text-dark">Tester code</h3>
          <p className="text-sm text-medium mt-0.5 max-w-lg">
            Testers type this code at checkout. They see the <b>real price</b>, then the album becomes <b>free</b>:
            no payment step, and the order arrives already Paid, marked <b>Tester order</b> on the Orders page.
            Turn it off when testing ends.
          </p>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
          style={saved?.on ? { background: '#E6F4EA', color: '#2E7D4A' } : { background: '#F1EDE7', color: '#8A8A8A' }}
          data-testid="tester-code-status">
          {loading ? '…' : saved?.on ? 'On now' : 'Off now'}
        </span>
      </div>

      {!loading && saved && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-light mb-1">Code</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tester code on or off">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={on === v} onClick={() => changed(() => setOn(v))}
                  data-testid={v ? 'tester-on' : 'tester-off'}
                  className="py-2 px-3 text-sm font-semibold rounded-lg border transition-colors" style={choice(on === v)}>
                  {v ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="tester-code-value" className="text-xs font-semibold uppercase tracking-wide text-light block mb-1">The code</label>
            <input id="tester-code-value" value={code} maxLength={24} autoComplete="off" spellCheck={false}
              onChange={(e) => changed(() => setCode(e.target.value.toUpperCase()))} data-testid="tester-code-value"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono uppercase text-dark bg-white" />
          </div>
        </div>
      )}
      {!loading && saved && (
        <div className="mt-3 flex items-center justify-end gap-3 flex-wrap">
          <button type="button" onClick={() => void save()} disabled={saving} data-testid="tester-code-save"
            className="py-2 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-60"
            style={{ background: '#BF5E3E' }}>
            {saving ? 'Saving…' : 'Save tester code'}
          </button>
        </div>
      )}
      {done && <p className="text-xs text-success mt-2 font-semibold" data-testid="tester-code-saved">✓ {done}</p>}
      {err && <p className="text-xs text-rust-deep mt-2" role="alert" data-testid="tester-code-settings-error">{err}</p>}
    </div>
  );
}
