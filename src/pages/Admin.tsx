/* ══════════════════════════════════════════════════════════════════════════
   /admin — operator template manager. Gated to the operator account (email).
   Browse every page template per album size, see a thumbnail, and turn each one
   ON/OFF (hidden) or soft-DELETE it (restorable). Album generation only uses
   ACTIVE templates; deletions never touch code, just a Supabase override row.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { supabaseConfigured } from '../lib/supabase';
import {
  ADMIN_EMAIL, isAdminEmail, loadTemplateSettings, getAllStates, setTemplateState, type TemplateState,
} from '../lib/templateSettings';
import { PAGE_TEMPLATES } from './builder/pageTemplates';
import type { AlbumSizePreset } from './builder/types';
import TemplateThumb from './builder/TemplateThumb';

const SIZES: AlbumSizePreset[] = ['6x6', '8x8', '9x9', '6x4', '11.5x8', '8.5x11'];

export default function Admin() {
  const { user } = useAuth();
  const [states, setStates] = useState<Map<string, TemplateState>>(new Map());
  const [size, setSize] = useState<AlbumSizePreset>('8x8');
  const [q, setQ] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadTemplateSettings().then(() => { setStates(getAllStates()); setLoading(false); });
  }, []);

  const update = async (id: string, patch: Partial<TemplateState>) => {
    setSavingId(id); setErr(null);
    const e = await setTemplateState(id, patch);
    if (e && !e.startsWith('Supabase not configured')) setErr(e);
    setStates(new Map(getAllStates()));
    setSavingId(null);
  };

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return PAGE_TEMPLATES
      .filter((t) => t.albumSizes.includes(size))
      .filter((t) => !ql || t.name.toLowerCase().includes(ql) || t.id.toLowerCase().includes(ql))
      .filter((t) => showDeleted || !states.get(t.id)?.deleted);
  }, [size, q, showDeleted, states]);

  const counts = useMemo(() => {
    const all = PAGE_TEMPLATES.filter((t) => t.albumSizes.includes(size));
    const deleted = all.filter((t) => states.get(t.id)?.deleted).length;
    const hidden = all.filter((t) => { const s = states.get(t.id); return s?.hidden && !s?.deleted; }).length;
    return { total: all.length, active: all.length - deleted - hidden, hidden, deleted };
  }, [size, states]);

  if (!user) return null; // ProtectedRoute handles the redirect to login
  if (!isAdminEmail(user.email)) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center">
        <p className="text-lg font-semibold text-[#2D2D2D]">Not authorized</p>
        <p className="text-sm mt-2 text-[#6B6B6B]">This page is for the Megy Prints operator account only.</p>
        <p className="text-xs mt-4 text-[#9B9B9B]">
          Signed in as <b>{user.email ?? '(no email)'}</b><br />
          Operator account is <b>{ADMIN_EMAIL}</b>
        </p>
        <p className="text-xs mt-2 text-[#9B9B9B]">Sign in with the operator email, then reopen this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-display text-[#2D2D2D]">Template manager</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">
          Turn layouts on/off or delete them. Album generation only uses <b>active</b> templates.
        </p>
        {!supabaseConfigured && (
          <p className="text-xs text-amber-600 mt-2">⚠ Supabase not configured — changes are local to this session only.</p>
        )}
        {err && <p className="text-xs text-red-600 mt-2">Save failed: {err}</p>}
      </header>

      {/* Size tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SIZES.map((s) => (
          <button key={s} onClick={() => setSize(s)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: size === s ? '#F4C2A1' : '#F5F5F5', color: size === s ? '#fff' : '#6B6B6B' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Controls + counts */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or id…"
          className="h-9 px-3 rounded-lg border border-[#E8E8E8] text-sm outline-none focus:border-[#F4C2A1] w-56" />
        <label className="flex items-center gap-1.5 text-sm text-[#6B6B6B] cursor-pointer">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
        <div className="text-xs text-[#9B9B9B] ml-auto">
          {counts.total} total · <span className="text-[#2E7D4A]">{counts.active} active</span> · {counts.hidden} hidden · {counts.deleted} deleted
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center text-[#9B9B9B]"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((t) => {
            const s = states.get(t.id) ?? { hidden: false, deleted: false };
            const off = s.hidden || s.deleted;
            const busy = savingId === t.id;
            return (
              <div key={t.id}
                className={`rounded-xl border p-3 ${s.deleted ? 'border-red-200 bg-red-50/40' : 'border-[#E8E8E8] bg-white'}`}>
                <div className="flex justify-center" style={{ opacity: off ? 0.45 : 1 }}>
                  <TemplateThumb template={t} size={size} w={150} />
                </div>
                <div className="mt-2">
                  <div className="text-sm font-medium text-[#2D2D2D] truncate">{t.name}</div>
                  <div className="text-xs text-[#9B9B9B] truncate">
                    {t.slotCount} photo{t.slotCount !== 1 ? 's' : ''}
                    {t.textSlots?.length ? ` · ${t.textSlots.length} text` : ''} · {t.id}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  {!s.deleted && (
                    <button onClick={() => update(t.id, { hidden: !s.hidden })} disabled={busy}
                      className="flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      style={{ background: s.hidden ? '#F5F5F5' : '#E6F4EA', color: s.hidden ? '#9B9B9B' : '#2E7D4A' }}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      {s.hidden ? 'Hidden' : 'Active'}
                    </button>
                  )}
                  {s.deleted ? (
                    <button onClick={() => update(t.id, { deleted: false })} disabled={busy}
                      className="flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 bg-[#F5F5F5] text-[#6B6B6B] disabled:opacity-50">
                      <RotateCcw size={13} /> Restore
                    </button>
                  ) : (
                    <button onClick={() => update(t.id, { deleted: true })} disabled={busy} title="Delete (restorable)"
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FFF1F0] text-[#D44] disabled:opacity-50">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-[#9B9B9B]">No templates match.</p>
          )}
        </div>
      )}
    </div>
  );
}
