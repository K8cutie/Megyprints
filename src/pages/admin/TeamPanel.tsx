/* Team tab (owner only) — add teammates and set their role. Fulfillment can only
   advance order status; owner has full access. Persisted in operator_roles. */

import { useState, useEffect } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { listRoles, setRole as saveRole, removeRole, type OperatorRole, type Role } from '../../lib/roles';
import { ADMIN_EMAILS } from '../../lib/templateSettings';

export default function TeamPanel() {
  const [rows, setRows] = useState<OperatorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRoleSel] = useState<Role>('fulfillment');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try { setRows(await listRoles()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load team'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) { setErr('Enter a valid email'); return; }
    setBusy(true); setErr(null);
    const er = await saveRole(e, role);
    if (er) setErr(er); else { setEmail(''); await load(); }
    setBusy(false);
  };
  const remove = async (em: string) => {
    setBusy(true); setErr(null);
    const er = await removeRole(em);
    if (er) setErr(er); else await load();
    setBusy(false);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-[#6B6B6B] mb-4">
        Add teammates and set what they can do. <b>Fulfillment</b> can advance order status only —
        no prices, revenue, overview, or templates. <b>Owner</b> has full access.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="teammate@email.com"
          className="h-9 px-3 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1] flex-1 min-w-[200px]" />
        <select value={role} onChange={(e) => setRoleSel(e.target.value as Role)}
          className="h-9 px-2 rounded-lg border border-[#E8E8E8] text-sm bg-white">
          <option value="fulfillment">Fulfillment</option>
          <option value="owner">Owner</option>
        </select>
        <button onClick={add} disabled={busy}
          className="h-9 px-4 rounded-lg bg-[#F4C2A1] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
        </button>
      </div>
      <p className="text-xs text-[#9B9B9B] mb-5">The teammate must sign up with this email before they can log in.</p>
      {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

      {/* Built-in owners */}
      <h3 className="text-xs font-semibold text-[#9B9B9B] uppercase tracking-wide mb-2">Owners</h3>
      <div className="rounded-xl border border-[#E8E8E8] bg-white divide-y divide-[#F0F0F0] mb-5">
        {ADMIN_EMAILS.map((em) => (
          <div key={em} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[#2D2D2D]">{em}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDE8E4] text-[#E8A598] font-semibold">Owner · built-in</span>
          </div>
        ))}
      </div>

      {/* Assigned teammates */}
      <h3 className="text-xs font-semibold text-[#9B9B9B] uppercase tracking-wide mb-2">Team</h3>
      {loading ? (
        <div className="py-10 flex justify-center text-[#9B9B9B]"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#9B9B9B] text-center py-6">No teammates added yet.</p>
      ) : (
        <div className="rounded-xl border border-[#E8E8E8] bg-white divide-y divide-[#F0F0F0]">
          {rows.map((r) => (
            <div key={r.email} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-[#2D2D2D]">{r.email}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0F0F0] text-[#6B6B6B] font-medium capitalize">{r.role}</span>
                <button onClick={() => remove(r.email)} disabled={busy} className="text-[#D44] disabled:opacity-50" title="Remove">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
