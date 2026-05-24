import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, LayoutGrid, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { THEMES, type TemplateType, type LayoutStyle } from './builder/types';
import { LAYOUT_DEFINITIONS } from './builder/layouts';

/** Theme category for grouping templates in the UI */
type ThemeCategory = 'Romantic' | 'Family' | 'Modern' | 'Festive' | 'Adventure' | 'All';

/** Map each TemplateType to a display category */
const THEME_CATEGORIES: Record<TemplateType, ThemeCategory> = {
  wedding: 'Romantic',
  baby: 'Family',
  birthday: 'Festive',
  family: 'Family',
  graduation: 'Festive',
  travel: 'Adventure',
  minimalist: 'Modern',
  kids: 'Family',
  vintage: 'Romantic',
  classic: 'Modern',
};

interface TemplateDisplay {
  id: TemplateType;
  name: string;
  description: string;
  image: string;
  accentColor: string;
  layoutNames: string[];
  specLayout: string;
  category: ThemeCategory;
}

function buildTemplateList(): TemplateDisplay[] {
  return Object.values(THEMES).map((t) => {
    const uniqueLayouts: LayoutStyle[] = [...new Set<LayoutStyle>(t.layoutPreferences)];
    const layoutNames = uniqueLayouts.map((l: LayoutStyle) => LAYOUT_DEFINITIONS[l]?.name ?? l);
    return {
      id: t.type,
      name: t.name,
      description: t.description,
      image: t.coverImage,
      accentColor: t.accentColor,
      layoutNames,
      specLayout: layoutNames.slice(0, 4).join(', '),
      category: THEME_CATEGORIES[t.type],
    };
  });
}

const ALL_TEMPLATES = buildTemplateList();

/** BUG FIX: categories are now derived from THEME_CATEGORIES, not template names */
const allCategories: ThemeCategory[] = ['All', ...Array.from(new Set(ALL_TEMPLATES.map((t) => t.category)))];

export default function Templates() {
  const [activeTab, setActiveTab] = useState<ThemeCategory>('All');
  const [modalTemplate, setModalTemplate] = useState<TemplateDisplay | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  /** BUG FIX: filter by category, not by template name */
  const filtered = useMemo(() => {
    if (activeTab === 'All') return ALL_TEMPLATES;
    return ALL_TEMPLATES.filter((t) => t.category === activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#FFF8F0] pt-24 pb-12 px-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-[#2D2D2D]">Choose Your Style</h1>
          <p className="mt-3 text-lg text-[#6B6B6B] max-w-[600px] mx-auto">{ALL_TEMPLATES.length} beautifully designed templates for every occasion.</p>
        </div>

        <div className="flex gap-2 justify-center mb-8 flex-wrap">
          {allCategories.map((cat) => (
            <button key={cat} onClick={() => setActiveTab(cat)}
              className="flex-shrink-0 px-4 py-2 rounded-full font-body text-sm font-medium transition-all whitespace-nowrap"
              style={{ backgroundColor: activeTab === cat ? '#F4C2A1' : 'transparent', color: activeTab === cat ? '#fff' : '#6B6B6B' }}>
              {cat}
            </button>
          ))}
        </div>

        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map((t, i) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.4) }}
                className="group bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <img src={t.image} alt={t.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-400" loading="lazy" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2"
                    style={{ backgroundColor: `${t.accentColor}CC` }}>
                    <button onClick={() => { setModalTemplate(t); setModalOpen(true); }}
                      className="px-5 py-2 bg-white rounded-lg font-body text-sm font-semibold" style={{ color: t.accentColor }}>Preview</button>
                    <button onClick={() => navigate(`/builder?template=${t.id}`)}
                      className="px-5 py-2 rounded-lg font-body text-sm font-semibold border-2 border-white text-white hover:bg-white/10 transition-colors">Use Template</button>
                  </div>
                </div>
                <div className="p-4">
                  <div className="h-1 w-full rounded-full mb-3" style={{ backgroundColor: t.accentColor }} />
                  <h3 className="font-display text-lg font-semibold text-[#2D2D2D]">{t.name}</h3>
                  <p className="text-sm text-[#6B6B6B] mt-1 line-clamp-2">{t.description}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {modalTemplate && (
          <Dialog open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
            <DialogContent className="max-w-[600px] p-0 rounded-2xl border-0 bg-[#FFFBF7] overflow-hidden">
              <div className="relative aspect-[16/9]">
                <img src={modalTemplate.image} alt={modalTemplate.name} className="w-full h-full object-cover" />
                <button onClick={() => setModalOpen(false)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <div className="p-6">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">{modalTemplate.name}</DialogTitle>
                  <DialogDescription className="text-[#6B6B6B] mt-2">{modalTemplate.description}</DialogDescription>
                </DialogHeader>
                <div className="flex gap-4 mt-4 text-sm text-[#6B6B6B]">
                  <span className="flex items-center gap-1"><LayoutGrid size={14} /> {modalTemplate.specLayout}</span>
                </div>
                <button onClick={() => { setModalOpen(false); navigate(`/builder?template=${modalTemplate.id}`); }}
                  className="w-full mt-4 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all">Use This Template</button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <div className="mt-12 text-center bg-[#FBE5D8] rounded-2xl py-12 px-6">
          <h2 className="font-display text-3xl font-bold text-[#2D2D2D]">Ready to Create?</h2>
          <p className="text-[#6B6B6B] mt-2">Start building your album with any template.</p>
          <button onClick={() => navigate('/builder')} className="mt-4 px-8 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 inline-flex items-center gap-2 transition-all">
            Start Building <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
