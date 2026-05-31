import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Images, FileText, Plus, Trash2, Copy, Layers, LayoutGrid, Upload, Sparkles,
  Palette,
} from 'lucide-react';
import type {
  UploadedPhoto, AlbumPage, CanvasPhoto, TextElement, AlbumBackground, PhotoFilters,
} from './types';
import { PAGE_TEMPLATES, TEMPLATE_CATEGORIES } from './pageTemplates';
import PropertiesPanel from './PropertiesPanel';

/* ══════════════════════════════════════════════════════════════════════════
   UnifiedPanel — Single right panel combining sidebar content + properties
   Replaces EditSidebar (left) + PropertiesPanel (right) with one panel.
   ══════════════════════════════════════════════════════════════════════════ */

export interface UnifiedPanelProps {
  /* ── Photos tab ── */
  uploadedPhotos: UploadedPhoto[];
  onAddPhotos?: (files: FileList) => void;
  /* ── Pages tab ── */
  albumPages: AlbumPage[];
  currentPageIndex: number;
  selectedPhotoId: string | null;
  selectedTextId: string | null;
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onAddText: () => void;
  /* ── Templates tab ── */
  currentTemplateId?: string;
  onSetTemplate?: (id: string) => void;
  onAutoFill?: () => void;
  onClearAllSlots?: () => void;
  photosPerPage?: number;
  onSetPhotosPerPage?: (count: number | undefined) => void;
  onShuffleLayout?: () => void;
  /* ── Background tab (contains Properties as subsection) ── */
  selectedPhoto: CanvasPhoto | null;
  selectedText: TextElement | null;
  selectedBackground: (AlbumBackground & { x: number; y: number; width: number; height: number; rotation: number; filters: PhotoFilters; opacity: number }) | null;
  background: AlbumBackground;
  selectedSlotIndex: number | null;
  slotFills: (number | null)[];
  slotScales: number[];
  slotOffsetsX: number[];
  slotOffsetsY: number[];
  onUpdatePhoto: (id: string, updates: Partial<CanvasPhoto>) => void;
  onUpdateFilters: (id: string, filters: Partial<PhotoFilters>) => void;
  onUpdateText: (id: string, updates: Partial<TextElement>) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteText: (id: string) => void;
  onDuplicatePhoto: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onUpdateBackground: (bg: AlbumBackground) => void;
  onUpdateBackgroundTransform: (updates: Partial<Pick<AlbumBackground, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => void;
  onUpdateBackgroundFilters: (filters: Partial<PhotoFilters>) => void;
  onApplyBackgroundToAll?: () => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSlotScale: (slotIndex: number, scale: number) => void;
  onSetSlotOffset: (slotIndex: number, dx: number, dy: number) => void;
  onReplaceSlotPhoto: () => void;
}

export default function UnifiedPanel(props: UnifiedPanelProps) {
  const {
    uploadedPhotos, onAddPhotos,
    albumPages, currentPageIndex,
    selectedPhotoId, selectedTextId,
    onGoToPage, onAddPage, onDeletePage, onDuplicatePage, onAddText,
    currentTemplateId, onSetTemplate, onAutoFill, onClearAllSlots,
    photosPerPage, onSetPhotosPerPage, onShuffleLayout,
    selectedPhoto, selectedText, selectedBackground, background,
    selectedSlotIndex, slotFills, slotScales, slotOffsetsX, slotOffsetsY,
    onUpdatePhoto, onUpdateFilters, onUpdateText,
    onDeletePhoto, onDeleteText, onDuplicatePhoto, onBringToFront, onSendToBack,
    onUpdateBackground, onUpdateBackgroundTransform, onUpdateBackgroundFilters,
    onApplyBackgroundToAll,
    onClearSlot, onSetSlotScale, onSetSlotOffset, onReplaceSlotPhoto,
  } = props;

  /* ── Tab state: 4 tabs in single row ── */
  const [activeTab, setActiveTab] = useState<'photos' | 'pages' | 'templates' | 'background'>('photos');

  /* ── Auto-switch to Background when something is selected on canvas ── */
  const hasSelection = selectedPhoto !== null || selectedText !== null || selectedBackground !== null || selectedSlotIndex !== null;
  useEffect(() => {
    /* Auto-switch to Background tab on canvas selection, but NEVER kick user
       out of Photos or Pages tabs — they stay where they chose to be. */
    if (hasSelection && activeTab !== 'photos' && activeTab !== 'pages') {
      setActiveTab('background');
    }
  }, [selectedPhotoId, selectedTextId, selectedBackground !== null, selectedSlotIndex, activeTab]);

  /* ── Template filter state ── */
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotOptions = [1, 2, 3, 4, 5];

  const filteredTemplates = (() => {
    let result = templateCategory === 'all'
      ? PAGE_TEMPLATES
      : PAGE_TEMPLATES.filter((t) => t.category === templateCategory);
    if (photosPerPage !== undefined) {
      result = result.filter((t) => t.slotCount === photosPerPage);
    }
    return result;
  })();

  /* ── Tabs: single row of 4 ── */
  const tabs: { id: typeof activeTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'photos', label: 'Photos', icon: <Images size={13} />, badge: uploadedPhotos.length || undefined },
    { id: 'pages', label: 'Pages', icon: <FileText size={13} />, badge: albumPages.length || undefined },
    { id: 'templates', label: 'Templates', icon: <LayoutGrid size={13} /> },
    { id: 'background', label: 'Background', icon: <Palette size={13} /> },
  ];

