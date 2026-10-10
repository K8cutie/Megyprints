import { useRef, useEffect, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Images,
  QrCode,
  Sparkles,
  Truck,
  ChevronDown,
  CalendarHeart,
} from 'lucide-react';
import BuilderDemoSection from './BuilderDemoSection';
import { UserProjectsSection } from '../components/UserProjectsSection';
import { useAuth } from '../lib/authContext';
import { startFreshAlbum } from '../lib/albumSession';
import { readLocalDraftSummary, albumInProgress, type LocalDraftSummary } from '../lib/localDraft';
import StartNewAlbumPrompt from '../components/StartNewAlbumPrompt';
import MegyMascot from '../components/MegyMascot';
import { HOME_FEATURES, HOW_IT_WORKS, EVENTS_CARD, type HomeFeatureKey } from './homeCopy';

gsap.registerPlugin(ScrollTrigger);

/* ───────────────────────── easing token ───────────────────────── */
const gentle = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* ═══════════════════════════ SECTION 1: HERO ═══════════════════════════
   Megy is the centerpiece — the primary entry point for all users.
   ═══════════════════════════════════════════════════════════════════════ */
function HeroSection({ megyComponent, eventsCard }: { megyComponent: React.ReactNode; eventsCard: React.ReactNode }) {
  return (
    <section className="relative min-h-[100dvh] min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Background Image with Ken Burns */}
      <div className="absolute inset-0 w-full h-full animate-ken-burns">
        <img
          src="/hero-albums.jpg"
          alt="Beautiful photo albums"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(45,45,45,0.6) 0%, rgba(45,45,45,0.4) 50%, rgba(45,45,45,0.7) 100%)',
        }}
      />

      {/* Content — Megy centered as the primary interface */}
      {/* pt-24: two cards can be taller than a phone screen, and the top one
          must not slide under the fixed header. */}
      <div className="relative z-10 w-full max-w-[560px] mx-auto px-6 pt-24 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          {/* Megy Welcome Card — the star of the show */}
          {megyComponent}
          {/* Megyprints Events, for big events: a booking, not the builder. */}
          {eventsCard}
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="mt-8 flex flex-col items-center gap-2"
        >
          <span className="font-body text-[0.75rem] font-medium uppercase tracking-wider text-white/60">
            Scroll to explore
          </span>
          <ChevronDown className="w-5 h-5 text-white/60 animate-bounce-gentle" />
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 2: TRUST BAR ═══════════════════════════ */
function TrustBarSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.trust-item', {
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 85%',
          once: true,
        },
        opacity: 0,
        y: 20,
        scale: 0.9,
        stagger: 0.1,
        duration: 0.6,
        ease: gentle,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  // The words live in homeCopy.ts (homeCopy.spec.ts keeps them true).
  const icons: Record<HomeFeatureKey, React.ReactNode> = {
    printed: <Truck size={28} className="text-peach" />,
    layout: <Sparkles size={28} className="text-mint" />,
    memories: <QrCode size={28} className="text-soft-lavender" />,
    photos: <Images size={28} className="text-sky-blue" />,
  };
  const items = HOME_FEATURES.map((f) => ({ ...f, icon: icons[f.key] }));

  return (
    <section
      ref={sectionRef}
      className="bg-warm-white py-8 border-b border-[rgba(45,45,45,0.06)]"
    >
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {items.map((item) => (
            <div
              key={item.label}
              className="trust-item flex flex-col items-center text-center gap-2"
            >
              {item.icon}
              <span className="font-body text-[0.875rem] font-semibold text-dark">
                {item.label}
              </span>
              <span className="font-body text-[0.75rem] font-normal text-medium">
                {item.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 3: HOW IT WORKS ═══════════════════════════ */
function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hiw-heading', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: gentle,
      });
      gsap.from('.hiw-card', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', once: true },
        opacity: 0,
        y: 40,
        stagger: 0.12,
        duration: 0.6,
        ease: gentle,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  // The wizard's own path, in its order (homeCopy.ts). Seven short steps
  // read better as a numbered list than as picture cards, and the old
  // pictures showed themes and "syncing to cloud": neither is true now.
  // No CSS transition on .hiw-card: GSAP fades it in, and with the old
  // cards' `transition-all` it stayed at opacity 0 (the live page's four
  // cards never showed in Chromium at phone width; re-tested 2026-10-09).
  const last = HOW_IT_WORKS.length - 1;

  return (
    <section ref={sectionRef} className="bg-cream py-20">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="hiw-heading text-center mb-12">
          <h2 className="font-display text-[2rem] sm:text-[3rem] font-bold text-dark leading-[1.15]">
            How It Works
          </h2>
          <p className="font-body text-[1rem] font-normal text-medium mt-3">
            Megy walks you through all {HOW_IT_WORKS.length} steps.
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-[960px] mx-auto">
          {HOW_IT_WORKS.map((step, i) => (
            <li
              key={step.title}
              className={`hiw-card flex items-start gap-4 bg-warm-white rounded-2xl shadow-card p-5 sm:p-6${i === last ? ' md:col-span-2' : ''}`}
            >
              <span className="font-display text-[2.25rem] font-bold text-peach opacity-30 leading-none w-12 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[1.25rem] font-semibold text-dark leading-[1.3] mb-1">
                  {step.title}
                </h3>
                <p className="font-body text-[0.875rem] font-normal text-medium leading-[1.6]">
                  {step.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 4: CTA ═══════════════════════════ */
function CTASection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.cta-content > *', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
        opacity: 0,
        y: 20,
        stagger: 0.15,
        duration: 0.6,
        ease: gentle,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #C87658 0%, #B85C38 50%, #9A4A2C 100%)',
      }}
    >
      {/* Decorative blob shapes */}
      <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl animate-float" />
      <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 right-1/4 w-24 h-24 rounded-full bg-white/5 blur-xl animate-float" style={{ animationDelay: '4s' }} />

      <div className="relative max-w-[600px] mx-auto px-6 text-center cta-content">
        <h2
          className="font-display text-[2rem] sm:text-[3rem] font-bold text-white leading-[1.15]"
          style={{ textShadow: '0 1px 10px rgba(0,0,0,0.1)' }}
        >
          Ready to Create Your Album?
        </h2>

        {/* "No account required" wasn't true: checkout needs a sign-in. */}
        <p className="font-body text-[1.125rem] font-normal text-white/90 leading-[1.7] mt-4">
          Start your album now. You only need an account when you order.
        </p>

        <div className="mt-8">
          <Link
            to="/builder"
            className="inline-flex items-center font-body text-[0.875rem] font-semibold bg-white text-dark px-10 py-4 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)] hover:scale-[1.03] transition-all duration-200"
          >
            Get Started &mdash; It&apos;s Free!
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ HOME PAGE ═══════════════════════════ */
export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // "Start Creating" with an album in progress asks first (StartNewAlbumPrompt).
  const [inProgress, setInProgress] = useState<LocalDraftSummary | null>(null);
  const startNew = useCallback(() => {
    setInProgress(null);
    // A new album — which also answers "resume where you left off?".
    startFreshAlbum(user?.id);
    navigate('/builder');
  }, [navigate, user?.id]);

  const handleMegyAction = useCallback((action: string, payload?: any) => {
    switch (action) {
      case 'go-builder': {
        const draft = readLocalDraftSummary();
        if (albumInProgress(draft)) setInProgress(draft);
        else startNew();
        break;
      }
      case 'load-album':
        if (payload?.albumId) {
          navigate(`/builder?album=${payload.albumId}`);
        }
        break;
      case 'dismiss':
        // Megy handles its own dismiss state internally
        break;
      default:
        break;
    }
  }, [navigate, startNew]);

  // Hero welcome card — sends visitors into the builder, where the one true
  // Megy (assistant/MegyAssistant) guides them. No separate home wizard.
  const megyComponent = (
    <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
      <MegyMascot size={96} className="mx-auto object-contain drop-shadow-lg mb-4" />
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-2">
        Hi, I&apos;m Megy 👋
      </h1>
      <p className="font-body text-medium leading-relaxed mb-6">
        {/* Says PRINTED and SHIPPED up front: "build a print-ready album" read
            as an online album to a real visitor. Megy Prints is a physical
            album creator — digital printing on premium paper (owner,
            2026-10-08). */}
        Your personal album designer. Upload your photos and I&apos;ll design
        the pages. Then we print your physical album with digital printing on
        premium paper and ship it to your door. No design skills needed.
      </p>
      <button
        onClick={() => handleMegyAction('go-builder')}
        className="w-full inline-flex items-center justify-center gap-2 bg-peach hover:bg-blush-pink text-white font-semibold px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all text-base"
      >
        <Sparkles size={18} /> Start Creating
      </button>
    </div>
  );

  // Megyprints Events: outlined, so Start Creating stays the one filled button.
  const eventsCard = (
    <div className="mt-4 bg-white/95 rounded-3xl shadow-2xl p-6 text-left" data-testid="home-events-card">
      <p className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-peach text-white">New</span>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#9A4A2C]">{EVENTS_CARD.label}</span>
      </p>
      <h2 className="mt-2 font-display text-xl sm:text-2xl font-bold text-dark leading-snug">{EVENTS_CARD.title}</h2>
      <p className="mt-2 font-body text-medium leading-relaxed">{EVENTS_CARD.body}</p>
      <p className="mt-1 text-sm text-medium">{EVENTS_CARD.who}</p>
      <Link to="/events" data-testid="home-events-book"
        className="mt-4 w-full inline-flex items-center justify-center gap-2 border-2 border-peach text-cocoa font-semibold px-6 py-3 rounded-2xl hover:bg-blush transition-colors">
        <CalendarHeart size={18} /> {EVENTS_CARD.cta} ›
      </Link>
    </div>
  );

  return (
    <>
      {/* Hero — Megy is the centerpiece */}
      <HeroSection megyComponent={megyComponent} eventsCard={eventsCard} />
      {inProgress && (
        <StartNewAlbumPrompt draft={inProgress} signedIn={!!user}
          onContinue={() => { setInProgress(null); navigate('/builder'); }}
          onStartNew={startNew}
          onClose={() => setInProgress(null)} />
      )}

      <TrustBarSection />

      {/* User projects — still visible below the fold as fallback. Signed in
          only: the section is empty for a guest, and its padding left a
          blank band under the strip. */}
      {user && (
        <div className="bg-warm-white py-16">
          <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
            <UserProjectsSection />
          </div>
        </div>
      )}

      <HowItWorksSection />
      <BuilderDemoSection />
      <CTASection />
    </>
  );
}
