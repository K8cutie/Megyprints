/* Contact-form submissions — owner-side read.

   0021 added the contact_messages table so public inquiries stopped vanishing,
   but nothing in the app ever read it back: the only reference anywhere was the
   INSERT in Contact.tsx. Customers saw "Message Sent!" and the message went
   nowhere a human would look, so the bug 0021 set out to fix was still live.
   This is the read side. RLS (0021) restricts SELECT to operator_role()='owner';
   this module just asks. */

import { supabase, supabaseConfigured } from './supabase';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  created_at: string;
}

/** Newest first, bounded — the table is an anonymous-write surface, so never
 *  select it unbounded into the console. */
export async function listContactMessages(limit = 100): Promise<ContactMessage[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, name, email, subject, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactMessage[];
}
