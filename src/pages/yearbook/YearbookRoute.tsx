/* ── MEGYearbooks — the desktop yearbook maker (/#/yearbooks) ────────────────
   Left: the step guide. Middle: the real pages, as spreads, painted by the
   same painter as the print file. Right: this class's settings with live
   pages and price. Everything is saved on this computer as you go. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, QrCode, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useYearbook } from './useYearbook';
import PageCanvas from './PageCanvas';
import GuidePanel from './GuidePanel';
import Spotlight, { type SpotlightTarget } from './Spotlight';
import AddSectionDialog from './AddSectionDialog';
import PhotoImportDialog from './PhotoImportDialog';
import NameCheckDialog from './NameCheckDialog';
import SectionPanel from './SectionPanel';
import { canvasMeasure, loadPageFonts } from '@/yearbook/painter';
import { approxMeasure, layoutSection, type LayoutCtx, type Measure, type YbPage } from '@/yearbook/layout';
import { yearbookQrData } from '@/yearbook/qr';
import { applyMatch, newProject, sectionFromClassList, updateSection } from '@/yearbook/project';
import { countBook, densityOptions, pricePerCopy } from '@/yearbook/budget';
import { guideSteps, type GuideAction, type GuideStep } from '@/yearbook/guide';
import { parseClassList, displayName, type ParsedClassList } from '@/yearbook/classList';
import { LOOKS_PER_PAGE } from '@/yearbook/geometry';
import { drawSampleGroup, drawSamplePortrait, sampleClassListText, SAMPLE_ADVISER, SAMPLE_SECTION, SAMPLE_STUDENTS } from '@/yearbook/sample';
import { importPhoto } from '@/yearbook/importPhotos';
import { pagesToPdf, downloadBlob } from '@/yearbook/pdf';
import { qrTestSheet } from '@/yearbook/qrTestSheet';
import { bitmapNow, loadBitmap } from '@/yearbook/store';
import { getPriceSchedule, loadStoreSettings } from '@/lib/storeSettings';
import type { PriceSchedule } from '@/lib/pricing';
import type { PhotoMeta, Section, YearbookProject } from '@/yearbook/types';

type Busy = { label: string; done: number; total: number } | null;

const fileSafe = (s: string) => s.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'yearbook';

export default function YearbookRoute() {
  const { ready, project, setProject, photos, addPhotos, startOver } = useYearbook();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>(() => approxMeasure);
  const [schedule, setSchedule] = useState<PriceSchedule | null>(() => getPriceSchedule());
  const [dialog, setDialog] = useState<null | 'section' | 'portraits' | 'group' | 'check'>(null);
  const [matchMethod, setMatchMethod] = useState<'names' | 'order' | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [busy, setBusy] = useState<Busy>(null);
  const [spot, setSpot] = useState<SpotlightTarget | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewW, setViewW] = useState(900);
  const viewRef = useRef<HTMLDivElement>(null);
  const schoolRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPageFonts().then(() => setMeasure(() => canvasMeasure())); }, []);
  useEffect(() => { loadStoreSettings().then(() => setSchedule(getPriceSchedule())).catch(() => undefined); }, []);
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const section: Section | null = useMemo(() => {
    if (!project?.sections.length) return null;
    return project.sections.find((s) => s.id === sectionId) ?? project.sections[0];
  }, [project, sectionId]);

  const baseCtx = useMemo(() => ({ photos, measure, qrData: (c: string) => yearbookQrData(c), schoolYear: project?.schoolYear || '2027' }), [photos, measure, project?.schoolYear]);

  // Sections follow the front pages; each starts where the previous ended.
  const layouts = useMemo(() => {
    if (!project) return [];
    let page = project.otherPages + 1;
    return project.sections.map((s) => {
      const ctx: LayoutCtx = { ...baseCtx, firstPage: page };
      const r = layoutSection(s, ctx);
      page += r.pages.length;
      return { section: s, result: r };
    });
  }, [project, baseCtx]);
  const current = layouts.find((l) => l.section.id === section?.id) ?? null;

  const book = useMemo(() => (project ? countBook(project, baseCtx) : null), [project, baseCtx]);
  const price = book && project ? pricePerCopy(schedule, project.binding, book.totalPages) : null;
  const options = useMemo(() => (project && section ? densityOptions(project, section.id, baseCtx, schedule) : []), [project, section, baseCtx, schedule]);
  const looksOptions = useMemo(() => {
    if (!project || !section) return [];
    return LOOKS_PER_PAGE.map((n) => {
      const p2: YearbookProject = { ...project, sections: project.sections.map((s) => (s.id === section.id ? { ...s, looksPerPage: n } : s)) };
      const c = countBook(p2, baseCtx);
      return { n, pages: c.totalPages, price: pricePerCopy(schedule, project.binding, c.totalPages) };
    });
  }, [project, section, baseCtx, schedule]);

  const steps = useMemo(() => guideSteps(project, section), [project, section]);

  const putSection = useCallback((s: Section) => setProject((p) => (p ? updateSection(p, s) : p)), [setProject]);

  const ensureProject = useCallback((school = '', year = String(new Date().getFullYear() + 1)): YearbookProject => {
    const p = project ?? newProject(school, year);
    return p;
  }, [project]);

  /* ── Adding classes and photos ───────────────────────────────────────── */

  const addSection = (title: string, parsed: ParsedClassList) => {
    const s = sectionFromClassList(title, parsed);
    const p = ensureProject();
    setProject({ ...p, sections: [...p.sections, s], updatedAt: Date.now() });
    setSectionId(s.id);
    setDialog(null);
    setNotice(`Added ${title}: ${parsed.students.length} students${parsed.adviser ? ' and the class adviser' : ''}. Next, add the photographer’s photos.`);
  };

  const onPortraits = (list: PhotoMeta[], skipped: string[]) => {
    if (!section) return;
    addPhotos(list);
    const pool = [...(section.pool ?? []), ...list.map((p) => p.id)];
    const all = pool.map((id) => photos[id] ?? list.find((p) => p.id === id)).filter((p): p is PhotoMeta => !!p);
    const r = applyMatch({ ...section, pool }, all);
    putSection(r.section);
    setMatchMethod(r.method);
    setDialog('check');
    const noFace = list.filter((p) => p.scanned && !p.faces.length).length;
    setNotice([`${list.length} photos in.`, r.method === 'order' ? 'Matched by shooting order.' : 'Matched by the names in the files.', noFace ? `${noFace} with no face found.` : '', skipped.length ? `Skipped ${skipped.length} non-photo files.` : '', ...r.warnings].filter(Boolean).join(' '));
  };

  const onGroup = (list: PhotoMeta[]) => {
    if (!section || !list[0]) return;
    addPhotos(list);
    putSection({ ...section, groupPhotoId: list[0].id, groupSkipped: false });
    setDialog(null);
    const g = list[0];
    setNotice(g.scanned ? `Class photo in. Megy found ${g.faces.length} faces.` : 'Class photo in.');
  };

  const onLayout = (layout: Section['layout']) => {
    if (!section || layout === section.layout) return;
    const next = { ...section, layout };
    const pool = (section.pool ?? []).map((id) => photos[id]).filter((p): p is PhotoMeta => !!p);
    if (pool.length) {
      const r = applyMatch(next, pool);
      putSection({ ...r.section, checked: section.checked });
    } else putSection(next);
  };

  /* ── The sample class ────────────────────────────────────────────────── */

  const loadSample = async () => {
    setDialog(null);
    const total = SAMPLE_STUDENTS.length * 3 + 2;
    let done = 0;
    const tick = (label: string) => setBusy({ label, done: ++done, total });
    setBusy({ label: 'Drawing the sample class…', done: 0, total });
    const made: PhotoMeta[] = [];
    const looks = [['toga', 'toga'], ['formal', 'filipiniana'], ['creative', 'creative']] as const;
    for (let i = 0; i < SAMPLE_STUDENTS.length; i++) {
      const s = SAMPLE_STUDENTS[i];
      for (const [look, word] of looks) {
        const d = await drawSamplePortrait(i, s.fem, look);
        const name = `${s.last.toUpperCase().replace(/\s+/g, '')}_${s.first.replace(/\s+|\./g, '')}_${word}.jpg`;
        made.push(await importPhoto(d.blob, name, 'portrait', made.length, { faces: [d.face] }));
        tick(`Drawing ${s.first} ${s.last}…`);
      }
    }
    const adv = await drawSamplePortrait(99, true, 'adviser');
    made.push(await importPhoto(adv.blob, `${SAMPLE_ADVISER.last.toUpperCase()}_${SAMPLE_ADVISER.first}.jpg`, 'portrait', made.length, { faces: [adv.face] }));
    tick('Drawing the class adviser…');
    const g = await drawSampleGroup(SAMPLE_STUDENTS.length);
    const group = await importPhoto(g.blob, 'class-photo.jpg', 'group', 0, { faces: g.faces });
    tick('Drawing the class photo…');
    addPhotos([...made, group]);

    const base = project && project.school ? project : { ...newProject('St. Joseph Academy', '2027'), ...(project ? { id: project.id, sections: project.sections } : {}) };
    const s0 = sectionFromClassList(SAMPLE_SECTION, parseClassList(sampleClassListText()));
    const r = applyMatch({ ...s0, pool: made.map((p) => p.id) }, made);
    const s1 = { ...r.section, groupPhotoId: group.id };
    setProject({ ...base, sections: [...base.sections, s1], updatedAt: Date.now() });
    setSectionId(s1.id);
    setMatchMethod(r.method);
    setBusy(null);
    setNotice('The sample class is in: 30 students and their adviser, drawn portraits with heads of different sizes. Megy has already lined them up. Next: check every name.');
  };

  /* ── Print files ─────────────────────────────────────────────────────── */

  const photoSource = (id: string) => bitmapNow(id);

  const ensureBitmaps = async (pages: YbPage[]) => {
    const ids = [...new Set(pages.flatMap((p) => p.elements.flatMap((e) => (e.kind === 'photo' ? [e.photoId] : []))))];
    await Promise.all(ids.map(loadBitmap));
  };

  const downloadAll = async () => {
    if (!project || !layouts.length) { setNotice('Add a class first. Each class downloads as its own print file.'); return; }
    for (let i = 0; i < layouts.length; i++) {
      const { section: s, result } = layouts[i];
      setBusy({ label: `Making the print file for ${s.title}…`, done: 0, total: result.pages.length });
      await ensureBitmaps(result.pages);
      const blob = await pagesToPdf(result.pages, photoSource, (done, total) => setBusy({ label: `${s.title}: page ${done} of ${total} at 300 dpi`, done, total }));
      downloadBlob(blob, `${fileSafe(project.school || 'Yearbook')}-${fileSafe(s.title)}.pdf`);
    }
    setBusy(null);
    setProject((p) => (p ? { ...p, printed: true, updatedAt: Date.now() } : p));
    setNotice(`Downloaded ${layouts.length} print file${layouts.length === 1 ? '' : 's'}: 8.5 × 11 with 0.125 in bleed, 300 dpi.`);
  };

  const downloadTestSheet = async () => {
    setBusy({ label: 'Making the QR test sheet…', done: 0, total: 1 });
    const blob = await pagesToPdf([qrTestSheet()], photoSource);
    downloadBlob(blob, 'MEGYearbooks-QR-test-sheet.pdf');
    setBusy(null);
    setNotice('QR test sheet downloaded. Print it at 100% on the yearbook paper and scan each size with a few phones.');
  };

  /* ── Guide ───────────────────────────────────────────────────────────── */

  const doAction = (a: GuideAction) => {
    if (a === 'edit-name') {
      if (!project) setProject(newProject('', String(new Date().getFullYear() + 1)));
      setTimeout(() => schoolRef.current?.focus(), 50);
    } else if (a === 'add-section') setDialog('section');
    else if (a === 'add-photos') setDialog(section ? 'portraits' : 'section');
    else if (a === 'open-check') setDialog(section ? 'check' : 'section');
    else if (a === 'pick-size') setSpot({ name: 'portrait-size', note: 'Pick a size here. Each shows its pages and price per copy.', key: Date.now() });
    else if (a === 'add-group') setDialog(section ? 'group' : 'section');
    else if (a === 'download') void downloadAll();
  };
  const showMe = (s: GuideStep) => setSpot({ name: s.showMe, note: s.action.label, key: Date.now() });
  const endSpot = useCallback(() => setSpot(null), []);

  /* ── Spreads ─────────────────────────────────────────────────────────── */

  const spreads = useMemo(() => {
    const pages = current?.result.pages ?? [];
    const out: [YbPage | null, YbPage | null][] = [];
    for (const p of pages) {
      const last = out[out.length - 1];
      if (p.number % 2 === 0) out.push([p, null]);
      else if (last && last[1] === null && last[0] && last[0].number === p.number - 1) last[1] = p;
      else out.push([null, p]);
    }
    return out;
  }, [current]);
  const pageW = Math.max(240, Math.min(560, (viewW - 64) / 2));

  const selPerson = section?.people.find((p) => p.id === selected);
  const selPhoto = selPerson && section ? photos[section.assignments[selPerson.id]?.[0] ?? ''] : undefined;

  if (!ready) return <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Opening your yearbook…</div>;

  return (
    <div className="flex h-screen flex-col bg-background font-body text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
        <a href="#/" className="font-display text-xl font-bold tracking-tight">MEGY<span className="text-primary">earbooks</span></a>
        <div className="flex items-center gap-2">
          <input ref={schoolRef} data-guide="school-name" aria-label="School name" value={project?.school ?? ''} onChange={(e) => setProject((p) => ({ ...(p ?? newProject('', '2027')), school: e.target.value, updatedAt: Date.now() }))} placeholder="School name" className="h-9 w-64 rounded-md border border-input bg-background px-2 text-sm" />
          <label className="flex items-center gap-1 text-sm text-muted-foreground" htmlFor="yb-year">Batch
            <input id="yb-year" value={project?.schoolYear ?? ''} onChange={(e) => setProject((p) => ({ ...(p ?? newProject('', '')), schoolYear: e.target.value.replace(/[^\d–-]/g, '').slice(0, 9), updatedAt: Date.now() }))} placeholder="2027" className="h-9 w-20 rounded-md border border-input bg-background px-2 text-foreground" />
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={downloadTestSheet}><QrCode /> QR test sheet</Button>
          <Button size="sm" data-guide="download" onClick={downloadAll}><Download /> Download print files</Button>
          {project ? <Button variant="ghost" size="sm" onClick={() => { if (window.confirm?.('Start over? This removes the yearbook and its photos from this computer.')) void startOver(); }}><RotateCcw /> Start over</Button> : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-r bg-card/60 p-4">
          <GuidePanel steps={steps} onAction={doAction} onShowMe={showMe} />
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classes</h2>
            {project?.sections.map((s) => {
              const r = layouts.find((l) => l.section.id === s.id)?.result;
              return (
                <button key={s.id} type="button" onClick={() => { setSectionId(s.id); setSelected(null); }} className={`rounded-md border px-3 py-2 text-left text-sm ${section?.id === s.id ? 'border-primary bg-secondary' : 'border-border hover:bg-muted'}`}>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{s.people.filter((p) => p.role === 'student').length} students · {r?.pages.length ?? 0} pages</span>
                </button>
              );
            })}
            <Button variant="outline" size="sm" data-guide="add-section" onClick={() => setDialog('section')}><Plus /> Add a class</Button>
            {section ? (
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" size="sm" data-guide="add-photos" onClick={() => setDialog('portraits')}>Add photos to {section.title}</Button>
                <Button variant="outline" size="sm" data-guide="open-check" onClick={() => setDialog('check')}>Check names</Button>
              </div>
            ) : null}
          </div>
        </aside>

        <main ref={viewRef} className="min-h-0 overflow-y-auto bg-[#e9e7e2] px-6 py-6">
          {notice ? (
            <div className="mx-auto mb-4 flex max-w-4xl items-start justify-between gap-3 rounded-lg bg-card px-4 py-3 text-sm shadow-sm" role="status">
              <span>{notice}</span>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
            </div>
          ) : null}
          {selPerson && section ? (
            <div className="mx-auto mb-4 flex max-w-4xl items-center gap-3 rounded-lg border border-primary/30 bg-card px-4 py-2.5 text-sm">
              <span className="font-semibold">{[selPerson.title, displayName(selPerson)].filter(Boolean).join(' ')}</span>
              <span className="text-muted-foreground">{selPhoto ? selPhoto.fileName : 'No photo'}</span>
              <span className="font-mono text-xs text-muted-foreground" title="This person’s QR code">QR {selPerson.memoryCode.toUpperCase()}</span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setDialog('check')}>Change photo</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            </div>
          ) : null}

          {!section ? (
            <div className="mx-auto mt-16 flex max-w-xl flex-col items-center gap-4 text-center">
              <h1 className="font-display text-4xl font-semibold">Make your yearbook</h1>
              <p className="text-muted-foreground">Paste a class list, drop the photographer’s folder, and Megy lays out every page: same head size for every student, a video QR for each one, ready for the press.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="lg" onClick={() => setDialog('section')}><Plus /> Add a class</Button>
                <Button size="lg" variant="outline" onClick={loadSample}><Sparkles /> Try the sample class</Button>
              </div>
              <p className="text-xs text-muted-foreground">8.5 × 11 pages. Everything stays on this computer until you download the print files.</p>
            </div>
          ) : (
            <div className="mx-auto flex flex-col items-center gap-8">
              {spreads.map(([l, r], i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="flex gap-0.5">
                    {l ? <PageCanvas page={l} widthPx={pageW} selectedPersonId={selected ?? undefined} onPickPerson={setSelected} /> : <div style={{ width: pageW }} />}
                    {r ? <PageCanvas page={r} widthPx={pageW} selectedPersonId={selected ?? undefined} onPickPerson={setSelected} /> : <div style={{ width: pageW }} />}
                  </div>
                  <span className="text-xs text-muted-foreground">{[l?.number, r?.number].filter(Boolean).join(' – ')}</span>
                </div>
              ))}
              {!spreads.length ? <p className="mt-10 text-muted-foreground">No pages yet. Add the photographer’s photos for {section.title}.</p> : null}
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l bg-card/60 p-4">
          {project && section && current ? (
            <SectionPanel
              project={project}
              section={section}
              photos={photos}
              result={current.result}
              options={options}
              looksOptions={looksOptions}
              totalPages={book?.totalPages ?? 0}
              price={price}
              onSection={putSection}
              onProject={(p) => setProject({ ...p, updatedAt: Date.now() })}
              onLayout={onLayout}
              onAddGroup={() => setDialog('group')}
              onAddPhotos={() => setDialog('portraits')}
              onCheck={() => setDialog('check')}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Settings for a class show here once you add one.</p>
          )}
        </aside>
      </div>

      <AddSectionDialog open={dialog === 'section'} onClose={() => setDialog(null)} onCreate={addSection} onSample={loadSample} />
      {section ? (
        <>
          <PhotoImportDialog open={dialog === 'portraits'} kind="portrait" sectionTitle={section.title} onClose={() => setDialog(null)} onImported={onPortraits} />
          <PhotoImportDialog open={dialog === 'group'} kind="group" sectionTitle={section.title} onClose={() => setDialog(null)} onImported={onGroup} />
          <NameCheckDialog open={dialog === 'check'} section={section} photos={photos} method={matchMethod} onClose={() => setDialog(null)} onChange={putSection} />
        </>
      ) : null}

      {busy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="status" aria-live="polite">
          <div className="w-96 rounded-xl bg-card p-5 shadow-xl">
            <p className="mb-3 text-sm font-medium">{busy.label}</p>
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} /></div>
          </div>
        </div>
      ) : null}
      <Spotlight target={spot} onDone={endSpot} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background p-8 text-center lg:hidden">
        <p className="max-w-sm text-base">MEGYearbooks is made for a computer screen. Open this page on a laptop or desktop to build your yearbook.</p>
      </div>
    </div>
  );
}
