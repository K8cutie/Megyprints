/* >>> LAST MODIFIED: 2026-06-05 03:59 SGT — Session 7 <<< */
/* ══════════════════════════════════════════════════════════════════════════
   Sidebar Tab Persistence Store — uses localStorage (survives remounts)
   ══════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'megy_unifiedPanel_tab';

export function setPersistedSidebarTab(
  tab: 'photos' | 'pages' | 'templates' | 'background',
) {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* silently fail in private mode */
  }
}

export function getPersistedSidebarTab(): 'photos' | 'pages' | 'templates' | 'background' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'photos' || stored === 'pages' || stored === 'templates' || stored === 'background') {
      return stored;
    }
  } catch {
    /* silently fail */
  }
  return 'photos';
}
