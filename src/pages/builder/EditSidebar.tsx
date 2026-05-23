import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Images, FileText, Plus, Trash2, Copy, ChevronRight,
  ChevronLeft, Layers, GripVertical, LayoutGrid, Upload,
} from 'lucide-react';
import type { UploadedPhoto, AlbumPage, CanvasPhoto, TextElement } from './types';
import { PAGE_TEMPLATES, TEMPLATE_CATEGORIES } from './pageTemplates';

interface EditSidebarProps {
  activeTab: 'photos' | 'pages' | 'layers' | 'templates';
  onTabChange: (tab: 'photos' | 'pages' | 'layers' | 'templates') => void;
  uploadedPhotos: UploadedPhoto[];
  albumPages: AlbumPage[];
  currentPageIndex: number;
  photos: CanvasPhoto[];
  textElements: TextElement[];
  selectedPhotoId: string | null;
  selectedTextId: string | null;
  onSelectPhoto: (id: string | null) => void;
  onSelectText: (id: string | null) => void;
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onAddText: () => void;
  currentTemplateId?: string;
  onSetTemplate?: (id: string) => void;
  onAutoFill?: () => void;
  onClearAllSlots?: () => void;
  onAddPhotos?: (files: FileList) => void;
}

export default function EditSidebar(props: EditSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const {
    activeTab, onTabChange, uploadedPhotos, albumPages, currentPageIndex,
    photos, textElements, selectedPhotoId, selectedTextId,
    onSelectPhoto, onSelectText,
    onGoToPage, onAddPage, onDeletePage, onDuplicatePage, onAddText,
    currentTemplateId, onSetTemplate,
    onAutoFill, onClearAllSlots, onAddPhotos,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [templateCategory, setTemplateCategory] = useState<string>('all');

  const tabs = [
    { id: 'photos' as const, label: 'Photos', icon: <Images size={16} /> },
    { id: 'templates' as const, label: 'Templates', icon: <LayoutGrid size={16} /> },
    { id: 'pages' as const, label: 'Pages', icon: <FileText size={16} /> },
    { id: 'layers' as const, label: 'Layers', icon: <Layers size={16} /> },
  ];

  const filteredTemplates = templateCategory === 'all'
    ? PAGE_TEMPLATES
    : PAGE_TEMPLATES.filter((t) => t.category === templateCategory);

  if (collapsed) {
    return (
      <div className="w-10 bg-[#FAFAFA] border-r border-[#E8E8E8] flex flex-col items-center py-2 gap-1">
        <button onClick={() => setCollapsed(false)} className="p-1.5 rounded-md hover:bg-[#F0F0F0] mb-2">
          <ChevronRight size={16} className="text-[#6B6B6B]" />
        </button>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { onTabChange(t.id); setCollapsed(false); }}
            className="p-2 rounded-md transition-colors"
            style={{ backgroundColor: activeTab === t.id ? '#FDE8E4' : 'transparent', color: activeTab === t.id ? '#E8A598' : '#9B9B9B' }}>
            {t.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 bg-[#FAFAFA] border-r border-[#E8E8E8] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E8E8]">
        <div className="flex gap-0.5 bg-[#F0F0F0] rounded-lg p-0.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => onTabChange(t.id)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1"
              style={{ backgroundColor: activeTab === t.id ? '#fff' : 'transparent', color: activeTab === t.id ? '#2D2D2D' : '#9B9B9B', boxShadow: activeTab === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 rounded-md hover:bg-[#F0F0F0]">
          <ChevronLeft size={14} className="text-[#9B9B9B]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'photos' && (
            <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3">
              <>
                {/* Upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) onAddPhotos?.(e.target.files); }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full mb-3 py-2.5 border-2 border-dashed border-[#F4C2A1] rounded-lg text-[#E8A598] text-xs font-medium hover:bg-[#FFF5F0] transition-all flex items-center justify-center gap-1.5"
                >
                  <Upload size={14} /> Upload Photos
                </button>

                {uploadedPhotos.length === 0 ? (
                  <p className="text-xs text-[#9B9B9B] text-center py-4">Upload photos to start filling templates</p>
                ) : (
                  <>
                    <p className="text-[10px] text-[#9B9B9B] mb-2 uppercase tracking-wider">Your Photos ({uploadedPhotos.length})</p>
                    <p className="text-[10px] text-[#9B9B9B] mb-3">Go to Templates tab to place photos in layouts</p>
                    <div className="grid grid-cols-2 gap-2">
                      {uploadedPhotos.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-[#E8E8E8]">
                          <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            </motion.div>
          )}

          {activeTab === 'pages' && (
            <motion.div key="pages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3">
              <div className="flex gap-2 mb-3">
                <button onClick={onAddPage} className="flex-1 py-1.5 bg-[#F4C2A1] text-white text-xs font-medium rounded-lg hover:brightness-105 flex items-center justify-center gap-1">
                  <Plus size={12} /> Add Page
                </button>
                <button onClick={onAddText} className="flex-1 py-1.5 bg-[#F0F0F0] text-[#6B6B6B] text-xs font-medium rounded-lg hover:bg-[#E8E8E8] flex items-center justify-center gap-1">
                  <FileText size={12} /> Add Text
                </button>
              </div>
              <div className="space-y-2">
                {albumPages.map((page, i) => (
                  <div key={page.id} onClick={() => onGoToPage(i)}
                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: i === currentPageIndex ? '#FDE8E4' : 'transparent', border: i === currentPageIndex ? '1px solid #F4C2A1' : '1px solid transparent' }}>
                    <span className="text-[10px] text-[#9B9B9B] w-5">{i + 1}</span>
                    <div className="flex-1 h-12 rounded-md overflow-hidden bg-white border border-[#E8E8E8] flex items-center justify-center text-[8px] text-[#C4C4C4]">
                      {page.photos.length} photos
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); onDuplicatePage(i); }} className="p-1 rounded hover:bg-[#F0F0F0] text-[#9B9B9B]"><Copy size={10} /></button>
                      {albumPages.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); onDeletePage(i); }} className="p-1 rounded hover:bg-[#FDE8E4] text-[#E8A598]"><Trash2 size={10} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'layers' && (
            <motion.div key="layers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3">
              {[...photos].sort((a, b) => b.zIndex - a.zIndex).map((photo, i, arr) => (
                <div key={photo.id} onClick={() => onSelectPhoto(photo.id)}
                  className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-[#F0F0F0] transition-colors"
                  style={{ backgroundColor: selectedPhotoId === photo.id ? '#FDE8E4' : 'transparent' }}>
                  <GripVertical size={12} className="text-[#C4C4C4]" />
                  <div className="w-8 h-8 rounded bg-[#E8E8E8] flex items-center justify-center"><Images size={12} className="text-[#9B9B9B]" /></div>
                  <span className="text-xs text-[#6B6B6B] flex-1 truncate">Photo {photo.photoIndex + 1}</span>
                  <span className="text-[9px] text-[#C4C4C4]">{arr.length - i}</span>
                </div>
              ))}
              {textElements.map((text) => (
                <div key={text.id} onClick={() => onSelectText(text.id)}
                  className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-[#F0F0F0] transition-colors"
                  style={{ backgroundColor: selectedTextId === text.id ? '#FDE8E4' : 'transparent' }}>
                  <GripVertical size={12} className="text-[#C4C4C4]" />
                  <div className="w-8 h-8 rounded bg-[#E8E8E8] flex items-center justify-center"><FileText size={12} className="text-[#9B9B9B]" /></div>
                  <span className="text-xs text-[#6B6B6B] flex-1 truncate">{text.text.slice(0, 20)}</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── Templates Tab ── */}
          {activeTab === 'templates' && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-3"
            >
              <h3 className="text-xs font-semibold text-[#2D2D2D] mb-2">Page Templates</h3>

              {/* Category filter */}
              <div className="flex flex-wrap gap-1 mb-3">
                <button onClick={() => setTemplateCategory('all')}
                  className="px-2 py-0.5 text-[10px] rounded-full font-medium transition-colors"
                  style={{ backgroundColor: templateCategory === 'all' ? '#F4C2A1' : '#F0F0F0', color: templateCategory === 'all' ? '#fff' : '#6B6B6B' }}>
                  All ({PAGE_TEMPLATES.length})
                </button>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button key={cat.id} onClick={() => setTemplateCategory(cat.id)}
                    className="px-2 py-0.5 text-[10px] rounded-full font-medium transition-colors"
                    style={{ backgroundColor: templateCategory === cat.id ? '#F4C2A1' : '#F0F0F0', color: templateCategory === cat.id ? '#fff' : '#6B6B6B' }}>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-3">
                <button onClick={onAutoFill} className="flex-1 py-1.5 bg-[#F4C2A1] text-white text-[10px] font-medium rounded-lg hover:brightness-105 transition-all flex items-center justify-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                  Auto-Fill Slots
                </button>
                <button onClick={onClearAllSlots} className="px-3 py-1.5 border border-[#E8E8E8] text-[#6B6B6B] text-[10px] font-medium rounded-lg hover:bg-[#FDE8E4] hover:text-[#E8A598] hover:border-[#E8A598] transition-all">
                  Clear
                </button>
              </div>

              {/* Template grid */}
              <div className="grid grid-cols-2 gap-2">
                {filteredTemplates.map((tmpl) => (
                  <button key={tmpl.id} onClick={() => onSetTemplate?.(tmpl.id)}
                    className="relative rounded-lg border-2 overflow-hidden transition-all hover:scale-[1.02]"
                    style={{
                      borderColor: currentTemplateId === tmpl.id ? '#F4C2A1' : '#E8E8E8',
                      backgroundColor: currentTemplateId === tmpl.id ? '#FEF6F3' : '#fff',
                      aspectRatio: '3/4',
                    }}
                  >
                    {/* Mini thumbnail showing slot layout */}
                    <div className="absolute inset-1">
                      {tmpl.slots.map((slot, si) => (
                        <div key={si} className="absolute bg-[#E8E8E8] rounded-sm"
                          style={{
                            left: `${slot.x}%`, top: `${slot.y}%`,
                            width: `${slot.width}%`, height: `${slot.height}%`,
                            borderRadius: slot.shape === 'circle' ? '50%' : slot.shape === 'rounded' ? '3px' : '1px',
                            opacity: 0.7,
                          }}
                        />
                      ))}
                    </div>
                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-1.5 py-0.5">
                      <span className="text-[9px] text-[#6B6B6B] font-medium">{tmpl.name}</span>
                      <span className="text-[8px] text-[#9B9B9B] ml-1">({tmpl.slotCount})</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
