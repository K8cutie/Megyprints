/* "Check every name": each face next to its name, once, before printing. */
import { useMemo, useState } from 'react';
import { Check, Replace } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PortraitThumb from './PortraitThumb';
import { displayName, sortForPage } from '@/yearbook/classList';
import { fitPortrait, mainFace } from '@/yearbook/portraitFit';
import { assignPhoto, removePhoto } from '@/yearbook/project';
import type { PhotoMeta, Section } from '@/yearbook/types';

interface Props {
  open: boolean;
  section: Section;
  photos: Record<string, PhotoMeta>;
  method: 'names' | 'order' | null;
  onClose: () => void;
  onChange: (s: Section) => void;
}

const FLAG_WORDS: Record<string, string> = {
  no_face: 'No face found',
  many_faces: 'More than one face',
  low_res: 'Low resolution',
  eyes_closed: 'Eyes may be closed',
};

export default function NameCheckDialog({ open, section, photos, method, onClose, onChange }: Props) {
  const [picking, setPicking] = useState<string | null>(null);
  const people = useMemo(() => [...section.people.filter((p) => p.role === 'class_adviser'), ...sortForPage(section.people.filter((p) => p.role === 'student'))], [section.people]);
  const pool = (section.pool ?? []).map((id) => photos[id]).filter((p): p is PhotoMeta => !!p);
  const used = new Set(Object.values(section.assignments).flat());
  const unchecked = people.filter((p) => !section.checked[p.id]).length;

  const toggle = (id: string) => onChange({ ...section, checked: { ...section.checked, [id]: !section.checked[id] } });
  const confirmAll = () => onChange({ ...section, checked: Object.fromEntries(people.map((p) => [p.id, true])) });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Check every name · {section.title}</DialogTitle>
          <DialogDescription>
            {method === 'order'
              ? 'The file names had no names in them, so Megy paired the photos with the class list in shooting order. Please look at every one.'
              : 'Megy read the names in the file names. Look at each face and name once; tap “Change photo” to fix one.'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto px-6 pb-2 md:grid-cols-3 xl:grid-cols-4">
          {people.map((p) => {
            const ids = section.assignments[p.id] ?? [];
            const main = ids[0] ? photos[ids[0]] : undefined;
            const conf = section.confidence[p.id];
            const tight = main ? fitPortrait(main.width, main.height, mainFace(main.faces)).tight : false;
            const ok = !!section.checked[p.id];
            return (
              <div key={p.id} className={`flex gap-3 rounded-lg border p-2.5 ${ok ? 'border-primary/40 bg-secondary/40' : 'border-border bg-card'}`}>
                <div className="flex flex-col gap-1">
                  <PortraitThumb photo={main} width={64} />
                  {ids.slice(1).map((id) => <PortraitThumb key={id} photo={photos[id]} width={30} />)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-semibold" title={displayName(p)}>{[p.title, displayName(p)].filter(Boolean).join(' ')}</p>
                  {p.role === 'class_adviser' ? <p className="text-xs text-muted-foreground">Class adviser</p> : null}
                  <p className="truncate text-xs text-muted-foreground" title={main?.fileName}>{main ? main.fileName : 'No photo yet'}</p>
                  <div className="flex flex-wrap gap-1">
                    {main && conf !== undefined && conf < 0.9 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">{method === 'order' ? 'Matched by order' : 'Check this one'}</span> : null}
                    {main?.flags.map((f) => <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">{FLAG_WORDS[f] ?? f}</span>)}
                    {tight ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">Cropped tight</span> : null}
                    {!main ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">Goes in “Not pictured”</span> : null}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant={ok ? 'secondary' : 'outline'} className="h-7 px-2 text-xs" onClick={() => toggle(p.id)}>
                      <Check /> {ok ? 'Checked' : 'Looks right'}
                    </Button>
                    {pool.length ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPicking(picking === p.id ? null : p.id)}><Replace /> Change photo</Button> : null}
                  </div>
                  {picking === p.id ? (
                    <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-background p-1.5">
                      {pool.map((ph) => (
                        <button key={ph.id} type="button" onClick={() => { onChange(assignPhoto(section, p.id, ph.id)); setPicking(null); }} className={`rounded-sm outline-offset-1 hover:outline hover:outline-2 hover:outline-primary ${used.has(ph.id) ? 'opacity-60' : ''}`} title={ph.fileName}>
                          <PortraitThumb photo={ph} width={40} />
                        </button>
                      ))}
                      {main ? <Button size="sm" variant="link" className="h-7 text-xs" onClick={() => { onChange(removePhoto(section, p.id)); setPicking(null); }}>No photo</Button> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">{unchecked ? `${unchecked} still to check` : 'Every name is checked.'}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {unchecked ? <Button onClick={confirmAll}>They all look right · confirm {unchecked}</Button> : <Button onClick={onClose}>Done</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
