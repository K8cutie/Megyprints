/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Your orders, the order screen and Profile read the
   customer's orders through the WEBSITE's own code (src/lib/myOrdersCloud.ts,
   shared), not a copy. This runs the website's functions (src/lib/myOrders.ts,
   with the database a stand-in) next to the app's, and requires the same
   query: the same table, the same filters in the same order, newest first,
   only this account's orders (an operator's session can read every order,
   so "everything I can see" would be every customer's). The app reads one
   column more: quoted_amount, the total the customer was asked to pay.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SHARED_MODULES } from '@web/shared/sharedModules';
import { MY_ORDER_COLUMNS } from '@web/lib/myOrdersCloud';
import { APP_ORDER_COLUMNS, cancelUnpaidOrder, getAppOrder, lastShipping, listAppOrders } from '../src/lib/orders/myOrders';
import { openOrderForAlbum } from '../src/lib/checkout/openOrder';
import { answers, calls, orderRow, ordersClient, resetOrdersFake } from './helpers/fakeOrders';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeOrders').webSupabaseModule);

/* eslint-disable @typescript-eslint/no-require-imports */
const web = require('@web/lib/myOrders') as {
  listMyOrders(userId: string): Promise<{ id: string }[]>;
  getMyOrder(userId: string, orderId: string): Promise<{ id: string } | null>;
  openOrderForAlbum(userId: string, albumId: string): Promise<{ id: string } | null>;
  cancelMyUnpaidOrder(orderId: string): Promise<boolean>;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const WEB = path.resolve(__dirname, '../..');
const migration = (name: string) => readFileSync(path.join(WEB, 'supabase/migrations', name), 'utf8');
const client = ordersClient as never;

beforeEach(() => {
  resetOrdersFake();
  answers.orders = [
    orderRow({ id: 'o1', order_number: 'MP-2026-AAA1111', status: 'pending_payment', created_at: '2026-10-20T01:00:00Z', quoted_amount: 1288, album_id: 'album-1' }),
    orderRow({ id: 'o2', order_number: 'MP-2026-BBB2222', status: 'paid', created_at: '2026-10-25T01:00:00Z', amount: 1710, quoted_amount: 1710, ship_name: 'Maria Santos', ship_phone: '+639171234567', ship_address: '12 Mabini St, Canlalay, Biñan City, Laguna, 4024' }),
    orderRow({ id: 'o3', order_number: 'MP-2026-CCC3333', status: 'delivered', created_at: '2026-09-01T01:00:00Z', user_id: 'someone-else' }),
  ];
});

describe("the app reads orders with the website's own code", () => {
  it('both shared files are on the shared list', () => {
    expect(SHARED_MODULES).toContain('src/lib/myOrdersCloud.ts');
    expect(SHARED_MODULES).toContain('src/lib/accountDeletionRules.ts');
  });

  it("Your orders: the website's query, plus quoted_amount", async () => {
    const webRows = await web.listMyOrders('user-1');
    const appRows = await listAppOrders(client, 'user-1');
    const [w, a] = calls.reads;
    expect(a.table).toBe(w.table);
    expect(a.chain).toEqual(w.chain);
    expect(w.chain).toEqual([['eq', 'user_id', 'user-1'], ['order', 'created_at', { ascending: false }]]);
    expect(w.columns).toBe(MY_ORDER_COLUMNS);
    expect(a.columns).toBe(`${MY_ORDER_COLUMNS}, quoted_amount`);
    expect(APP_ORDER_COLUMNS).toBe(a.columns);
    // Only this account's, newest first, on both.
    expect(appRows.map((o) => o.id)).toEqual(['o2', 'o1']);
    expect(webRows.map((o) => o.id)).toEqual(['o2', 'o1']);
  });

  it("one order: the website's query (by its id AND this account), plus quoted_amount", async () => {
    await web.getMyOrder('user-1', 'o1');
    const mine = await getAppOrder(client, 'user-1', 'o1');
    const notMine = await getAppOrder(client, 'user-1', 'o3');
    const [w, a] = calls.reads;
    expect(a.chain).toEqual(w.chain);
    expect(w.chain).toEqual([['eq', 'user_id', 'user-1'], ['eq', 'id', 'o1']]);
    expect(a.single && w.single).toBe(true);
    expect(mine?.quoted_amount).toBe(1288);
    expect(notMine).toBeNull();
  });

  it('a read that fails throws its message on both (so the screen says "couldn\'t load", never "no orders")', async () => {
    answers.ordersError = { message: 'Failed to fetch' };
    await expect(web.listMyOrders('user-1')).rejects.toThrow('Failed to fetch');
    await expect(listAppOrders(client, 'user-1')).rejects.toThrow('Failed to fetch');
    await expect(getAppOrder(client, 'user-1', 'o1')).rejects.toThrow('Failed to fetch');
  });

  it("cancelling: the website's RPC and its answers", async () => {
    for (const data of [true, false, null, 'yes']) {
      resetOrdersFake();
      answers.rpc.cancel_my_unpaid_order = { data, error: null };
      const w = await web.cancelMyUnpaidOrder('o1');
      const a = await cancelUnpaidOrder(client, 'o1');
      expect(a).toBe(w);
      expect(calls.rpcs).toEqual([{ name: 'cancel_my_unpaid_order', args: { p_order_id: 'o1' } }, { name: 'cancel_my_unpaid_order', args: { p_order_id: 'o1' } }]);
    }
    answers.rpc.cancel_my_unpaid_order = { data: null, error: { message: "You've cancelled 3 orders today." } };
    await expect(cancelUnpaidOrder(client, 'o1')).rejects.toThrow("You've cancelled 3 orders today.");
    // The database's own rule (0042): only my order, still unpaid, payment not sent.
    const sql = migration('0042_unpaid_order_expiry.sql');
    expect(sql).toContain('create or replace function public.cancel_my_unpaid_order(p_order_id uuid)');
    expect(sql).toMatch(/and o\.user_id = auth\.uid\(\)\s+and o\.status = 'pending_payment'\s+and o\.payment_status = 'unpaid'\s+and o\.payment_submitted_at is null;/);
  });

  it("checkout's \"this album already has an order\" now reads through the same shared function as the website", async () => {
    await web.openOrderForAlbum('user-1', 'album-1');
    const o = await openOrderForAlbum(client, 'user-1', 'album-1');
    const [w, a] = calls.reads;
    expect(a.chain).toEqual(w.chain);
    expect(a.columns).toBe(APP_ORDER_COLUMNS);
    expect(o?.id).toBe('o1');
  });

  it("Profile's delivery details: this account's newest order that has them", async () => {
    const s = await lastShipping(client, 'user-1');
    expect(calls.reads[0].columns).toBe('order_number, created_at, ship_name, ship_phone, ship_address');
    expect(calls.reads[0].chain).toEqual([['eq', 'user_id', 'user-1'], ['not', 'ship_phone', 'is', null], ['order', 'created_at', { ascending: false }], ['limit', 1]]);
    expect(s).toMatchObject({ order_number: 'MP-2026-BBB2222', created_at: '2026-10-25T01:00:00Z', ship_name: 'Maria Santos', ship_phone: '+639171234567', ship_address: '12 Mabini St, Canlalay, Biñan City, Laguna, 4024' });
    answers.orders = [];
    expect(await lastShipping(client, 'user-1')).toBeNull();
  });

  it('every column the app reads is in the database, and a customer may read it', () => {
    const all = readFileSync(path.join(WEB, 'supabase/migrations/0001_init.sql'), 'utf8')
      + ['0010_shipping_structured.sql', '0033_payment_proof.sql', '0055_order_quoted_total.sql', '0057_tester_code.sql']
        .map((f) => { try { return migration(f); } catch { return ''; } }).join('\n');
    for (const col of ['quoted_amount', 'tester_code', 'ship_name', 'ship_phone', 'ship_address', 'tracking', 'payment_submitted_at']) {
      expect(`${all}\n${readMigrations()}`).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(migration('0026_grants_and_contact_ratelimit.sql')).toContain('grant select, insert, update on public.orders to authenticated;');
  });
});

function readMigrations(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = path.join(WEB, 'supabase/migrations');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}
