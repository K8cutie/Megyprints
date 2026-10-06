import { WifiOff, Loader2, RefreshCw } from 'lucide-react';

/** "We couldn't load your albums" — said instead of "No projects yet" when
 *  the list failed to load (see useAccountAlbums). One message for every list. */
export function AlbumsLoadFailed({ retrying, onRetry, compact }: { retrying: boolean; onRetry: () => void; compact?: boolean }) {
  return (
    <div role="alert" data-testid="albums-load-failed"
      className={`bg-white rounded-2xl border border-[#F0D9A8] text-center ${compact ? 'p-8' : 'p-10'}`}>
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#FFF6E5] flex items-center justify-center">
        <WifiOff size={24} className="text-[#C98A2B]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-dark mb-2">We couldn't load your albums</h3>
      <p className="text-medium text-sm mb-5 max-w-sm mx-auto">
        Check your connection. Your albums are safe in your account: they show here as soon as we can reach it.
      </p>
      <button type="button" onClick={onRetry} disabled={retrying} data-testid="albums-retry"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-peach text-white text-sm font-semibold rounded-xl hover:brightness-105 transition-all disabled:opacity-60">
        {retrying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  );
}
