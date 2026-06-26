/* ══════════════════════════════════════════════════════════════════════════
   Operator roles — owner (full access) vs fulfillment (status only).
   Owners are the hardcoded ADMIN_EMAILS; fulfillment operators are assigned in
   the operator_roles table from the Team tab. RLS + the DB functions in
   migration 0007 are the real enforcement; this just drives the UI.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import { ADMIN_EMAILS } from './templateSettings';

export type Role = 'owner' | 'fulfillment';
export interface OperatorRole { email: string; role: Role; }

/** Resolve the current user's role: hardcoded owners win, otherwise look up the
 *  operator_roles table (RLS lets a user read their own row). null = no access. */
export async function resolveRole(email?: string | null): Promise<Role | null> {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (ADMIN_EMAILS.some((a) => a.toLowerCase() === e)) return 'owner';
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('operator_roles').select('role').eq('email', e).maybeSingle();
  if (error) { console.warn('resolveRole failed:', error.message); return null; }
  return (data?.role as Role) ?? null;
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
