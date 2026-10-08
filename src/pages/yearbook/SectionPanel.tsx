/* Right column: this class's layout, portrait size with live pages and price,
   the class photo, the book's cover and copies, and anything to fix. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import PortraitThumb from './PortraitThumb';
import { GRID, type Density, type LooksPerPage } from '@/yearbook/geometry';
import { fitBudget, type DensityOption } from '@/yearbook/budget';
import type { SectionLayoutResult } from '@/yearbook/layout';
import type { PhotoMeta, Section, YearbookProject } from '@/yearbook/types';

interface Props {
  project: YearbookProject;
  section: Section;
  photos: Record<string, PhotoMeta>;
  result: SectionLayoutResult;
  options: DensityOption[];
  looksOptions: { n: LooksPerPage; pages: number; price: number | null }[];
  totalPages: number;
  price: number | null;
  onSection: (s: Section) => void;
  onProject: (p: YearbookProject) => void;
  onLayout: (layout: Section['layout']) => void;
  onAddGroup: () => void;
  onAddPhotos: () => void;
  onCheck: () => void;
}

const peso = (n: number | null) => (n === null ? '—' : `₱${Math.round(n).toLocaleString('en-PH')}`);

export default function SectionPanel(props: Props) {
  const { project, section, photos, result, options, looksOptions, totalPages, price, onSection, onProject, onLayout, onAddGroup, onAddPhotos, onCheck } = props;
  const [budget, setBudget] = useState('');
  const [budgetMsg, setBudgetMsg] = useState('');
  const group = section.groupPhotoId ? photos[section.groupPhotoId] : undefined;
  const mainPhotos = section.people.map((p) => photos[section.assignments[p.id]?.[0] ?? '']).filter((p): p is PhotoMeta => !!p);
  const noFace = mainPhotos.filter((p) => p.flags.includes('no_face')).length;
  const manyFaces = mainPhotos.filter((p) => p.flags.includes('many_faces')).length;

  const pickDensity = (d: Density) => onSection({ ...section, density: d, sizeChosen: true });
  const fit = () => {
    const target = Number(budget.replace(/[^\d.]/g, ''));
    if (!target) { setBudgetMsg('Type the price per copy the school can pay, for example 1500.'); return; }
    const best = fitBudget(options, target);
    if (!best) { setBudgetMsg(`Even ${options[options.length - 1]?.density ?? 12} per page costs ${peso(options[options.length - 1]?.price ?? null)} a copy. Try softcover or fewer other pages.`); return; }
    pickDensity(best.density);
    setBudgetMsg(`${best.density} per page fits: ${peso(best.price)} a copy, ${best.pages} pages.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor="yb-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class</label>
        <input id="yb-title" value={section.title} onChange={(e) => onSection({ ...section, title: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 font-display text-lg" />
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(['portraits', 'looks3'] as const).map((l) => (
            <button key={l} type="button" onClick={() => onLayout(l)} className={`rounded-md px-2 py-1.5 ${section.layout === l ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>
              {l === 'portraits' ? 'One portrait each' : 'Three looks each'}
            </button>
          ))}
        </div>
      </section>

      {section.layout === 'portraits' ? (
        <section className="flex flex-col gap-2" data-guide="portrait-size">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portrait size</h3>
          <div className="flex flex-col gap-1">
            {options.map((o) => {
              const on = o.density === section.density;
              return (
                <button key={o.density} type="button" onClick={() => pickDensity(o.density)} className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-sm ${on ? 'border-primary bg-secondary font-semibold' : 'border-border hover:bg-muted'}`}>
                  <span>{o.density} per page <span className="font-normal text-muted-foreground">({GRID[o.density].cols}×{GRID[o.density].rows})</span></span>
                  <span className="tabular-nums">{o.pages} pp · {peso(o.price)}</span>
                </button>
              );
            })}
          </div>
          {options.length > 1 && options[0].price !== null && options.every((o) => o.price === options[0].price) ? (
            <p className="text-xs text-muted-foreground">Every size fits inside the 40-page minimum, so the price per copy is the same. Sizes start to change the price once the book passes 40 pages.</p>
          ) : null}
          <div className="flex gap-1.5">
            <input aria-label="Price per copy the school can pay" value={budget} onChange={(e) => { setBudget(e.target.value); setBudgetMsg(''); }} placeholder="₱ per copy" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
            <Button size="sm" variant="outline" onClick={fit}>Fit my budget</Button>
          </div>
          {budgetMsg ? <p className="text-xs text-foreground/80">{budgetMsg}</p> : null}
          <p className="text-xs text-muted-foreground">
            Portraits print {result.portrait.w.toFixed(2)} × {result.portrait.h.toFixed(2)} in.{' '}
            {result.qrMode === 'corner' ? 'Each QR sits in the photo’s upper-right corner.' : 'At this size the corner QR would cover faces, so each QR sits beside the name.'}
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-2" data-guide="portrait-size">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graduates per page</h3>
          <div className="flex flex-col gap-1">
            {looksOptions.map((o) => {
              const on = o.n === section.looksPerPage;
              return (
                <button key={o.n} type="button" onClick={() => onSection({ ...section, looksPerPage: o.n, sizeChosen: true })} className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-sm ${on ? 'border-primary bg-secondary font-semibold' : 'border-border hover:bg-muted'}`}>
                  <span>{o.n} per page</span>
                  <span className="tabular-nums">{o.pages} pp · {peso(o.price)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Toga, Filipiniana or barong, and a creative shot. {result.qrMode === 'corner' ? 'The QR sits on the toga photo.' : 'The QR sits in the name panel.'}</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class photo</h3>
        {group ? (
          <div className="flex items-center gap-3">
            <PortraitThumb photo={group} width={96} fitted={false} />
            <Button size="sm" variant="outline" onClick={onAddGroup} data-guide="add-group">Change</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onAddGroup} data-guide="add-group">Add the class photo</Button>
            {!section.groupSkipped ? <Button size="sm" variant="ghost" onClick={() => onSection({ ...section, groupSkipped: true })}>No class photo</Button> : <span className="text-xs text-muted-foreground">Skipped</span>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The book</h3>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(['hard', 'soft'] as const).map((b) => (
            <button key={b} type="button" onClick={() => onProject({ ...project, binding: b })} className={`rounded-md px-2 py-1.5 ${project.binding === b ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>{b === 'hard' ? 'Hardbound' : 'Softcover'}</button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 text-sm" htmlFor="yb-other">
          <span>Other pages <span className="text-xs text-muted-foreground">(messages, faculty, events, sponsors)</span></span>
          <input id="yb-other" type="number" min={0} step={1} value={project.otherPages} onChange={(e) => onProject({ ...project, otherPages: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="h-8 w-16 rounded-md border border-input bg-background px-2 text-right tabular-nums" />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm" htmlFor="yb-copies">
          <span>Copies</span>
          <input id="yb-copies" type="number" min={1} step={1} value={project.copies} onChange={(e) => onProject({ ...project, copies: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right tabular-nums" />
        </label>
        <div className="rounded-lg border bg-card p-3 text-sm">
          <div className="flex justify-between"><span>Pages</span><span className="font-semibold tabular-nums">{totalPages}</span></div>
          <div className="flex justify-between"><span>Price per copy</span><span className="font-semibold tabular-nums">{peso(price)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>{project.copies} copies</span><span className="tabular-nums">{peso(price === null ? null : price * project.copies)}</span></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Uses your current 8.5 × 11 album prices until the yearbook price table is set.</p>
        </div>
      </section>

      {(result.tight.length || result.notPictured.length || noFace || manyFaces) ? (
        <section className="flex flex-col gap-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <h3 className="font-semibold">To look at</h3>
          {noFace ? <p>{noFace} photo{noFace === 1 ? '' : 's'} with no face found: centred instead of lined up. <button type="button" className="underline" onClick={onCheck}>Check names</button></p> : null}
          {manyFaces ? <p>{manyFaces} photo{manyFaces === 1 ? '' : 's'} with more than one face: Megy used the biggest face.</p> : null}
          {result.tight.length ? <p>Cropped too tight to match the others: {result.tight.join(', ')}. Ask the photographer for a looser file.</p> : null}
          {result.notPictured.length ? <p>No photo yet ({result.notPictured.length}): listed as “Not pictured”. <button type="button" className="underline" onClick={onAddPhotos}>Add photos</button></p> : null}
        </section>
      ) : null}
    </div>
  );
}
