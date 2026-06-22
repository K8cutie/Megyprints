// ──────────────────────────────────────────────────────────────────────────
// In-memory Supabase double for the journey-completion loop harness.
//
// The real `createOrderFromLatestAlbum` (src/lib/orders.ts) talks to Supabase
// through the singleton in `src/lib/supabase.ts`. In the harness we redirect
// that import to THIS module (see journey.test.ts `vi.mock`), so the order
// logic runs for real against an in-memory DB we fully control — no network,
// no credentials. It also models the two server-side guards that matter to the
// funnel: authentication, and the RLS insert policy that rejects any
// client-supplied price/status.
// ──────────────────────────────────────────────────────────────────────────

export interface AlbumRow {
  id: string;
  user_id: string;
  title: string;
  album_type?: string;
  album_size?: string;
  selected_template?: string;
  photos_per_page?: number;
  pages?: unknown[];
  photos?: unknown[];
  cover_photo?: unknown;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  user_id: string;
  album_id: string;
  [key: string]: unknown;
}

interface World {
  albums: AlbumRow[];
  orders: OrderRow[];
  authUid: string | null; // the currently-authenticated user, or null
  seq: number;
}

// Module-level mutable world. Both the order logic (via the mocked import) and
// the test share this single instance, so seeding/resetting here is visible to
// the code under test.
const state: World = { albums: [], orders: [], authUid: null, seq: 0 };

export function resetWorld(): void {
  state.albums = [];
  state.orders = [];
  state.authUid = null;
  state.seq = 0;
}

/** Set (or clear) the authenticated user — models Supabase auth state. */
export function setAuthUid(uid: string | null): void {
  state.authUid = uid;
}

/** Seed an album as if it had been built and synced to the cloud. */
export function seedAlbum(album: Partial<AlbumRow> & { user_id: string }): AlbumRow {
  state.seq += 1;
  const row: AlbumRow = {
    id: album.id ?? `album_${state.seq}`,
    user_id: album.user_id,
    title: album.title ?? `Album ${state.seq}`,
    album_type: album.album_type,
    album_size: album.album_size,
    selected_template: album.selected_template,
    photos_per_page: album.photos_per_page,
    pages: album.pages ?? [{}, {}, {}, {}],
    photos: album.photos ?? [],
    cover_photo: album.cover_photo,
    updated_at: album.updated_at ?? new Date(Date.now() + state.seq * 1000).toISOString(),
  };
  state.albums.push(row);
  return row;
}

export function getOrders(): OrderRow[] {
  return state.orders;
}

// ── Minimal query-builder that supports exactly the chains orders.ts uses ──
// albums:  .from('albums').select(...).eq('user_id', id).order('updated_at',{ascending:false}).limit(1)
// orders:  .from('orders').insert({...}).select(...).single()
type Result<T> = { data: T; error: { message: string } | null };

class Query {
  private table: string;
  private filters: Array<[string, unknown]> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private insertRow: Record<string, unknown> | null = null;
  private singleMode = false;

  constructor(table: string) {
    this.table = table;
  }

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(row: Record<string, unknown>) {
    this.insertRow = row;
    return this;
  }
  single() {
    this.singleMode = true;
    return this;
  }

  // Thenable: awaiting the chain runs it.
  then<R>(resolve: (r: Result<unknown>) => R): R {
    return resolve(this.run());
  }

  private run(): Result<unknown> {
    if (this.insertRow) return this.runInsert(this.insertRow);
    return this.runSelect();
  }

  private runSelect(): Result<unknown> {
    let rows: AlbumRow[] = this.table === 'albums' ? [...state.albums] : [];
    for (const [col, val] of this.filters) {
      rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows.sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[col] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[col] ?? '');
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return { data: this.singleMode ? (rows[0] ?? null) : rows, error: null };
  }

  private runInsert(row: Record<string, unknown>): Result<unknown> {
    // RLS guard 1 — must be authenticated, and may only insert your own rows.
    if (!state.authUid) {
      return { data: null, error: { message: 'new row violates row-level security policy (not authenticated)' } };
    }
    if (row.user_id !== state.authUid) {
      return { data: null, error: { message: 'new row violates row-level security policy (user_id mismatch)' } };
    }
    // RLS guard 2 — reject any client-supplied price or status (set server-side).
    if ('amount' in row || 'price' in row || 'status' in row) {
      return { data: null, error: { message: 'new row violates row-level security policy (client-set price/status)' } };
    }
    state.seq += 1;
    const inserted: OrderRow = {
      id: `order_${state.seq}`,
      order_number: `MEGY-${String(1000 + state.seq)}`,
      status: 'pending_payment', // DB default
      user_id: row.user_id as string,
      album_id: row.album_id as string,
      ...row,
    };
    state.orders.push(inserted);
    return { data: this.singleMode ? inserted : [inserted], error: null };
  }
}

export const supabase = {
  from(table: string) {
    return new Query(table);
  },
};

// Mirror the real module's named export so the mocked import is drop-in.
export const supabaseConfigured = true;
