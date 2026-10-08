/* Bring in the photographer's folder (portraits) or the class photo. */
import { useRef, useState } from 'react';
import { FolderOpen, ImagePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importFiles, type PhotoKind } from '@/yearbook/importPhotos';
import type { PhotoMeta } from '@/yearbook/types';

interface Props {
  open: boolean;
  kind: PhotoKind;
  sectionTitle: string;
  onClose: () => void;
  onImported: (photos: PhotoMeta[], skipped: string[]) => void;
}

const folderAttrs = { webkitdirectory: '', directory: '' } as Record<string, string>;

export default function PhotoImportDialog({ open, kind, sectionTitle, onClose, onImported }: Props) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [over, setOver] = useState(false);

  const run = async (list: File[]) => {
    if (!list.length) return;
    setProgress({ done: 0, total: list.length });
    const r = await importFiles(kind === 'group' ? list.slice(0, 1) : list, kind, (done, total) => setProgress({ done, total }));
    setProgress(null);
    onImported(r.photos, r.skipped);
  };

  const portraits = kind === 'portrait';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !progress && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{portraits ? 'Add the photographer’s photos' : 'Add the class photo'}</DialogTitle>
          <DialogDescription>
            {portraits
              ? `For ${sectionTitle}. Drop the whole folder: Megy reads the names in the file names (or the shooting order), finds every face and lines them up.`
              : `For ${sectionTitle}. One photo of the whole class. Megy keeps the class QR off every face.`}
          </DialogDescription>
        </DialogHeader>
        {progress ? (
          <div className="flex flex-col gap-2 py-6" role="status">
            <p className="text-sm font-medium">Reading photo {progress.done} of {progress.total}… finding faces</p>
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">The photos stay on this computer. Nothing is uploaded.</p>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void run(Array.from(e.dataTransfer.files)); }}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${over ? 'border-primary bg-secondary' : 'border-border'}`}
          >
            <ImagePlus className="size-8 text-primary" />
            <p className="text-sm">{portraits ? 'Drag the photos or the folder here' : 'Drag the class photo here'}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {portraits ? <Button onClick={() => folder.current?.click()}><FolderOpen /> Choose a folder</Button> : null}
              <Button variant={portraits ? 'outline' : 'default'} onClick={() => files.current?.click()}>{portraits ? 'Choose photos' : 'Choose the class photo'}</Button>
            </div>
            <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. Photos stay on this computer.</p>
            <input ref={files} type="file" accept="image/jpeg,image/png,image/webp" multiple={portraits} className="hidden" onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void run(l); }} />
            <input ref={folder} type="file" className="hidden" {...folderAttrs} onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void run(l); }} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
