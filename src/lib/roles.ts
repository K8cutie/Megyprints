/* ══════════════════════════════════════════════════════════════════════════
   Operator roles — owner (full access) vs fulfillment (status only).
   The database decides (operator_role(), migration 0058): the built-in owners
   by ACCOUNT (owner_accounts), Team members from the operator_roles table when
   they sign in with Google with that email. The email in the login is not
   proof on its own — new sign-ups are not asked to confirm theirs. RLS + the
   DB functions are the real enforcement; this just drives the UI.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';

export type Role = 'owner' | 'fulfillment';
export interface OperatorRole { email: string; role: Role; }

/** The signed-in account's role, as the database decides it. `email` is only
 *  "is someone signed in"; it is not compared. null = no access. */
export async function resolveRole(email?: string | null): Promise<Role | null> {
  if (!email || !supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('operator_role');
  if (error) { console.warn('resolveRole failed:', error.message); return null; }
  return data === 'owner' || data === 'fulfillment' ? data : null;
}

/** All team members (owner only — RLS enforces). */
export async function listRoles(): Promise<OperatorRole[]> {
  const { data, error } = await supabase
    .from('operator_roles').select('email, role').order('email');
  if (error) throw new Error(error.message);
  return (data ?? []) as OperatorRole[];
}

/** Add or change a team member's role (owner only). */
export async function setRole(email: string, role: Role): Promise<string | null> {
  const { error } = await supabase
    .from('operator_roles').upsert({ email: email.trim().toLowerCase(), role });
  return error ? error.message : null;
}

/** Remove a team member (owner only). */
export async function removeRole(email: string): Promise<string | null> {
  const { error } = await supabase.from('operator_roles').delete().eq('email', email);
  return error ? error.message : null;
}
