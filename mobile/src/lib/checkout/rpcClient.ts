/* What checkout needs of a database client to call a database function
   (public_price_schedule, check_tester_code): the app's Supabase client,
   or a test's stand-in that writes the call down. Only the one method, so a
   stand-in doesn't have to pretend to be the whole client. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
