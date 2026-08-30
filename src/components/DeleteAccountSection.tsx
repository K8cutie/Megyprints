/* Danger zone — the in-app account deletion path Google Play requires of any
   app that lets users create an account (the public web route is
   /delete-account.html; both are mandatory, one is not a substitute for the
   other).

   The dialog is deliberately unhurried: it preflights first so the customer sees
   the REAL count of what goes, states plainly what the shop keeps and why, and
   only then unlocks the button behind a typed DELETE. Nothing about a permanent,
   unrecoverable action should be reachable by a stray tap. */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  preflightAccountDeletion,
  deleteMyAccount,
  type DeletionPreflight,
} from '../lib/accountDeletion';

const CONFIRM_WORD = 'DELETE';
const CONTACT = 'megyprints@gmail.com';

type Phase = 'idle' | 'loading' | 'ready' | 'deleting' | 'done';

export default function DeleteAccountSection() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Opening the dialog resets it and puts it straight into 'loading' — done here
  // rather than in the effect below so the effect only ever setStates from an
  // async callback (react-hooks/set-state-in-effect).
  const openDialog = useCallback(() => {
    setPreflight(null);
    setTyped('');
    setError(null);
    setPhase('loading');
    setOpen(true);
  }, []);

  // Ask the server what deletion would actually do, while the dialog shows its
  // spinner.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    preflightAccountDeletion()
      .then((p) => {
        if (cancelled) return;
        setPreflight(p);
        setPhase('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load your account details.');
        setPhase('ready');
      });

    return () => { cancelled = true; };
  }, [open]);

  const blocked = (preflight?.blocking.length ?? 0) > 0;
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD && !blocked && phase === 'ready';

  const handleDelete = useCallback(async () => {
    setPhase('deleting');
    setError(null);
    try {
      await deleteMyAccount();
      setPhase('done');
      // Let the confirmation land before dropping them back on the home page.
      setTimeout(() => navigate('/', { replace: true }), 2200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Deletion failed. Please try again.');
      setPhase('ready');
    }
  }, [navigate]);

  const close = useCallback(() => {
    if (phase === 'deleting') return;   // never abandon a delete mid-flight
    setOpen(false);
    setPhase('idle');
  }, [phase]);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl border border-red-200/70 p-6"
      >
        <h3 className="text-lg font-bold text-[#4A423F] mb-1">Delete my account</h3>
        <p className="text-sm text-[#8B7E7A] mb-4 max-w-2xl">
          Permanently deletes your account, your albums, your saved photos and any QR memory
          links. This can&apos;t be undone.
        </p>
        <button
          onClick={openDialog}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-all"
        >
          <Trash2 size={16} />
          Delete my account
        </button>
      </motion.section>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
            >
              {phase === 'done' ? (
                <div className="p-8 text-center">
                  <h2 className="text-lg font-bold text-[#4A423F]">Your account is deleted</h2>
                  <p className="text-sm text-[#8B7E7A] mt-2">
                    Your albums, photos and memory links are gone. Thanks for using Megy Prints.
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle size={20} className="text-red-500" />
                      </div>
                      <h2 id="delete-account-title" className="text-lg font-bold text-[#4A423F]">
                        Delete your account?
                      </h2>
                    </div>
                    <button
                      onClick={close}
                      disabled={phase === 'deleting'}
                      className="p-1.5 rounded-lg text-[#8B7E7A] hover:bg-[#F5EDE8] disabled:opacity-40"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {phase === 'loading' ? (
                    <div className="py-10 flex items-center justify-center text-[#8B7E7A]">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : blocked ? (
                    <>
                      <p className="text-sm text-[#4A423F] leading-relaxed">
                        You have an order that&apos;s paid and not delivered yet
                        {' — '}
                        <b>{preflight?.blocking.map((o) => o.order_number).join(', ')}</b>.
                        We need your delivery details to finish it, so we can&apos;t delete the
                        account while it&apos;s in progress.
                      </p>
                      <p className="text-sm text-[#8B7E7A] leading-relaxed mt-3">
                        Once it arrives you can delete the account here. To cancel the order
                        instead, email{' '}
                        <a className="text-[#BF5E3E] underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[#4A423F] leading-relaxed">
                        This permanently deletes:
                      </p>
                      <ul className="mt-2 mb-4 text-sm text-[#4A423F] list-disc pl-5 space-y-1">
                        <li>your sign-in and profile</li>
                        <li>{preflight?.albums ?? 0} saved album{preflight?.albums === 1 ? '' : 's'} and the photos in them</li>
                        <li>{preflight?.memories ?? 0} QR memory link{preflight?.memories === 1 ? '' : 's'} — printed codes will stop working</li>
                        <li>every print file we hold for your past orders</li>
                      </ul>

                      {(preflight?.orders ?? 0) > 0 && (
                        <p className="text-xs text-[#8B7E7A] leading-relaxed bg-[#FFF8F0] border border-[#F0E2D6] rounded-xl p-3 mb-4">
                          We keep a receipt-only record of your {preflight?.orders} past order
                          {preflight?.orders === 1 ? '' : 's'} — order number, amount and status —
                          because Philippine tax rules require it. Your name, phone number and
                          address are erased from it, and it&apos;s no longer linked to you.
                        </p>
                      )}

                      <p className="text-sm text-[#8B7E7A] mb-2">
                        Type <b className="text-[#4A423F]">{CONFIRM_WORD}</b> to confirm.
                      </p>
                      <input
                        type="text"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        disabled={phase === 'deleting'}
                        autoComplete="off"
                        aria-label={`Type ${CONFIRM_WORD} to confirm`}
                        className="w-full rounded-xl border-2 border-[#E8D5D0] px-4 py-2.5 text-sm text-[#4A423F] outline-none focus:border-red-300 disabled:opacity-50"
                      />
                    </>
                  )}

                  {error && (
                    <p className="mt-3 text-sm text-red-600 leading-relaxed">{error}</p>
                  )}

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={close}
                      disabled={phase === 'deleting'}
                      className="flex-1 rounded-xl border-2 border-[#E8D5D0] px-4 py-2.5 text-sm font-medium text-[#4A423F] hover:bg-[#F5EDE8] disabled:opacity-40"
                    >
                      {blocked ? 'Close' : 'Keep my account'}
                    </button>
                    {!blocked && (
                      <button
                        onClick={handleDelete}
                        disabled={!armed || phase === 'deleting'}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed transition-colors"
                      >
                        {phase === 'deleting' ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          'Delete forever'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
