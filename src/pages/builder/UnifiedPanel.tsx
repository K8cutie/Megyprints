/* >>> LAST MODIFIED: 2026-06-05 04:10 SGT — Session 7: Tab persistence + memo <<< */
import { useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Images, FileText, LayoutGrid, Palette, PanelLeftClose, PanelLeftOpen,
  Upload, Plus, Trash2, Copy, Sparkles, Layers,
} from 'lucide-react';
import type {
  UploadedPhoto, AlbumPage, CanvasPhoto, TextElement, AlbumBackground, PhotoFilters,
} from './types';
import { PAGE_TEMPLATES, TEMPLATE_CATEGORIES, hasQrSlot, photoSlotCount } from './pageTemplates';
import PropertiesPanel from './PropertiesPanel';
import { getPersistedSidebarTab, setPersistedSidebarTab } from './sidebarTabStore';
import { TEXTURE_NAMES, TEXTURE_COLORS, DEFAULT_TEXTURE_COLORS, textureDataUri, TEXTURE_TILE_PX } from './textures';

/* ══════════════════════════════════════════════════════════════════════════
   UnifiedPanel — Vertical icon sidebar on the LEFT with collapsible content
   ══════════════════════════════════════════════════════════════════════════ */

export interface UnifiedPanelProps {
  uploadedPhotos: UploadedPhoto[];
  onAddPhotos?: (files: FileList) => void;
  getPageSnapshot?: (pageId: string) => string | undefined;
  albumPages: AlbumPage[];
  currentPageIndex: number;
  selectedPhotoId: string | null;
  selectedTextId: string | null;
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onAddText: () => void;
  currentTemplateId?: string;
  onSetTemplate?: (id: string) => void;
  onAutoFill?: () => void;
  onClearAllSlots?: () => void;
  photosPerPage?: number;
  onSetPhotosPerPage?: (count: number | undefined) => void;
  onShuffleLayout?: () => void;
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

/* Sidebar item definition */
const SIDEBAR_ITEMS: { id: 'photos' | 'pages' | 'templates' | 'background'; icon: typeof Images; label: string }[] = [
  { id: 'photos', icon: Images, label: 'Photos' },
  { id: 'pages', icon: FileText, label: 'Pages' },
  { id: 'templates', icon: LayoutGrid, label: 'Templates' },
  { id: 'background', icon: Palette, label: 'Background' },
];

const UnifiedPanel = memo(function UnifiedPanel(props: UnifiedPanelProps) {
  const {
    uploadedPhotos, onAddPhotos, getPageSnapshot,
    albumPages, currentPageIndex,
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

  /* ── Collapse state ── */
  const [collapsed, setCollapsed] = useState(false);

  /* ── Active tab — persisted in localStorage so it survives remounts ── */
  const [, setTabTick] = useState(0);
  const activeTab = getPersistedSidebarTab();
  const setActiveTab = useCallback((tab: 'photos' | 'pages' | 'templates' | 'background') => {
    setPersistedSidebarTab(tab);
    setTabTick((t) => t + 1);
  }, []);

  /* ── Template filter ── */
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotOptions = [1, 2, 3, 4, 5];

  const filteredTemplates = (() => {
    // Exclude retired QR templates (tqr-*) from selection — they still resolve via
    // getTemplateById so old albums render, but users can't pick them anymore.
    let result = (templateCategory === 'all'
      ? PAGE_TEMPLATES
      : PAGE_TEMPLATES.filter((t) => t.category === templateCategory)
    ).filter((t) => !hasQrSlot(t));
    if (photosPerPage !== undefined) {
      result = result.filter((t) => photoSlotCount(t) === photosPerPage);
    }
    return result;
  })();

  /* ── Icon sidebar item ── */
  const IconItem = ({ item }: { item: typeof SIDEBAR_ITEMS[0] }) => {
    const isActive = activeTab === item.id;
    const Icon = item.icon;
    return (
      <button
        onClick={() => { setActiveTab(item.id); setCollapsed(false); }}
        className="w-full flex flex-col items-center gap-1 py-3 px-1 transition-all relative"
        style={{
          color: isActive ? '#E8A598' : '#9B9B9B',
          backgroundColor: isActive ? '#FDE8E4' : 'transparent',
        }}
        title={item.label}
      >
        <Icon size={20} />
        <span className="text-[9px] font-medium">{item.label}</span>
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-[#E8A598]" />
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full shrink-0">
      {/* ── Icon Sidebar (always visible) ── */}
      <div className="w-14 bg-white border-r border-[#E8E8E8] flex flex-col items-center py-2 relative z-10">
        {/* Icons */}
        <div className="flex-1 flex flex-col gap-1 w-full">
          {SIDEBAR_ITEMS.map((item) => (
            <IconItem key={item.id} item={item} />
          ))}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center py-3 text-[#9B9B9B] hover:text-[#E8A598] hover:bg-[#FDE8E4] transition-all"
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* ── Content Panel (collapsible) ── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="bg-white border-r border-[#E8E8E8] flex flex-col overflow-hidden"
          >
            {/* Tab Content */}
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
                          {PAGE_TEMPLATES.filter(t => !hasQrSlot(t) && (photosPerPage === undefined ? true : photoSlotCount(t) === photosPerPage)).length} match
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

                    {/* Page count */}
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
                            {(() => {
                              const snapshot = getPageSnapshot?.(page.id);
                              if (snapshot) {
                                return (
                                  <div className="flex-1 h-14 rounded-lg overflow-hidden bg-white border border-[#E8E8E8]">
                                    <img src={snapshot} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                                  </div>
                                );
                              }
                              return (
                                <div className="flex-1 h-14 rounded-lg overflow-hidden bg-white border border-[#E8E8E8] flex items-center justify-center text-[9px] text-[#C4C4C4]">
                                  {totalPhotos > 0 ? `${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : 'Empty'}
                                </div>
                              );
                            })()}
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
                        All ({PAGE_TEMPLATES.filter(t => !hasQrSlot(t)).length})
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

                    {/* Template grid */}
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
                            <span className="text-[7px] text-[#9B9B9B]">({photoSlotCount(tmpl)}{hasQrSlot(tmpl) ? '+QR' : ''})</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ═══════ BACKGROUND TAB ═══════ */}
                {activeTab === 'background' && (
                  <motion.div key="background" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                    {/* Background Controls */}
                    <div className="shrink-0 p-4 space-y-3 border-b border-[#F0F0F0]">
                      <div>
                        <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Type</p>
                        <div className="flex gap-1">
                          {(['solid', 'gradient', 'texture', 'image'] as const).map((type) => (
                            <button key={type}
                              onClick={() => onUpdateBackground?.(type === 'texture'
                                ? { ...background, type, texture: background.texture ?? TEXTURE_NAMES[0] }
                                : { ...background, type })}
                              className="flex-1 py-1.5 text-[10px] rounded-full font-medium capitalize transition-colors"
                              style={{ backgroundColor: background.type === type ? '#F4C2A1' : '#F0F0F0', color: background.type === type ? '#fff' : '#6B6B6B' }}>
                              {type === 'texture' ? 'Textures' : type}
                            </button>
                          ))}
                        </div>
                      </div>

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

                      {background.type === 'texture' && (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Material</p>
                            <div className="grid grid-cols-4 gap-1.5">
                              {TEXTURE_NAMES.map((p) => (
                                <button key={p} onClick={() => onUpdateBackground?.({ ...background, type: 'texture', texture: p, textureColor: background.textureColor })}
                                  title={p}
                                  className="relative aspect-square rounded-lg overflow-hidden transition-transform hover:scale-[1.03] border-2"
                                  style={{
                                    backgroundImage: `url("${textureDataUri(p, background.textureColor)}")`,
                                    backgroundSize: `${TEXTURE_TILE_PX}px ${TEXTURE_TILE_PX}px`,
                                    backgroundRepeat: 'repeat',
                                    borderColor: background.texture === p ? '#F4C2A1' : 'transparent',
                                  }}>
                                  <span className="absolute bottom-0 inset-x-0 text-[7px] font-semibold capitalize text-stone-700 bg-white/70 py-0.5 text-center">
                                    {p}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Color</p>
                            <div className="grid grid-cols-4 gap-1.5">
                              {TEXTURE_COLORS.map((c) => {
                                const mat = background.texture || TEXTURE_NAMES[0];
                                const active = (background.textureColor ?? DEFAULT_TEXTURE_COLORS[mat as keyof typeof DEFAULT_TEXTURE_COLORS]).toLowerCase() === c.hex.toLowerCase();
                                return (
                                  <button key={c.hex} onClick={() => onUpdateBackground?.({ ...background, type: 'texture', texture: mat, textureColor: c.hex })}
                                    title={c.name}
                                    className="relative aspect-square rounded-lg overflow-hidden transition-transform hover:scale-[1.03] border-2"
                                    style={{
                                      backgroundImage: `url("${textureDataUri(mat, c.hex)}")`,
                                      backgroundSize: `${TEXTURE_TILE_PX}px ${TEXTURE_TILE_PX}px`,
                                      backgroundRepeat: 'repeat',
                                      borderColor: active ? '#F4C2A1' : 'transparent',
                                    }} />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {background.type === 'image' && (
                        <div>
                          <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Image URL</p>
                          <input type="text" placeholder="Enter image URL..."
                            value={background.image || ''}
                            onChange={(e) => onUpdateBackground?.({ ...background, type: 'image', image: e.target.value })}
                            className="w-full px-3 py-2 text-xs border border-[#E8E8E8] rounded-lg focus:outline-none focus:border-[#F4C2A1]" />
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] text-[#9B9B9B] mb-1.5 uppercase tracking-wider font-medium">Opacity</p>
                        <input type="range" min="0" max="100" value={background.opacity ?? 100}
                          onChange={(e) => onUpdateBackground?.({ ...background, opacity: Number(e.target.value) })}
                          className="w-full" />
                        <p className="text-[10px] text-[#9B9B9B] text-right">{background.opacity ?? 100}%</p>
                      </div>

                      <button
                        onClick={onApplyBackgroundToAll}
                        className="w-full py-2 bg-white border border-[#F4C2A1] text-[#F4C2A1] text-[11px] font-medium rounded-xl hover:bg-[#F4C2A1] hover:text-white flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Layers size={12} /> Apply to All Pages
                      </button>
                    </div>

                    {/* Properties Subsection */}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default UnifiedPanel;