  const TabButton = ({ t }: { t: typeof tabs[0] }) => (
    <button
      key={t.id}
      onClick={() => setActiveTab(t.id)}
      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium transition-all"
      style={{
        backgroundColor: activeTab === t.id ? '#fff' : 'transparent',
        color: activeTab === t.id ? '#2D2D2D' : '#9B9B9B',
        boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {t.icon}
      <span>{t.label}</span>
      {'badge' in t && t.badge !== undefined && t.badge > 0 && (
        <span className="ml-0.5 px-1 py-0 rounded-full text-[9px] bg-[#FDE8E4] text-[#E8A598] font-semibold">
          {t.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="w-80 bg-white border-l border-[#E8E8E8] flex flex-col h-full">
      {/* ── Tab Bar: single row of 4 tabs ── */}
      <div className="shrink-0 bg-[#FAFAFA] border-b border-[#E8E8E8] p-1.5">
        <div className="flex items-center gap-0.5">
          {tabs.map((t) => <TabButton key={t.id} t={t} />)}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          {/* ═══════ PHOTOS TAB ═══════ */}
          {activeTab === 'photos' && (
            <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) onAddPhotos?.(e.target.files); }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mb-4 py-2.5 border-2 border-dashed border-[#F4C2A1] rounded-xl text-[#E8A598] text-xs font-medium hover:bg-[#FFF5F0] transition-all flex items-center justify-center gap-2"
              >
                <Upload size={14} /> Upload Photos
              </button>

              {uploadedPhotos.length === 0 ? (
                <p className="text-xs text-[#9B9B9B] text-center py-6">Upload photos to start filling templates</p>
              ) : (
                <>
                  <p className="text-[10px] text-[#9B9B9B] mb-3 uppercase tracking-wider font-medium">
                    Your Photos ({uploadedPhotos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {uploadedPhotos.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-[#E8E8E8] hover:border-[#F4C2A1] transition-colors cursor-pointer">
                        <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ═══════ PAGES TAB ═══════ */}
          {activeTab === 'pages' && (
            <motion.div key="pages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
              <div className="flex gap-2 mb-4">
                <button onClick={onAddPage} className="flex-1 py-2 bg-[#F4C2A1] text-white text-xs font-medium rounded-xl hover:brightness-105 flex items-center justify-center gap-1.5 transition-all">
                  <Plus size={12} /> Add Page
                </button>
                <button onClick={onAddText} className="flex-1 py-2 bg-[#F0F0F0] text-[#6B6B6B] text-xs font-medium rounded-xl hover:bg-[#E8E8E8] flex items-center justify-center gap-1.5 transition-all">
                  <FileText size={12} /> Add Text
                </button>
              </div>

              {/* Slot count filter */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-semibold text-[#2D2D2D] uppercase tracking-wider">Slot Count</h4>
                  <span className="text-[9px] text-[#9B9B9B]">
                    {PAGE_TEMPLATES.filter(t => photosPerPage === undefined ? true : t.slotCount === photosPerPage).length} match
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  <button onClick={() => onSetPhotosPerPage?.(undefined)}
                    className="px-2.5 py-1 text-[10px] rounded-full font-medium transition-colors"
                    style={{ backgroundColor: photosPerPage === undefined ? '#F4C2A1' : '#F0F0F0', color: photosPerPage === undefined ? '#fff' : '#6B6B6B' }}>
                    All
                  </button>
                  {slotOptions.map((count) => (
                    <button key={count} onClick={() => onSetPhotosPerPage?.(count)}
                      className="px-2.5 py-1 text-[10px] rounded-full font-medium transition-colors"
                      style={{ backgroundColor: photosPerPage === count ? '#F4C2A1' : '#F0F0F0', color: photosPerPage === count ? '#fff' : '#6B6B6B' }}>
                      {count} slot{count > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
                <button onClick={onShuffleLayout}
                  className="w-full py-2 bg-white border border-[#F4C2A1] text-[#F4C2A1] text-[11px] font-medium rounded-xl hover:bg-[#F4C2A1] hover:text-white flex items-center justify-center gap-1.5 transition-all"
                >
                  <Sparkles size={12} /> Shuffle Layout
                </button>
              </div>

              {/* Page count indicator */}
              <p className="text-[10px] text-[#9B9B9B] mb-2">
                {albumPages.length} pages <span className="text-[#E8A598]">(40 minimum)</span>
              </p>

              {/* Page list */}
              <div className="space-y-2">
                {albumPages.map((page, i) => {
                  const slotPhotoCount = page.slotFills?.filter((f) => f !== null).length ?? 0;
                  const freeformCount = page.photos.length;
                  const totalPhotos = slotPhotoCount + freeformCount;
                  return (
                    <div key={page.id} onClick={() => onGoToPage(i)}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all hover:bg-[#F8F8F8]"
                      style={{
                        backgroundColor: i === currentPageIndex ? '#FDE8E4' : 'transparent',
                        border: i === currentPageIndex ? '1px solid #F4C2A1' : '1px solid transparent',
                      }}>
                      <span className="text-[11px] text-[#9B9B9B] w-5 font-medium">{i + 1}</span>
                      <div className="flex-1 h-14 rounded-lg overflow-hidden bg-white border border-[#E8E8E8] flex items-center justify-center text-[9px] text-[#C4C4C4]">
                        {totalPhotos > 0 ? `${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : 'Empty'}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={(e) => { e.stopPropagation(); onDuplicatePage(i); }} className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#9B9B9B] transition-colors"><Copy size={11} /></button>
                        {albumPages.length > 40 && (
                          <button onClick={(e) => { e.stopPropagation(); onDeletePage(i); }} className="p-1.5 rounded-md hover:bg-[#FDE8E4] text-[#E8A598] transition-colors"><Trash2 size={11} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ═══════ TEMPLATES TAB ═══════ */}
          {activeTab === 'templates' && (
            <motion.div key="templates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
              <h3 className="text-xs font-semibold text-[#2D2D2D] mb-3">Page Templates</h3>

              {/* Category filter */}
              <div className="flex flex-wrap gap-1 mb-3">
                <button onClick={() => setTemplateCategory('all')}
                  className="px-2.5 py-1 text-[10px] rounded-full font-medium transition-colors"
                  style={{ backgroundColor: templateCategory === 'all' ? '#F4C2A1' : '#F0F0F0', color: templateCategory === 'all' ? '#fff' : '#6B6B6B' }}>
                  All ({PAGE_TEMPLATES.length})
                </button>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button key={cat.id} onClick={() => setTemplateCategory(cat.id)}
                    className="px-2.5 py-1 text-[10px] rounded-full font-medium transition-colors"
                    style={{ backgroundColor: templateCategory === cat.id ? '#F4C2A1' : '#F0F0F0', color: templateCategory === cat.id ? '#fff' : '#6B6B6B' }}>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button onClick={onAutoFill} className="flex-1 py-2 bg-[#F4C2A1] text-white text-[11px] font-medium rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                  Auto-Fill
                </button>
                <button onClick={onClearAllSlots} className="px-4 py-2 border border-[#E8E8E8] text-[#6B6B6B] text-[11px] font-medium rounded-xl hover:bg-[#FDE8E4] hover:text-[#E8A598] transition-all">
                  Clear
                </button>
              </div>

              {/* Template grid — 3 columns for wider panel */}
              <div className="grid grid-cols-3 gap-2">
                {filteredTemplates.map((tmpl) => (
                  <button key={tmpl.id} onClick={() => onSetTemplate?.(tmpl.id)}
                    className="relative rounded-xl border-2 overflow-hidden transition-all hover:scale-[1.03] hover:shadow-md"
                    style={{
                      borderColor: currentTemplateId === tmpl.id ? '#F4C2A1' : '#E8E8E8',
                      backgroundColor: currentTemplateId === tmpl.id ? '#FEF6F3' : '#fff',
                      aspectRatio: '3/4',
                    }}
                  >
                    {/* Mini thumbnail showing slot layout — using 0-1 proportions * 100 for CSS % */}
                    <div className="absolute inset-1.5">
                      {tmpl.slots.map((slot, si) => (
                        <div key={si} className="absolute bg-[#E8E8E8] rounded-sm"
                          style={{
                            left: `${slot.x * 100}%`,
                            top: `${slot.y * 100}%`,
                            width: `${slot.width * 100}%`,
                            height: `${slot.height * 100}%`,
                            borderRadius: slot.shape === 'circle' ? '50%' : slot.shape === 'rounded' ? '3px' : '1px',
                            opacity: 0.7,
                          }}
                        />
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-1.5 py-1">
                      <span className="text-[8px] text-[#6B6B6B] font-medium truncate block">{tmpl.name}</span>
                      <span className="text-[7px] text-[#9B9B9B]">({tmpl.slotCount})</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ═══════ BACKGROUND TAB (contains Properties as subsection) ═══════ */}
          {activeTab === 'background' && (
            <motion.div key="background" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
              {/* ── Background Controls (always visible) ── */}
              <div className="shrink-0 p-4 space-y-3 border-b border-[#F0F0F0]">
                {/* Background type selector */}
                <div>
                  <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Type</p>
                  <div className="flex gap-1">
                    {(['solid', 'gradient', 'pattern', 'image'] as const).map((type) => (
                      <button key={type} onClick={() => onUpdateBackground?.({ ...background, type })}
                        className="flex-1 py-1.5 text-[10px] rounded-full font-medium capitalize transition-colors"
                        style={{ backgroundColor: background.type === type ? '#F4C2A1' : '#F0F0F0', color: background.type === type ? '#fff' : '#6B6B6B' }}>
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Solid color */}
                {background.type === 'solid' && (
                  <div>
                    <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['#FFFBF7', '#F8F3ED', '#E8F0E8', '#FFF3D8', '#E0E0E8', '#F0F0F0', '#E8D8B8', '#2D2D2D', '#FFFFFF', '#FDE8E4', '#E8A598', '#B8A9D9'].map((c) => (
                        <button key={c} onClick={() => onUpdateBackground?.({ ...background, type: 'solid', solid: c })}
                          className="w-7 h-7 rounded-full border border-[#E8E8E8] transition-transform hover:scale-110"
                          style={{ backgroundColor: c, boxShadow: background.solid === c ? '0 0 0 2px #F4C2A1' : 'none' }} />
                      ))}
                    </div>
                    <input type="color" value={background.solid || '#FFFBF7'}
                      onChange={(e) => onUpdateBackground?.({ ...background, type: 'solid', solid: e.target.value })}
                      className="mt-2 w-full h-8 rounded-lg cursor-pointer" />
                  </div>
                )}

                {/* Gradient presets */}
                {background.type === 'gradient' && (
                  <div>
                    <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Presets</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { name: 'Sunset', stops: [{ offset: 0, color: '#FF6B6B' }, { offset: 0.5, color: '#FFE66D' }, { offset: 1, color: '#FF8E53' }] },
                        { name: 'Ocean', stops: [{ offset: 0, color: '#2193B0' }, { offset: 1, color: '#6DD5ED' }] },
                        { name: 'Pastel', stops: [{ offset: 0, color: '#F4C2A1' }, { offset: 0.5, color: '#B8A9D9' }, { offset: 1, color: '#9BCFB8' }] },
                        { name: 'Rose Gold', stops: [{ offset: 0, color: '#E8A598' }, { offset: 1, color: '#F4C2A1' }] },
                        { name: 'Mint', stops: [{ offset: 0, color: '#9BCFB8' }, { offset: 1, color: '#E4F0E0' }] },
                        { name: 'Lavender', stops: [{ offset: 0, color: '#B8A9D9' }, { offset: 1, color: '#E8E0F0' }] },
                        { name: 'Peach', stops: [{ offset: 0, color: '#F4C2A1' }, { offset: 1, color: '#FDE8E4' }] },
                        { name: 'Midnight', stops: [{ offset: 0, color: '#2D2D2D' }, { offset: 1, color: '#6B6B6B' }] },
                      ].map((g) => (
                        <button key={g.name} onClick={() => onUpdateBackground?.({ ...background, type: 'gradient', gradient: { type: 'linear', angle: 135, stops: g.stops } })}
                          className="h-10 rounded-lg text-[9px] font-medium text-white flex items-center justify-center transition-transform hover:scale-[1.03]"
                          style={{ background: `linear-gradient(135deg, ${g.stops.map((s) => s.color).join(', ')})` }}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pattern presets */}
                {background.type === 'pattern' && (
                  <div>
                    <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Patterns</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['dots', 'stripes', 'diagonal', 'chevron', 'grid', 'floral', 'geometric', 'watercolor', 'marble', 'wood', 'confetti', 'stars', 'hearts', 'polka', 'waves'].map((p) => (
                        <button key={p} onClick={() => onUpdateBackground?.({ ...background, type: 'pattern', pattern: p })}
                          className="py-2 rounded-lg text-[9px] font-medium capitalize transition-colors border"
                          style={{
                            backgroundColor: background.pattern === p ? '#FDE8E4' : '#fff',
                            borderColor: background.pattern === p ? '#F4C2A1' : '#E8E8E8',
                            color: background.pattern === p ? '#E8A598' : '#6B6B6B',
                          }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image background */}
                {background.type === 'image' && (
                  <div>
                    <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Image URL</p>
                    <input type="text" placeholder="Enter image URL..."
                      value={background.image || ''}
                      onChange={(e) => onUpdateBackground?.({ ...background, type: 'image', image: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-[#E8E8E8] rounded-lg focus:outline-none focus:border-[#F4C2A1]" />
                  </div>
                )}

                {/* Opacity */}
                <div>
                  <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Opacity</p>
                  <input type="range" min="0" max="100" value={background.opacity ?? 100}
                    onChange={(e) => onUpdateBackground?.({ ...background, opacity: Number(e.target.value) })}
                    className="w-full" />
                  <p className="text-[10px] text-[#9B9B9B] text-right">{background.opacity ?? 100}%</p>
                </div>

                {/* Apply to All */}
                <button
                  onClick={onApplyBackgroundToAll}
                  className="w-full py-2 bg-white border border-[#F4C2A1] text-[#F4C2A1] text-[11px] font-medium rounded-xl hover:bg-[#F4C2A1] hover:text-white flex items-center justify-center gap-1.5 transition-all"
                >
                  <Layers size={12} /> Apply to All Pages
                </button>
              </div>

              {/* ── Properties Subsection (selection-based content) ── */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PropertiesPanel
                  selectedPhoto={selectedPhoto}
                  selectedText={selectedText}
                  selectedBackground={selectedBackground}
                  background={background}
                  selectedSlotIndex={selectedSlotIndex}
                  slotFills={slotFills}
                  slotScales={slotScales}
                  slotOffsetsX={slotOffsetsX}
                  slotOffsetsY={slotOffsetsY}
                  uploadedPhotos={uploadedPhotos}
                  onUpdatePhoto={onUpdatePhoto}
                  onUpdateFilters={onUpdateFilters}
                  onUpdateText={onUpdateText}
                  onDeletePhoto={onDeletePhoto}
                  onDeleteText={onDeleteText}
                  onDuplicatePhoto={onDuplicatePhoto}
                  onBringToFront={onBringToFront}
                  onSendToBack={onSendToBack}
                  onUpdateBackground={onUpdateBackground}
                  onUpdateBackgroundTransform={onUpdateBackgroundTransform}
                  onUpdateBackgroundFilters={onUpdateBackgroundFilters}
                  onClearSlot={onClearSlot}
                  onSetSlotScale={onSetSlotScale}
                  onSetSlotOffset={onSetSlotOffset}
                  onReplaceSlotPhoto={onReplaceSlotPhoto}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
