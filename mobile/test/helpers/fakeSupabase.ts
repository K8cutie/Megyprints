/* A stand-in for the database, for running the WEBSITE's checkout functions
   in jest (jest.mock('@web/lib/supabase', ...)): it writes down every insert,
   upsert, RPC and read they make, and answers with what a test sets. Nothing
   leaves the computer. The app's own functions take the same object. */

export interface Recorded {
  inserts: { table: string; row: Record<string, unknown> }[];
  upserts: { table: string; rows: unknown[]; opts: unknown }[];
  rpcs: { name: string; args: unknown }[];
  reads: { table: string; columns: string; filters: Record<string, unknown> }[];
  /** Every upload, with the whole options object it was given. */
  uploads: { bucket: string; path: string; contentType?: string; opts: Record<string, unknown> }[];
}

export const rec: Recorded = { inserts: [], upserts: [], rpcs: [], reads: [], uploads: [] };

export const fake = {
  userId: 'user-1',
  /** What a read of `albums` returns. */
  albumRow: null as Record<string, unknown> | null,
  /** What a read of `orders` returns. */
  orderRow: null as Record<string, unknown> | null,
  /** What each RPC answers. */
  rpc: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  /** What the orders insert answers with as an error (a refused code, the unpaid limit). */
  insertError: null as { message: string; code?: string } | null,
  /** Holds an RPC's answer until the test lets it go (a request still on its way). */
  hold: {} as Record<string, Promise<void> | undefined>,
};

export function resetFake(): void {
  rec.inserts = []; rec.upserts = []; rec.rpcs = []; rec.reads = []; rec.uploads = [];
  fake.userId = 'user-1'; fake.albumRow = null; fake.orderRow = null; fake.rpc = {}; fake.insertError = null; fake.hold = {};
}

function from(table: string) {
  const read = { table, columns: '', filters: {} as Record<string, unknown> };
  const b = {
    select(columns: string) { read.columns = columns; return b; },
    eq(k: string, v: unknown) { read.filters[k] = v; return b; },
    neq() { return b; },
    order() { return b; },
    limit() { return b; },
    async maybeSingle() {
      rec.reads.push(read);
      if (table === 'albums') return { data: fake.albumRow, error: null };
      if (table === 'orders') return { data: fake.orderRow, error: null };
      return { data: null, error: null };
    },
    insert(row: Record<string, unknown>) {
      rec.inserts.push({ table, row });
      return {
        select: () => ({
          single: async () => (fake.insertError
            ? { data: null, error: fake.insertError }
            : { data: { id: 'order-1', order_number: 'MP-2026-TEST01', status: 'pending_payment' }, error: null }),
        }),
      };
    },
    async upsert(rows: unknown[], opts: unknown) { rec.upserts.push({ table, rows, opts }); return { error: null }; },
  };
  return b;
}

export const fakeClient = {
  from,
  async rpc(name: string, args?: unknown) {
    rec.rpcs.push({ name, args });
    const held = fake.hold[name];
    if (held) await held;
    return fake.rpc[name] ?? { data: null, error: null };
  },
  auth: { async getUser() { return { data: { user: { id: fake.userId } } }; } },
};

/** The module jest puts in place of src/lib/supabase.ts. */
export const supabaseModule = { supabase: fakeClient, supabaseConfigured: true };

/** The module jest puts in place of src/lib/storageUpload.ts. */
export const storageUploadModule = {
  async uploadOnce(bucket: string, path: string, _body: unknown, opts?: { contentType?: string } & Record<string, unknown>) {
    rec.uploads.push({ bucket, path, contentType: opts?.contentType, opts: { ...(opts ?? {}) } });
    return null;
  },
};
