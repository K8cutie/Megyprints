/* The guide's picture examples: what each step looks like, shown with the
   sample class photos (the same free photos as the sample class and the
   landing page). Pictures, not words, for the steps people get wrong. */
import { useEffect, useState } from 'react';
import { Check, QrCode } from 'lucide-react';
import type { StepId } from '@/yearbook/guide';
import { fetchSampleManifest, sampleClassListText, sampleThumbUrl, SAMPLE_BASE, type SampleManifest } from '@/yearbook/sample';

function useManifest(): SampleManifest | null {
  const [m, setM] = useState<SampleManifest | null>(null);
  useEffect(() => { let alive = true; fetchSampleManifest().then((x) => alive && setM(x)).catch(() => undefined); return () => { alive = false; }; }, []);
  return m;
}

const Thumb = ({ file, w = 34 }: { file: string; w?: number }) => (
  <img src={sampleThumbUrl(file)} alt="" width={w} height={Math.round(w / 0.8)} loading="lazy" className="block rounded-[2px] object-cover" style={{ width: w, height: Math.round(w / 0.8) }} />
);

function MiniGrid({ files, cols, label }: { files: string[]; cols: number; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="grid w-[62px] gap-[2px] rounded-sm border bg-white p-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {files.map((f) => <img key={f} src={sampleThumbUrl(f)} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />)}
      </div>
      <figcaption className="text-[10px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export default function GuideExample({ step }: { step: StepId }) {
  const m = useManifest();
  if (!m) return null;
  const students = m.people.filter((p) => p.role === 'student');
  const files = students.map((p) => p.file);
  const frame = (child: React.ReactNode, caption: string) => (
    <figure className="flex flex-col gap-1.5 rounded-md border border-dashed border-border bg-background/70 p-2" aria-label={`Example: ${caption}`}>
      {child}
      <figcaption className="text-[11px] text-muted-foreground">Example · {caption}</figcaption>
    </figure>
  );

  if (step === 'section') {
    return frame(<pre className="whitespace-pre-wrap font-mono text-[10px] leading-snug text-foreground/80">{sampleClassListText(m).split('\n').slice(0, 5).join('\n')}{'\n'}…</pre>, 'a pasted class list');
  }
  if (step === 'photos') {
    return frame(
      <div className="flex gap-1.5">
        {students.slice(0, 4).map((p) => (
          <div key={p.file} className="flex w-[44px] flex-col items-center gap-0.5">
            <Thumb file={p.file} w={40} />
            <span className="w-full truncate text-center font-mono text-[8px] text-muted-foreground" title={p.file}>{p.file}</span>
          </div>
        ))}
      </div>,
      'the photographer’s files, named by student',
    );
  }
  if (step === 'check') {
    const p = students[0];
    return frame(
      <div className="flex items-center gap-2 rounded border bg-card p-1.5">
        <Thumb file={p.file} w={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold">{[p.first, p.middle, p.last].filter(Boolean).join(' ')}</p>
          <p className="truncate font-mono text-[9px] text-muted-foreground">{p.file}</p>
        </div>
        <span className="flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px]"><Check className="size-3" /> Looks right</span>
      </div>,
      'one face, one name, one tap',
    );
  }
  if (step === 'size') {
    return frame(
      <div className="flex justify-between">
        <MiniGrid files={files.slice(0, 4)} cols={2} label="4 · biggest" />
        <MiniGrid files={files.slice(4, 13)} cols={3} label="9" />
        <MiniGrid files={files.slice(13, 25)} cols={4} label="12 · most" />
      </div>,
      'fewer per page = bigger photos, more pages',
    );
  }
  if (step === 'group') {
    return frame(<img src={`${SAMPLE_BASE}/thumbs/${m.classPhoto.file}`} alt="" loading="lazy" className="w-full rounded-sm" />, 'the class photo gets its own page and QR');
  }
  if (step === 'print') {
    return frame(
      <div className="flex items-end gap-2">
        <div className="grid w-[64px] grid-cols-3 gap-[3px] rounded-sm border bg-white p-1">
          {files.slice(0, 9).map((f) => (
            <div key={f} className="flex flex-col gap-[1px]">
              <img src={sampleThumbUrl(f)} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />
              <QrCode className="ml-auto size-[7px]" />
            </div>
          ))}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">8.5 × 11 · 300 dpi · bleed · one PDF per class</p>
      </div>,
      'a print-ready page',
    );
  }
  return null;
}
