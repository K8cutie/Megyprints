/* Messages tab (owner only) — the read side of the public Contact form.

   Before this, contact_messages was write-only: Contact.tsx inserted, and
   nothing in the app ever selected. Submissions accumulated where no human
   would see them. */

import { useState, useEffect } from 'react';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { listContactMessages, type ContactMessage } from '../../lib/contactMessages';

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export default function MessagesPanel() {
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try { setRows(await listContactMessages()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load messages'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  if (loading) {
    return <div className="py-16 text-center"><Loader2 size={20} className="animate-spin inline text-[#9B9B9B]" /></div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#6B6B6B]">
          Messages from the public Contact form, newest first.
        </p>
        <button onClick={() => { setLoading(true); void load(); }}
          className="h-9 px-3 rounded-lg border border-[#E8E8E8] text-sm flex items-center gap-1.5 hover:border-[#F4C2A1]">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <p className="text-sm text-red-500 mb-4">{err}</p>}

      {rows.length === 0 && !err && (
        <div className="py-16 text-center text-sm text-[#9B9B9B]">
          <Mail size={22} className="inline mb-2 opacity-40" />
          <p>No messages yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((m) => (
          <div key={m.id} className="rounded-xl border border-[#EEE7DE] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold text-[#2D2D2D]">{m.subject}</div>
              <div className="text-xs text-[#9B9B9B]">{when(m.created_at)}</div>
            </div>
            <div className="mt-0.5 text-sm text-[#6B6B6B]">
              {m.name}
              {' · '}
              {/* Rendered as text, never as markup — this is anonymous public input. */}
              <a href={`mailto:${encodeURIComponent(m.email)}`} className="text-[#BF5E3E] hover:underline">
                {m.email}
              </a>
            </div>
            <p className="mt-2 text-sm text-[#2D2D2D] whitespace-pre-wrap break-words">{m.message}</p>
          </div>
        ))}
      </div>

      {rows.length >= 100 && (
        <p className="mt-4 text-xs text-[#9B9B9B]">
          Showing the newest 100 messages.
        </p>
      )}
    </div>
  );
}
