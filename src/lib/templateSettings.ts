/* ══════════════════════════════════════════════════════════════════════════
   Template settings — operator-curated overrides for page templates.

   Every template is ACTIVE by default (no row in the DB). The operator can HIDE
   (temporarily off) or soft-DELETE (removed, restorable) a template from /admin.
   Hidden or deleted templates are excluded from album GENERATION, but never from
   getTemplateById — so albums already using a now-off template still render.

   Persistence: a tiny `template_settings` table (public read, admin-only write
   via RLS). Loaded once on app start and applied to the generation filter.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import { setInactiveTemplateIds } from '../pages/builder/pageTemplates';

export const ADMIN_EMAIL = 'archgarcia@gmail.com';

/** True when the given email is the operator account (case-insensitive, since
 *  email addresses aren't case-sensitive and providers vary the casing). */
export function isAdminEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export interface TemplateState { hidden: boolean; deleted: boolean; }

// template_id → state. Absent = active.
let cache = new Map<string, TemplateState>();

function applyInactive(): void {
  const inactive = new Set<string>();
  for (const [id, s] of cache) if (s.hidden || s.deleted) inactive.add(id);
  setInactiveTemplateIds(inactive);
}

/** Load operator overrides from Supabase and apply them to generation. Safe on
 *  app start; on any failure it leaves every template active (fail-open is fine
 *  here — worst case the operator's hide/delete choices aren't reflected yet). */
export async function loadTemplateSettings(): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    const { data, error } = await supabase
      .from('template_settings')
      .select('template_id, hidden, deleted');
    if (error) { console.warn('template_settings load failed:', error.message); return; }
    cache = new Map((data ?? []).map((r) => [r.template_id, { hidden: !!r.hidden, deleted: !!r.deleted }]));
    applyInactive();
  } catch (e) {
    console.warn('template_settings load error:', e);
  }
}

export function getTemplateState(id: string): TemplateState {
  return cache.get(id) ?? { hidden: false, deleted: false };
}

export function getAllStates(): Map<string, TemplateState> {
  return new Map(cache);
}

/** Upsert one template's override (admin only — enforced server-side by RLS).
 *  Updates the local cache + generation filter optimistically. Returns an error
 *  message on failure, or null on success. */
export async function setTemplateState(id: string, patch: Partial<TemplateState>): Promise<string | null> {
  const next = { ...getTemplateState(id), ...patch };
  cache.set(id, next);
  applyInactive();
  if (!supabaseConfigured) return 'Supabase not configured — change is local-only this session.';
  const { error } = await supabase.from('template_settings').upsert({
    template_id: id,
    hidden: next.hidden,
    deleted: next.deleted,
    updated_at: new Date().toISOString(),
  });
  return error ? error.message : null;
}
