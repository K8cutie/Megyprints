import { useEffect } from 'react';
import { useAuth } from '../lib/authContext';
import { freePaidStagedClips } from '../lib/memoryClips';

/** Accounts already swept on this page load. */
const swept = new Set<string>();

/** Once per signed-in visit: free this phone's copies of memory videos whose
 *  order is now PAID. Until then the phone keeps them, because an order that
 *  expires unpaid loses its cloud copy (0042) and a reorder uploads it again
 *  from here. Renders nothing; a phone with no kept videos makes no request. */
export default function PaidClipSweep() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  useEffect(() => {
    if (!uid || swept.has(uid)) return;
    swept.add(uid);
    void freePaidStagedClips();
  }, [uid]);
  return null;
}
