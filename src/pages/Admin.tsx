/* ══════════════════════════════════════════════════════════════════════════
   /admin — the OPERATOR CONSOLE. A management surface separate from the
   customer app (its own chrome, no marketing navbar). Gated to the operator
   account by email (RLS is the real guard).

   Tabs: Overview (stats) · Orders (fulfillment queue) · Templates (curation).
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ClipboardList, LayoutGrid, ArrowLeft, LogOut, Loader2, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { isAdminEmail, ADMIN_EMAILS } from '../lib/templateSettings';
import { fetchAllOrders, type AdminOrder } from '../lib/adminOrders';
import OverviewPanel from './admin/OverviewPanel';
import OrdersPanel from './admin/OrdersPanel';
import TemplatesPanel from './admin/TemplatesPanel';

type Tab = 'overview' | 'orders' | 'templates';
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'templates', label: 'Templates', icon: LayoutGrid },
];

export default function Admin() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersErr, setOrdersErr] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setOrdersErr(null);
    try { setOrders(await fetchAllOrders()); }
    catch (e) { setOrdersErr(e instanceof Error ? e.message : 'Failed to load orders'); }
    finally { setOrdersLoading(false); }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  if (!user) return null; // ProtectedRoute redirects to login
  if (!isAdminEmail(user.email)) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center">
        <p className="text-lg font-semibold text-[#2D2D2D]">Not authorized</p>
        <p className="text-sm mt-2 text-[#6B6B6B]">This console is for the Megy Prints operator account only.</p>
        <p className="text-xs mt-4 text-[#9B9B9B]">
          Signed in as <b>{user.email ?? '(no email)'}</b><br />
          Operator accounts: <b>{ADMIN_EMAILS.join(', ')}</b>
        </p>
        <Link to="/" className="inline-block mt-5 text-sm text-[#E8A598]">← Back to site</Link>
      </div>
    );
  }

  const ordersBlocked = ordersErr && /permission|policy|denied|row-level/i.test(ordersErr);

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5]">
      <header className="bg-white border-b border-[#E8E8E8] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-display italic text-base text-[#2D2D2D]">Megy</span>
            <span className="text-base text-[#2D2D2D]">Prints</span>
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#F4C2A1] text-white ml-1">Operator</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/" className="text-sm text-[#6B6B6B] flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-[#F5F5F5]"><ArrowLeft size={14} /> Site</Link>
            <button onClick={() => void logout()} className="text-sm text-[#6B6B6B] flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-[#F5F5F5]"><LogOut size={14} /> Sign out</button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2.5 text-sm font-medium border-b-2 flex items-center gap-1.5 -mb-px transition-colors"
              style={{ borderColor: tab === t.id ? '#F4C2A1' : 'transparent', color: tab === t.id ? '#2D2D2D' : '#9B9B9B' }}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {ordersErr && (tab === 'overview' || tab === 'orders') && (
          <p className="text-sm text-red-600 mb-4">
            Couldn't load orders: {ordersErr}.
            {ordersBlocked ? ' Run migration 0005_orders_admin.sql in Supabase to grant operator access.' : ''}
          </p>
        )}
        {tab === 'overview' && (ordersLoading ? <Spinner /> : <OverviewPanel orders={orders} />)}
        {tab === 'orders' && (ordersLoading ? <Spinner /> : <OrdersPanel orders={orders} onChanged={loadOrders} />)}
        {tab === 'templates' && <TemplatesPanel />}
      </main>
    </div>
  );
}

function Spinner() {
  return <div className="py-24 flex justify-center text-[#9B9B9B]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
}
