import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Upload,
  Images,
  Paintbrush,
  Type,
  Eye,
  MousePointerClick,
  Check,
  Sparkles,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const gentle = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* ─── demo photos (CSS gradients as placeholders) ─── */
const DEMO_PHOTOS = [
  { id: 'p1', gradient: 'linear-gradient(135deg, #F4C2A1 0%, #E8A598 100%)', label: 'Photo 1' },
  { id: 'p2', gradient: 'linear-gradient(135deg, #B8A9D9 0%, #9B8BB5 100%)', label: 'Photo 2' },
  { id: 'p3', gradient: 'linear-gradient(135deg, #9BCFB8 0%, #7AB89A 100%)', label: 'Photo 3' },
  { id: 'p4', gradient: 'linear-gradient(135deg, #8FBFE0 0%, #6FA8D0 100%)', label: 'Photo 4' },
];

/* ─── template slots for the demo canvas (percentages) ─── */
const DEMO_SLOTS = [
  { id: 's1', x: 3, y: 3, w: 55, h: 55, shape: 'rounded' as const },
  { id: 's2', x: 60, y: 3, w: 37, h: 28, shape: 'rounded' as const },
  { id: 's3', x: 60, y: 34, w: 37, h: 28, shape: 'rounded' as const },
  { id: 's4', x: 3, y: 62, w: 94, h: 35, shape: 'rounded' as const },
];

