/* A stand-in for the database for My Memories: the qr_memories rows and the
   customer's orders. It writes down every call (reads with their filters and
   order, updates, inserts) and answers from the rows a test sets. The
   website's functions get the same object (jest.mock('@web/lib/supabase')),
   so a test holds the app's calls against the website's. Nothing leaves the
   computer. */

type Row = Record<string, unknown>;
export interface Call { table: string; op: string; args: unknown[]; chain: [string, ...unknown[]][] }

export const mem = {
  calls: [] as Call[],
  memories: [] as Row[],
  orders: [] as Row[],
  userId: 'user-1' as string | null,
  /** An error the next update / insert / list answers with. */
  updateError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  listError: null as { message: string } | null,
};

export function resetMemories(): void {
  mem.calls = []; mem.memories = []; mem.orders = []; mem.userId = 'user-1';
  mem.updateError = null; mem.insertError = null; mem.listError = null;
}

function filtered(rows: Row[], chain: Call['chain']): Row[] {
  let out = [...rows];
  for (const [op, ...a] of chain) {
    if (op === 'eq') out = out.filter((r) => r[a[0] as string] === a[1]);
    if (op === 'not' && a[1] === 'is' && a[2] === null) out = out.filter((r) => r[a[0] as string] != null);
    if (op === 'order') {
      const key = a[0] as string;
      const asc = (a[1] as { ascending?: boolean } | undefined)?.ascending !== false;
      out.sort((x, y) => (String(x[key]) < String(y[key]) ? -1 : String(x[key]) > String(y[key]) ? 1 : 0) * (asc ? 1 : -1));
    }
  }
  return out;
}

function from(table: string) {
  const call: Call = { table, op: 'select', args: [], chain: [] };
  const rows = () => (table === 'qr_memories' ? mem.memories : table === 'orders' ? mem.orders : []);
  const answer = () => {
    mem.calls.push(call);
    if (call.op === 'update') {
      if (mem.updateError) return { data: null, error: mem.updateError };
      const hit = filtered(mem.memories, call.chain);
      hit.forEach((r) => Object.assign(r, call.args[0] as Row));
      return { data: hit.map((r) => ({ code: r.code })), error: null };
    }
    if (call.op === 'select' && table === 'qr_memories' && mem.listError) return { data: null, error: mem.listError };
    return { data: filtered(rows(), call.chain), error: null };
  };
  const b = {
    select(columns: string) { if (call.op === 'select') call.args = [columns]; else call.chain.push(['select', columns]); return b; },
    update(values: Row) { call.op = 'update'; call.args = [values]; return b; },
    eq(...a: unknown[]) { call.chain.push(['eq', ...a]); return b; },
    not(...a: unknown[]) { call.chain.push(['not', ...a]); return b; },
    order(...a: unknown[]) { call.chain.push(['order', ...a]); return b; },
    async insert(row: Row) {
      mem.calls.push({ table, op: 'insert', args: [row], chain: [] });
      if (mem.insertError) return { error: mem.insertError };
      mem.memories.push({ ...row });
      return { error: null };
    },
    then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve(answer()).then(ok, bad);
    },
  };
  return b;
}

export const memoriesClient = {
  from,
  auth: { async getUser() { return { data: { user: mem.userId ? { id: mem.userId } : null } }; } },
};

/** The module jest puts in place of the website's src/lib/supabase.ts. */
export const webSupabaseModule = { supabase: memoriesClient, supabaseConfigured: true };
