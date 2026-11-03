/* A stand-in for the database and the sign-in, for Your orders, Profile and
   Delete account: it writes down every read (table, columns, each filter and
   order, in order), every RPC and every auth call, and answers with what a
   test sets. Nothing leaves the computer. The website's functions get the
   same object (jest.mock('@web/lib/supabase', ...)), so a test can hold the
   app's query against the website's. */

export interface ReadCall { table: string; columns: string; chain: [string, ...unknown[]][]; single: boolean }

export const calls = {
  reads: [] as ReadCall[],
  rpcs: [] as { name: string; args: unknown }[],
  auth: [] as { fn: string; args: unknown[] }[],
};

type Answer = { data: unknown; error: { message: string; code?: string; status?: number } | null };

export const answers = {
  /** What a read of a table answers (a list read gets an array, maybeSingle the first match). */
  orders: [] as Record<string, unknown>[],
  ordersError: null as { message: string } | null,
  rpc: {} as Record<string, Answer | (() => Answer)>,
  updateUser: { data: {}, error: null } as Answer,
  resetPassword: { data: {}, error: null } as Answer,
  session: { access_token: 'token-abc', user: { id: 'user-1', email: 'maria@example.test' } } as Record<string, unknown> | null,
};

export function resetOrdersFake(): void {
  calls.reads = []; calls.rpcs = []; calls.auth = [];
  answers.orders = []; answers.ordersError = null; answers.rpc = {};
  answers.updateUser = { data: {}, error: null };
  answers.resetPassword = { data: {}, error: null };
  answers.session = { access_token: 'token-abc', user: { id: 'user-1', email: 'maria@example.test' } };
}

/** Applies the recorded eq / neq / not-is-null filters and the order to the rows. */
function run(chain: ReadCall['chain'], rows: Record<string, unknown>[]): Record<string, unknown>[] {
  let out = [...rows];
  for (const [op, ...a] of chain) {
    if (op === 'eq') out = out.filter((r) => r[a[0] as string] === a[1]);
    if (op === 'neq') out = out.filter((r) => r[a[0] as string] !== a[1]);
    if (op === 'not' && a[1] === 'is' && a[2] === null) out = out.filter((r) => r[a[0] as string] !== null && r[a[0] as string] !== undefined);
    if (op === 'order') {
      const key = a[0] as string;
      const asc = (a[1] as { ascending?: boolean } | undefined)?.ascending !== false;
      out.sort((x, y) => (String(x[key]) < String(y[key]) ? -1 : String(x[key]) > String(y[key]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (op === 'limit') out = out.slice(0, a[0] as number);
  }
  return out;
}

function from(table: string) {
  const read: ReadCall = { table, columns: '', chain: [], single: false };
  const answer = (single: boolean) => {
    read.single = single;
    calls.reads.push(read);
    if (answers.ordersError) return { data: null, error: answers.ordersError };
    const rows = table === 'orders' ? run(read.chain, answers.orders) : [];
    return { data: single ? rows[0] ?? null : rows, error: null };
  };
  const b = {
    select(columns: string) { read.columns = columns; return b; },
    eq(...a: unknown[]) { read.chain.push(['eq', ...a]); return b; },
    neq(...a: unknown[]) { read.chain.push(['neq', ...a]); return b; },
    not(...a: unknown[]) { read.chain.push(['not', ...a]); return b; },
    order(...a: unknown[]) { read.chain.push(['order', ...a]); return b; },
    limit(...a: unknown[]) { read.chain.push(['limit', ...a]); return b; },
    async maybeSingle() { return answer(true); },
    then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve(answer(false)).then(ok, bad);
    },
  };
  return b;
}

export const ordersClient = {
  from,
  async rpc(name: string, args?: unknown) {
    calls.rpcs.push({ name, args });
    const a = answers.rpc[name];
    return (typeof a === 'function' ? a() : a) ?? { data: null, error: null };
  },
  auth: {
    async getSession() { calls.auth.push({ fn: 'getSession', args: [] }); return { data: { session: answers.session }, error: null }; },
    async updateUser(...args: unknown[]) { calls.auth.push({ fn: 'updateUser', args }); return answers.updateUser; },
    async resetPasswordForEmail(...args: unknown[]) { calls.auth.push({ fn: 'resetPasswordForEmail', args }); return answers.resetPassword; },
    async signOut(...args: unknown[]) { calls.auth.push({ fn: 'signOut', args }); return { error: null }; },
  },
};

/** The module jest puts in place of the website's src/lib/supabase.ts. */
export const webSupabaseModule = { supabase: ordersClient, supabaseConfigured: true };

/** An order row as the database answers the app's columns. */
export function orderRow(o: Partial<Record<string, unknown>> & { id: string; order_number: string; status: string; created_at: string }): Record<string, unknown> {
  return {
    user_id: 'user-1',
    amount: null,
    quoted_amount: null,
    payment_submitted_at: null,
    album_size: '8x8',
    page_count: 40,
    tracking: null,
    album_title: null,
    album_id: 'album-1',
    tester_code: null,
    ship_name: null,
    ship_phone: null,
    ship_address: null,
    ...o,
  };
}
