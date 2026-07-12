/* CoverStep — editor for the front·spine·back album cover.
   Renders in two modes:
   • 'step'  — embedded as a wizard step (center stage, after album size). The
               wizard's Continue/Back drive navigation.
   • 'modal' — a full-screen overlay opened from the Preview screen (to refine
               the cover — e.g. add the hero photo — once photos exist).
   Both pull coverDesign + setters straight from BuilderContext (same as the QR/
   text editors) and share the CoverWrapPreview, which uses the SAME coverLayout
   the print pipeline uses — so what's designed here is what prints. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useBuilderContext } from './BuilderContext';
import { CoverWrapPreview } from './CoverWrapPreview';
import { coverWrapGeometry, describeWrap } from './coverGeometry';
import { defaultCoverText } from './coverLayout';
import { DEFAULT_COVER, type TextStyle } from './types';
import { FONTS, COLORS } from './MobileTextEditor';

const BG_SWATCHES = ['#FFFBF7', '#F4E9DD', '#2D2D2D', '#1F3A2E', '#3A2E4A', '#E8A598', '#C9A24B', '#FFFFFF'];

interface Props {
  /** 'modal' (default) = overlay with a Done button; 'step' = embedded wizard step. */
  mode?: 'modal' | 'step';
  /** modal: close the overlay. */
  onClose?: () => void;
  /** step: advance the wizard to the next step. */
  onNext?: () => void;
  /** step: go back to the previous step. */
  onBack?: () => void;
}