/* ─── step config ─── */
const STEPS = [
  { key: 'upload', label: 'Upload', icon: Upload, color: '#F4C2A1' },
  { key: 'template', label: 'Template', icon: Images, color: '#B8A9D9' },
  { key: 'design', label: 'Design', icon: Paintbrush, color: '#9BCFB8' },
  { key: 'text', label: 'Add Text', icon: Type, color: '#8FBFE0' },
  { key: 'preview', label: 'Preview', icon: Eye, color: '#D4B896' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

/* ═══════════════════════════════════════════════════════════
   ANIMATED DEMO CANVAS
   ═══════════════════════════════════════════════════════════ */

function DemoCanvas({ step }: { step: StepKey }) {
  const [filledSlots, setFilledSlots] = useState<number[]>([]);
  const [showText, setShowText] = useState(false);
  const [textEdited, setTextEdited] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  /* reset on step change */
  useEffect(() => {
    setFilledSlots([]);
    setShowText(false);
    setTextEdited(false);
    setPreviewMode(false);
  }, []);

  /* animate slot filling on 'design' step */
  useEffect(() => {
    if (step === 'design') {
      const timers = DEMO_SLOTS.map((_, i) =>
        setTimeout(() => setFilledSlots((prev) => [...prev, i]), 400 + i * 500)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [step]);

  /* show text on 'text' step */
  useEffect(() => {
    if (step === 'text') {
      setFilledSlots([0, 1, 2, 3]); // all filled
      const t1 = setTimeout(() => setShowText(true), 300);
      const t2 = setTimeout(() => setTextEdited(true), 1200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [step]);

  /* preview mode */
  useEffect(() => {
    if (step === 'preview') {
      setFilledSlots([0, 1, 2, 3]);
      setShowText(true);
      setTextEdited(true);
      const t = setTimeout(() => setPreviewMode(true), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  const getSlotStyle = (slot: typeof DEMO_SLOTS[0], index: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      left: `${slot.x}%`,
      top: `${slot.y}%`,
      width: `${slot.w}%`,
      height: `${slot.h}%`,
      borderRadius: slot.shape === 'rounded' ? '6px' : '0',
      overflow: 'hidden',
      backgroundColor: '#E8E8E8',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    };

    if (filledSlots.includes(index)) {
      const photo = DEMO_PHOTOS[index % DEMO_PHOTOS.length];
      base.background = photo.gradient;
      base.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    } else {
      base.border = '2px dashed #C4C4C4';
      base.backgroundColor = 'rgba(255,255,255,0.5)';
    }

    return base;
  };

  return (
    <div
      className="relative w-full aspect-[4/5] bg-[#FFFBF7] rounded-lg shadow-inner overflow-hidden"
      style={{
        background: previewMode
          ? 'linear-gradient(180deg, #FFF8F0 0%, #FFFBF7 100%)'
          : '#FFFBF7',
        transition: 'background 0.6s ease',
      }}
    >
      {/* Canvas background pattern */}
      {!previewMode && (
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #2D2D2D 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      )}

      {/* Slot photos */}
      {DEMO_SLOTS.map((slot, i) => (
        <div key={slot.id} style={getSlotStyle(slot, i)}>
          {filledSlots.includes(i) && (
            <motion.div
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              {/* Photo content with label */}
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white/60 text-[0.6rem] font-medium">
                  {DEMO_PHOTOS[i].label}
                </span>
              </div>
              {/* Checkmark when filled */}
              {step === 'design' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: filledSlots.includes(i) ? 1 : 0 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center"
                >
                  <Check size={10} className="text-[#9BCFB8]" />
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Empty slot placeholder */}
          {!filledSlots.includes(i) && step === 'design' && (
            <div className="w-full h-full flex items-center justify-center">
              <MousePointerClick size={14} className="text-[#C4C4C4] animate-pulse" />
            </div>
          )}
        </div>
      ))}

      {/* Text element */}
      <AnimatePresence>
        {showText && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              ...(textEdited && {
                boxShadow: '0 0 0 2px #8FBFE0',
              }),
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-10 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded"
            style={{
              left: '8%',
              top: '68%',
              minWidth: '120px',
            }}
          >
            <p
              className="font-display text-[0.75rem] font-semibold text-[#2D2D2D]"
              style={{
                fontFamily: '"Playfair Display", serif',
              }}
            >
              {textEdited ? 'Our Wedding Day' : 'Double-click to edit...'}
            </p>
            {textEdited && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute right-0 top-0 w-[1px] h-full bg-[#8FBFE0]"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview overlay */}
      <AnimatePresence>
        {previewMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-xl shadow-lg px-6 py-3 flex items-center gap-2"
            >
              <Sparkles size={16} className="text-[#F4C2A1]" />
              <span className="font-body text-sm font-semibold text-[#2D2D2D]">
                Your album looks great!
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar mock (design step only) */}
      {!previewMode && step !== 'upload' && step !== 'template' && (
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="absolute right-0 top-0 bottom-0 w-8 bg-white/80 border-l border-[#E8E8E8] flex flex-col items-center py-2 gap-1.5 z-10"
        >
          <div className="w-5 h-5 rounded bg-[#F4C2A1]/20" />
          <div className="w-5 h-5 rounded bg-[#B8A9D9]/20" />
          <div className="w-5 h-5 rounded bg-[#9BCFB8]/20" />
          <div className="w-5 h-5 rounded bg-[#8FBFE0]/20" />
        </motion.div>
      )}

      {/* Upload cloud animation (upload step) */}
      {step === 'upload' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-12 h-12 rounded-full bg-[#F4C2A1]/20 flex items-center justify-center mb-2"
          >
            <Upload size={20} className="text-[#F4C2A1]" />
          </motion.div>
          <span className="font-body text-[0.65rem] text-[#6B6B6B]">Drop photos here</span>
        </div>
      )}

      {/* Template cards (template step) */}
      {step === 'template' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-10 p-3">
          {[
            { name: 'Wedding', color: '#F4C2A1' },
            { name: 'Minimalist', color: '#9BCFB8' },
            { name: 'Birthday', color: '#8FBFE0' },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full bg-white rounded-md shadow-sm px-3 py-2 flex items-center gap-2"
              style={{
                boxShadow: i === 0 ? `0 0 0 2px ${t.color}` : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: t.color }}
              />
              <span className="font-body text-[0.65rem] font-medium text-[#2D2D2D]">
                {t.name}
              </span>
              {i === 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.8, type: 'spring' }}
                  className="ml-auto"
                >
                  <Check size={10} className="text-[#9BCFB8]" />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN SECTION COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function BuilderDemoSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isInView, setIsInView] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* GSAP scroll trigger */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.demo-heading', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: gentle,
      });
      gsap.from('.demo-content', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 75%', once: true },
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: gentle,
        delay: 0.2,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  /* detect in-view to start auto-play */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        } else {
          setIsInView(false);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* auto-cycle steps */
  useEffect(() => {
    if (!isInView) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 2800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isInView]);

  const handleStepClick = useCallback((index: number) => {
    setActiveStep(index);
    // reset the interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 2800);
  }, []);

  const currentStep = STEPS[activeStep];

  return (
    <section ref={sectionRef} className="bg-[#FFFBF7] py-20 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        {/* Heading */}
        <div className="demo-heading text-center mb-12">
          <h2 className="font-display text-[2rem] sm:text-[3rem] font-bold text-[#2D2D2D] leading-[1.15]">
            See the Editor in Action
          </h2>
          <p className="font-body text-[1rem] font-normal text-[#6B6B6B] mt-3 max-w-[520px] mx-auto">
            Watch how easy it is to create a stunning album in minutes — no design skills needed
          </p>
        </div>

        {/* Demo content */}
        <div className="demo-content flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          {/* Left: step indicators */}
          <div className="flex lg:flex-col gap-3 lg:gap-4 order-2 lg:order-1">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;
              const isPast = index < activeStep;

              return (
                <button
                  key={step.key}
                  onClick={() => handleStepClick(index)}
                  className="flex items-center gap-3 group text-left transition-all duration-300"
                >
                  {/* Icon circle */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      backgroundColor: isActive
                        ? step.color
                        : isPast
                        ? `${step.color}30`
                        : '#F0F0F0',
                      transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    <Icon
                      size={18}
                      style={{
                        color: isActive ? '#fff' : isPast ? step.color : '#9B9B9B',
                      }}
                    />
                  </div>

                  {/* Label - hidden on mobile, visible on lg */}
                  <div className="hidden lg:block">
                    <span
                      className="font-body text-sm font-medium transition-colors duration-300 block"
                      style={{
                        color: isActive ? step.color : isPast ? '#2D2D2D' : '#9B9B9B',
                      }}
                    >
                      {step.label}
                    </span>
                    {/* Progress bar */}
                    <div className="w-20 h-1 rounded-full bg-[#F0F0F0] mt-1 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: step.color }}
                        initial={{ width: '0%' }}
                        animate={{
                          width: isActive ? '100%' : isPast ? '100%' : '0%',
                        }}
                        transition={{
                          duration: isActive ? 2.8 : 0.3,
                          ease: 'linear',
                        }}
                      />
                    </div>
                  </div>

                  {/* Connector line (vertical on lg) */}
                  {index < STEPS.length - 1 && (
                    <div
                      className="hidden lg:block absolute left-5 top-10 w-[2px] h-4 bg-[#F0F0F0]"
                      style={{
                        position: 'relative',
                        marginLeft: '-1px',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Center: animated canvas mockup */}
          <div className="flex-1 max-w-[360px] w-full order-1 lg:order-2">
            {/* Browser chrome */}
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-[#E8E8E8]">
              {/* Window header */}
              <div className="h-8 bg-[#F5F5F5] border-b border-[#E8E8E8] flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E8A598]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#F4C2A1]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#9BCFB8]" />
                <span className="font-body text-[0.6rem] text-[#9B9B9B] ml-2">
                  Megy Prints Builder
                </span>
              </div>

              {/* Toolbar */}
              <div className="h-7 bg-white border-b border-[#E8E8E8] flex items-center px-2 gap-1">
                {['File', 'Edit', 'View', 'Insert'].map((item) => (
                  <span
                    key={item}
                    className="font-body text-[0.55rem] text-[#6B6B6B] px-1.5 py-0.5 rounded hover:bg-[#F0F0F0] transition-colors"
                  >
                    {item}
                  </span>
                ))}
              </div>

              {/* Canvas area */}
              <div className="p-2">
                <DemoCanvas step={currentStep.key} />
              </div>
            </div>

            {/* Step label below canvas (mobile only) */}
            <div className="mt-4 text-center lg:hidden">
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentStep.key}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="font-body text-sm font-medium"
                  style={{ color: currentStep.color }}
                >
                  {currentStep.label}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Right: description */}
          <div className="flex-1 max-w-[320px] order-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.key}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${currentStep.color}15` }}
                >
                  <currentStep.icon size={20} style={{ color: currentStep.color }} />
                </div>

                <h3 className="font-display text-xl font-semibold text-[#2D2D2D] mb-2">
                  {STEP_DETAILS[currentStep.key].title}
                </h3>

                <p className="font-body text-sm text-[#6B6B6B] leading-[1.7] mb-4">
                  {STEP_DETAILS[currentStep.key].desc}
                </p>

                {/* Feature bullets */}
                <ul className="space-y-2">
                  {STEP_DETAILS[currentStep.key].features.map((feature, i) => (
                    <motion.li
                      key={feature}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                      className="flex items-center gap-2"
                    >
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${currentStep.color}20` }}
                      >
                        <Check size={10} style={{ color: currentStep.color }} />
                      </div>
                      <span className="font-body text-xs text-[#4A4A4A]">{feature}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── step detail copy ─── */
const STEP_DETAILS: Record<
  StepKey,
  { title: string; desc: string; features: string[] }
> = {
  upload: {
    title: 'Upload Your Photos',
    desc: 'Drag and drop 20 to 100 of your favorite photos. We support JPG and PNG formats with instant preview.',
    features: [
      'Bulk upload with drag & drop',
      'Auto thumbnail generation',
      'Organize before you build',
    ],
  },
  template: {
    title: 'Choose a Template',
    desc: 'Browse 10 curated themes and 123+ page layouts. From weddings to birthdays, find your perfect style.',
    features: [
      '10 themes, 123+ layouts',
      'Live preview of each style',
      'One-click theme application',
    ],
  },
  design: {
    title: 'Design Your Pages',
    desc: 'Photos automatically fill template slots. Drag, resize, rotate, and arrange until it\'s perfect.',
    features: [
      'Smart auto-fill slots',
      'Drag, resize & rotate',
      'Shape clipping (circle, rounded)',
    ],
  },
  text: {
    title: 'Add Personal Text',
    desc: 'Double-click anywhere to add text. Choose from 30+ fonts, customize colors, alignment, and styling.',
    features: [
      '30+ Google Fonts',
      'Double-click inline editing',
      'Full styling control',
    ],
  },
  preview: {
    title: 'Preview & Order',
    desc: 'See exactly how your album will look. Export pages, choose materials, and place your order.',
    features: [
      'Pixel-perfect preview',
      'Export pages as PNG',
      'Live price calculator',
    ],
  },
};
