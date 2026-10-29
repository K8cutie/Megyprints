/* ══════════════════════════════════════════════════════════════════════════
   THE WORDS OF "DELETE MY ACCOUNT": the website's own
   (src/components/DeleteAccountSection.tsx), with the counts from the
   preflight. test/deleteAccount.test.tsx holds each line against the
   website's source.
   ══════════════════════════════════════════════════════════════════════════ */
import { blockingSentence, type DeletionPreflight } from '@web/lib/accountDeletionRules';
import { hostedUntilMonth, SHOP_EMAIL } from './deleteAccount';

export const CONFIRM_WORD = 'DELETE';

export const SECTION_TITLE = 'Delete my account';
export const SECTION_TEXT = "Permanently deletes your account, your albums, your saved photos, your memory videos and any QR memory links. This can't be undone.";
export const DIALOG_TITLE = 'Delete your account?';
export const LIST_LEAD = 'This permanently deletes:';
export const KEEP = 'Keep my account';
export const CLOSE = 'Close';
export const DELETE_FOREVER = 'Delete forever';
export const DELETING = 'Deleting…';
export const DONE_TITLE = 'Your account is deleted';
export const DONE_TEXT = 'Your albums, photos, videos and memory links are gone. Thanks for using Megy Prints.';
export const LOAD_FAILED = 'Could not load your account details.';
/** The app's: the website greys "Delete forever" out until DELETE is typed;
 *  the app never greys a button out, so a tap says what is missing. */
export const TYPE_IT_FIRST = `Type ${CONFIRM_WORD} in the box first.`;
export const TYPE_PROMPT = `Type ${CONFIRM_WORD} to confirm.`;

const s = (n: number) => (n === 1 ? '' : 's');

/** The list of what goes, from the real counts. */
export function deletionItems(p: DeletionPreflight): string[] {
  const hostedUntil = hostedUntilMonth(p.videos_hosted_until);
  return [
    'your sign-in and profile',
    `${p.albums} saved album${s(p.albums)} and the photos in them`,
    `${p.memories} QR memory link${s(p.memories)} — printed codes will stop working`,
    ...(p.videos > 0 ? [`${p.videos} memory video${s(p.videos)} — deleted from our servers${hostedUntil ? `, even though hosting runs until ${hostedUntil}` : ''}`] : []),
    'every print file we hold for your past orders, and any payment receipt you attached',
  ];
}

/** What the shop keeps of past orders, and why ('' with no past orders). */
export function keptNote(p: DeletionPreflight): string {
  if (p.orders <= 0) return '';
  return `We keep a receipt-only record of your ${p.orders} past order${s(p.orders)} — order number, amount and status — because Philippine tax rules require it. Your name, phone number and address are erased from it, and it's no longer linked to you.`;
}

/** An order (or booking) that is paid and not finished blocks the deletion. */
export function blockedWords(p: DeletionPreflight): { first: string; second: string } {
  const { lead, numbers } = blockingSentence(p.blocking);
  return {
    first: `${lead} — ${numbers}. We need your details to finish it, so we can't delete the account while it's in progress.`,
    second: `Once it's done you can delete the account here. To cancel it instead, email ${SHOP_EMAIL}.`,
  };
}

/** True when what was typed confirms (the website's rule: spaces and case don't matter). */
export function confirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}