export default function CoverStep({ mode = 'modal', onClose, onNext, onBack }: Props) {
  const b = useBuilderContext();
  const { coverDesign: d, setCoverFront, setCoverSpine, setCoverBack, uploadedPhotos, albumSize, albumPages } = b;

  // Preview with softcover geometry; the real spine width is finalised at
  // checkout from the chosen cover material + page count (see the note below).
  const geom = useMemo(
    () => coverWrapGeometry(albumSize, albumPages.length, DEFAULT_COVER),
    [albumSize, albumPages.length],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(600);
  useEffect(() => {
    const measure = () => { if (wrapRef.current) setPreviewW(wrapRef.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Merge a patch into a role's text (creating a sized default on first touch).
  const patchText = (cur: TextStyle | undefined, role: 'title' | 'subtitle' | 'spine' | 'blurb', patch: Partial<TextStyle>): TextStyle =>
    ({ ...(cur ?? defaultCoverText(role, geom)), ...patch });

  // Photo upload straight from the cover step — the cover comes BEFORE the
  // upload step in the wizard, so without this the "add a cover photo" prompt
  // would be a dead end. Routes through Megy's dispatch like every other add.
  const fileRef = useRef<HTMLInputElement>(null);
  const openUpload = () => fileRef.current?.click();
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) void b.dispatch({ type: 'add_photos', payload: { files }, rawMessage: 'add photos' });
    e.target.value = '';
  };

  const header = (
    <div className="flex items-center justify-between px-5 h-14 border-b border-[#EADFD3] shrink-0">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#2D2D2D]">Design your cover</h2>
        <p className="text-[11px] text-[#9B8B7A] -mt-0.5">Front · Spine · Back — printed as one wrap</p>
      </div>
      {mode === 'modal' && (
        <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-[#6B6B6B]"><X size={20} /></button>
      )}
    </div>
  );

  const body = (
    <div className="flex-1 overflow-auto p-5 space-y-5">
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} className="hidden" />
      {/* Live preview */}
      <div ref={wrapRef} className="w-full flex flex-col items-center">
        <CoverWrapPreview geometry={geom} coverDesign={d} photos={uploadedPhotos} width={Math.min(previewW, 820)} showGuides />
        <div className="flex justify-between w-full max-w-[820px] mt-1.5 px-1 text-[10px] uppercase tracking-wide text-[#B9A992]">
          <span>← Back</span><span>Spine</span><span>Front →</span>
        </div>
        <p className="text-[11px] text-[#9B8B7A] mt-2 text-center max-w-[560px]">
          {describeWrap(geom)}. Final spine width is set at checkout from your cover choice (soft/hardbound) + page count.
        </p>
      </div>

      {/* FRONT */}
      <Section title="Front cover">
        <PhotoStrip
          photos={uploadedPhotos}
          selectedId={d.front.photoId}
          onPick={(id) => setCoverFront({ photoId: d.front.photoId === id ? undefined : id })}
          onUpload={openUpload}
          label="Hero photo"
        />
        <Field label="Title">
          <input
            value={d.front.title?.text ?? ''}
            onChange={(e) => setCoverFront({ title: patchText(d.front.title, 'title', { text: e.target.value }) })}
            placeholder="e.g. The Cruz Family"
            className="cover-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title font">
            <FontSelect
              value={d.front.title?.fontFamily}
              onChange={(family) => setCoverFront({ title: patchText(d.front.title, 'title', { fontFamily: family }) })}
            />
          </Field>
          <Field label="Title color">
            <Swatches colors={COLORS} value={d.front.title?.color} onPick={(c) => setCoverFront({ title: patchText(d.front.title, 'title', { color: c }) })} />
          </Field>
        </div>
        <Field label="Subtitle (date / names)">
          <input
            value={d.front.subtitle?.text ?? ''}
            onChange={(e) => setCoverFront({ subtitle: patchText(d.front.subtitle, 'subtitle', { text: e.target.value }) })}
            placeholder="e.g. Summer 2026"
            className="cover-input"
          />
        </Field>
        <Field label="Background color">
          <Swatches colors={BG_SWATCHES} value={d.front.background} onPick={(c) => setCoverFront({ background: c })} />
        </Field>
      </Section>

      {/* SPINE */}
      <Section title="Spine">
        <Field label="Spine text (reads up the spine)">
          <input
            value={d.spine.text?.text ?? ''}
            onChange={(e) => setCoverSpine({ text: patchText(d.spine.text, 'spine', { text: e.target.value }) })}
            placeholder="e.g. The Cruz Family · 2026"
            className="cover-input"
          />
        </Field>
        <Field label="Spine font">
          <FontSelect
            value={d.spine.text?.fontFamily}
            onChange={(family) => setCoverSpine({ text: patchText(d.spine.text, 'spine', { fontFamily: family }) })}
          />
        </Field>
      </Section>

      {/* BACK */}
      <Section title="Back cover">
        <PhotoStrip
          photos={uploadedPhotos}
          selectedId={d.back.photoId}
          onPick={(id) => setCoverBack({ photoId: d.back.photoId === id ? undefined : id })}
          onUpload={openUpload}
          label="Back photo (optional)"
        />
        <Field label="Closing text (optional)">
          <input
            value={d.back.blurb?.text ?? ''}
            onChange={(e) => setCoverBack({ blurb: patchText(d.back.blurb, 'blurb', { text: e.target.value }) })}
            placeholder="A short note, quote, or thank-you"
            className="cover-input"
          />
        </Field>
        <Field label="Background color">
          <Swatches colors={BG_SWATCHES} value={d.back.background} onPick={(c) => setCoverBack({ background: c })} />
        </Field>
        <label className="flex items-center gap-2.5 mt-1 cursor-pointer select-none">
          <input type="checkbox" checked={!!d.back.brandMark} onChange={(e) => setCoverBack({ brandMark: e.target.checked })} className="w-4 h-4 accent-[#E8A598]" />
          <span className="text-sm text-[#5B534C]">Show the small “Megy Prints” mark on the back</span>
        </label>
      </Section>

      {mode === 'step' && uploadedPhotos.length === 0 && (
        <p className="text-[12px] text-[#9B8B7A] text-center bg-[#FBF3EA] rounded-lg px-3 py-2.5">
          Tip: add photos above to place a <b>hero photo</b> now — or skip it and drop one on later from the Preview screen.
        </p>
      )}
    </div>
  );

  const footer =
    mode === 'step' ? (
      <div className="shrink-0 border-t border-[#EADFD3] p-3 flex justify-between items-center bg-[#FFF8F0]">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[#8B7E7A] font-medium hover:bg-black/5 transition-colors">← Back</button>
        <button onClick={onNext} className="px-6 py-2.5 rounded-xl bg-[#E8A598] text-white font-semibold hover:brightness-105 active:scale-[0.98] transition-all shadow-sm">
          Continue to photos →
        </button>
      </div>
    ) : (
      <div className="shrink-0 border-t border-[#EADFD3] p-3 flex justify-end bg-[#FFF8F0]">
        <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[#E8A598] text-white font-semibold hover:brightness-105 active:scale-[0.98] transition-all shadow-sm">
          Done
        </button>
      </div>
    );

  const styleTag = (
    <style>{`.cover-input{width:100%;padding:9px 12px;border:1px solid #E4D8C9;border-radius:10px;background:#fff;font-size:14px;color:#2D2D2D;outline:none}.cover-input:focus{border-color:#E8A598}`}</style>
  );

  if (mode === 'step') {
    return (
      <div className="h-full flex flex-col bg-[#FFF8F0]">
        {header}
        {body}
        {footer}
        {styleTag}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-[#FFF8F0] w-full sm:max-w-4xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden">
        {header}
        {body}
        {footer}
      </div>
      {styleTag}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#EADFD3] p-4 space-y-3">
      <h3 className="font-display text-sm font-semibold text-[#2D2D2D]">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">{label}</span>
      {children}
    </label>
  );
}

function FontSelect({ value, onChange }: { value?: string; onChange: (family: string) => void }) {
  return (
    <select value={value ?? FONTS[6].family} onChange={(e) => onChange(e.target.value)} className="cover-input" style={{ fontFamily: value }}>
      {FONTS.map((f) => (
        <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>{f.name}</option>
      ))}
    </select>
  );
}

function Swatches({ colors, value, onPick }: { colors: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
          style={{ background: c, borderColor: value === c ? '#E8A598' : 'rgba(0,0,0,0.15)', boxShadow: value === c ? '0 0 0 2px #E8A598' : 'none' }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function PhotoStrip({ photos, selectedId, onPick, onUpload, label }: { photos: { id: string; previewUrl: string }[]; selectedId?: string; onPick: (id: string) => void; onUpload: () => void; label: string }) {
  if (!photos.length) {
    return (
      <div>
        <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">{label}</span>
        <button
          type="button"
          onClick={onUpload}
          className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-[#C56B4E] bg-[#FBF3EA] hover:bg-[#F6E7D8] border border-dashed border-[#E3C9B3] rounded-lg px-3 py-3 transition-colors"
        >
          <Upload size={16} /> Upload photos
        </button>
      </div>
    );
  }
  return (
    <div>
      <span className="block text-[11px] font-medium text-[#9B8B7A] mb-1">{label}</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="relative shrink-0 rounded-lg overflow-hidden"
            style={{ width: 56, height: 56, outline: selectedId === p.id ? '3px solid #E8A598' : '1px solid rgba(0,0,0,0.1)', outlineOffset: -1 }}
          >
            <img src={p.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          </button>
        ))}
        <button
          type="button"
          onClick={onUpload}
          title="Upload more photos"
          className="shrink-0 flex items-center justify-center rounded-lg border border-dashed border-[#E3C9B3] text-[#C56B4E] hover:bg-[#FBF3EA] transition-colors"
          style={{ width: 56, height: 56 }}
        >
          <Upload size={18} />
        </button>
      </div>
    </div>
  );
}
