import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, CheckCircle2, Loader2, Save } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CloudSaveStatus — Save status indicator for the builder toolbar
   ══════════════════════════════════════════════════════════════════════════ */

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface CloudSaveStatusProps {
  status: SaveStatus;
  lastSavedAt: Date | null;
  isLoggedIn: boolean;
  onManualSave?: () => void;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

export function CloudSaveStatus({ status, lastSavedAt, isLoggedIn, onManualSave }: CloudSaveStatusProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Show "Saved" tooltip briefly after save completes */
  useEffect(() => {
    if (status === 'saved' && lastSavedAt) {
      setTooltipVisible(true);
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = setTimeout(() => setTooltipVisible(false), 3000);
    }
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, [status, lastSavedAt]);

  const handleManualSave = useCallback(() => {
    if (status === 'saving' || !onManualSave) return;
    onManualSave();
  }, [status, onManualSave]);

  /* ── Not logged in ── */
  if (!isLoggedIn) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-gray-400">
        <CloudOff size={14} />
        <span className="hidden sm:inline">Not synced</span>
      </div>
    );
  }

  /* ── Status configs ── */
  const config: Record<SaveStatus, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
    idle: {
      icon: <Cloud size={14} />,
      label: 'Auto-save on',
      color: 'text-gray-500',
      bg: 'bg-transparent hover:bg-gray-100',
    },
    saving: {
      icon: <Loader2 size={14} className="animate-spin" />,
      label: 'Saving...',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    saved: {
      icon: <CheckCircle2 size={14} />,
      label: `Saved ${formatRelativeTime(lastSavedAt)}`,
      color: 'text-emerald-600',
      bg: tooltipVisible ? 'bg-emerald-50' : 'bg-transparent hover:bg-gray-100',
    },
    error: {
      icon: <CloudOff size={14} />,
      label: 'Save failed — click to retry',
      color: 'text-red-500',
      bg: 'bg-red-50 hover:bg-red-100',
    },
  };

  const c = config[status];

  return (
    <button
      onClick={handleManualSave}
      disabled={status === 'saving'}
      className={[
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer',
        c.color,
        c.bg,
        status === 'saving' ? 'cursor-not-allowed opacity-70' : '',
      ].join(' ')}
      title={status === 'error' ? 'Click to retry save' : 'Click to save now'}
    >
      {c.icon}
      <span className="hidden sm:inline">{c.label}</span>
      {onManualSave && status !== 'saving' && (
        <Save size={12} className="opacity-40 ml-0.5" />
      )}

      {/* Saved tooltip popup */}
      {status === 'saved' && tooltipVisible && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-200">
          Saved to cloud
        </span>
      )}
    </button>
  );
}

export default CloudSaveStatus;
