/* ══════════════════════════════════════════════════════════════════════════
   InstallPrompt — mobile "Add to Home Screen" banner.
   - Android/Chrome: captures the beforeinstallprompt event → real Install button.
   - iOS Safari (no auto-prompt): shows the "Share → Add to Home Screen" hint.
   Hidden on desktop, when already installed (standalone), or once dismissed.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('pwa-install-dismissed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isIOS && isMobile && !isStandalone) setIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem('pwa-install-dismissed', '1'); } catch { /* ignore */ }
  };

  const doInstall = async () => {
    const e = deferred as unknown as { prompt: () => void; userChoice: Promise<unknown> } | null;
    if (!e) return;
    try { e.prompt(); await e.userChoice; } finally { setDeferred(null); }
  };

  if (dismissed) return null;
  if (!deferred && !iosHint) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[200] md:hidden bg-white rounded-2xl shadow-xl border border-[#F4C2A1]/30 p-3 flex items-center gap-3">
      <img src="/megy-character.png" alt="Megy" className="w-10 h-10 rounded-xl shrink-0" draggable={false} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#2D2D2D]">Install Megy Prints</p>
        <p className="text-[11px] text-[#6B6B6B] leading-snug">
          {deferred
            ? 'Add it to your home screen for the full app.'
            : <>Tap <span className="font-semibold">Share</span>, then <span className="font-semibold">Add to Home Screen</span>.</>}
        </p>
      </div>
      {deferred && (
        <button onClick={doInstall}
          className="px-3 py-2 bg-[#F4C2A1] text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 active:scale-95 transition-transform">
          <Download size={14} /> Install
        </button>
      )}
      <button onClick={close} aria-label="Dismiss" className="text-[#9B9B9B] p-1 shrink-0"><X size={16} /></button>
    </div>
  );
}
