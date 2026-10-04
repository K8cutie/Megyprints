/* ══════════════════════════════════════════════════════════════════════════
   MissingPhotosBar — said the moment an album opens without its photos (on
   another device, a fresh browser): which pages, why, and the way on. It used
   to open on blank pages without a word (1-star testers, round 2). "Add the
   photos" picks them here; the same files go back in their places
   (photoRelink), so nothing is laid out again.
   ══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import { missingPhotos, missingPhotosMessage } from '../../lib/photoPresence';

export default function MissingPhotosBar({ actions }: { actions: BuilderContextValue }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState<string | null>(null);
  const missing = missingPhotos(actions.albumPages, actions.uploadedPhotos, actions.coverFront);
  if (missing.count === 0 && !said) return null;
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!picked.length) return;
    const r = await actions.dispatch({ type: 'add_photos', payload: { files: picked }, rawMessage: 'add photos' });
    setSaid(r.message);
    window.setTimeout(() => setSaid(null), 7000);
  };
  return (
    <div role="status" data-testid="missing-photos-bar"
      className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#FFF6E5] border-b border-[#F0D9A8] text-xs text-[#8A5A12]">
      <span className="flex-1 min-w-[14rem]">{missing.count > 0 ? missingPhotosMessage(missing) : said}</span>
      {missing.count > 0 && said && <span className="w-full text-[11px] text-cocoa">{said}</span>}
      {missing.count > 0 && (
        <button onClick={() => inputRef.current?.click()} data-testid="missing-photos-add"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E8C98A] font-semibold hover:bg-[#FFF0D1]">
          <ImagePlus size={14} /> Add the photos
        </button>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onPick} />
    </div>
  );
}
