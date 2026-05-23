import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Upload,
  LayoutGrid,
  Sparkles,
  Truck,
  ChevronDown,
  Quote,
  Star,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

/* ───────────────────────── easing token ───────────────────────── */
const gentle = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* ═══════════════════════════ SECTION 1: HERO ═══════════════════════════ */
function HeroSection() {
  const bgRef = useRef<HTMLDivElement>(null);

  return (
    <section className="relative min-h-[100dvh] min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Background Image with Ken Burns */}
      <div
        ref={bgRef}
        className="absolute inset-0 w-full h-full animate-ken-burns"
      >
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
            'linear-gradient(180deg, rgba(45,45,45,0.7) 0%, rgba(45,45,45,0.3) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-[720px] mx-auto px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="font-display text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem] font-bold text-white leading-[1.05] tracking-[-0.01em]"
          style={{ textShadow: '0 2px 20px rgba(0,0,0,0.2)' }}
        >
          Turn Your Photos Into Timeless Albums
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="font-body text-[1rem] sm:text-[1.125rem] font-normal text-white/90 leading-[1.7] mt-5 max-w-[560px] mx-auto"
        >
          Upload your memories, choose a beautiful template, and let us create a
          stunning album you'll treasure forever.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="mt-9"
        >
          <Link
            to="/builder"
            className="inline-flex items-center font-body text-[0.875rem] font-semibold bg-[#F4C2A1] text-white px-9 py-4 rounded-xl shadow-button hover:shadow-button-hover hover:scale-[1.03] transition-all duration-200"
          >
            Start Creating Your Album
          </Link>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
      >
        <span className="font-body text-[0.75rem] font-medium uppercase tracking-wider text-white/60">
          Scroll to explore
        </span>
        <ChevronDown className="w-5 h-5 text-white/60 animate-bounce-gentle" />
      </motion.div>
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

  const items = [
    {
      icon: <Upload size={28} className="text-[#F4C2A1]" />,
      label: 'Easy Photo Upload',
      desc: 'Upload 20\u2013100 photos in seconds',
    },
    {
      icon: <LayoutGrid size={28} className="text-[#B8A9D9]" />,
      label: 'Beautiful Templates',
      desc: '6 handcrafted themes to choose from',
    },
    {
      icon: <Sparkles size={28} className="text-[#9BCFB8]" />,
      label: 'Auto-Generated Layouts',
      desc: 'Your album designed in one click',
    },
    {
      icon: <Truck size={28} className="text-[#8FBFE0]" />,
      label: 'Professional Printing',
      desc: 'Premium materials & fast delivery',
    },
  ];

  return (
    <section
      ref={sectionRef}
      className="bg-[#FFFBF7] py-8 border-b border-[rgba(45,45,45,0.06)]"
    >
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {items.map((item) => (
            <div
              key={item.label}
              className="trust-item flex flex-col items-center text-center gap-2"
            >
              {item.icon}
              <span className="font-body text-[0.875rem] font-semibold text-[#2D2D2D]">
                {item.label}
              </span>
              <span className="font-body text-[0.75rem] font-normal text-[#6B6B6B]">
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

  const steps = [
    {
      num: '01',
      numColor: 'text-[#F4C2A1]',
      img: '/step-upload.jpg',
      title: 'Upload Your Photos',
      desc: 'Upload 20 to 100 of your favorite JPG or PNG photos. Preview and organize them before building.',
    },
    {
      num: '02',
      numColor: 'text-[#B8A9D9]',
      img: '/step-template.jpg',
      title: 'Pick a Template',
      desc: "Browse our collection of beautiful themes \u2014 from elegant to playful \u2014 and pick the perfect style.",
    },
    {
      num: '03',
      numColor: 'text-[#9BCFB8]',
      img: '/step-edit.jpg',
      title: 'Generate & Customize',
      desc: "Click 'Generate Album' and watch your photos arranged beautifully. Then customize layouts, text, and more.",
    },
    {
      num: '04',
      numColor: 'text-[#8FBFE0]',
      img: '/step-order.jpg',
      title: 'Order & Receive',
      desc: 'Choose your material and size, review your live price estimate, and submit your order. We\'ll handle the rest!',
    },
  ];

  return (
    <section ref={sectionRef} className="bg-[#FFF8F0] py-20">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="hiw-heading text-center mb-12">
          <h2 className="font-display text-[2rem] sm:text-[3rem] font-bold text-[#2D2D2D] leading-[1.15]">
            How It Works
          </h2>
          <p className="font-body text-[1rem] font-normal text-[#6B6B6B] mt-3">
            Create your perfect album in four simple steps
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div
              key={step.num}
              className="hiw-card group bg-[#FFFBF7] rounded-2xl shadow-card p-6 text-center hover:-translate-y-1 hover:shadow-card-hover transition-all duration-300"
            >
              <span
                className={`font-display text-[3rem] font-bold ${step.numColor} opacity-30 block mb-2 leading-none`}
              >
                {step.num}
              </span>
              <img
                src={step.img}
                alt={step.title}
                className="w-full aspect-[4/3] object-cover rounded-2xl mb-4"
              />
              <h4 className="font-display text-[1.25rem] font-semibold text-[#2D2D2D] leading-[1.3] mb-2">
                {step.title}
              </h4>
              <p className="font-body text-[0.875rem] font-normal text-[#6B6B6B] leading-[1.6]">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 4: TEMPLATE PREVIEW ═══════════════════════════ */
function TemplatePreviewSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.tp-heading', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: gentle,
      });
      gsap.from('.tp-card', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 75%', once: true },
        opacity: 0,
        y: 30,
        stagger: 0.1,
        duration: 0.6,
        ease: gentle,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const templates = [
    {
      img: './album-graduation.jpg',
      badge: 'Graduation',
      badgeColor: 'bg-[#F4C2A1]',
      title: 'Graduation',
      desc: 'Elegant layouts with school colors and formal typography',
      borderColor: 'hover:ring-[#F4C2A1]',
    },
    {
      img: './album-elegant.jpg',
      badge: 'Elegant',
      badgeColor: 'bg-[#B8A9D9]',
      title: 'Elegant',
      desc: 'Romantic full-bleed layouts for weddings and special moments',
      borderColor: 'hover:ring-[#B8A9D9]',
    },
    {
      img: './album-minimalist.jpg',
      badge: 'Minimalist',
      badgeColor: 'bg-[#9BCFB8]',
      title: 'Minimalist',
      desc: 'Clean, spacious designs that let your photos speak for themselves',
      borderColor: 'hover:ring-[#9BCFB8]',
    },
    {
      img: './album-kids.jpg',
      badge: 'Kids Theme',
      badgeColor: 'bg-[#8FBFE0]',
      title: 'Kids Theme',
      desc: 'Playful, colorful layouts full of joy and fun elements',
      borderColor: 'hover:ring-[#8FBFE0]',
    },
    {
      img: './album-modern.jpg',
      badge: 'Modern',
      badgeColor: 'bg-[#F4C2A1]',
      title: 'Modern',
      desc: 'Bold editorial layouts with magazine-style sophistication',
      borderColor: 'hover:ring-[#F4C2A1]',
    },
    {
      img: './album-family.jpg',
      badge: 'Family Album',
      badgeColor: 'bg-[#D4B896]',
      title: 'Family Album',
      desc: 'Warm, inviting layouts perfect for treasured family memories',
      borderColor: 'hover:ring-[#D4B896]',
    },
  ];

  return (
    <section ref={sectionRef} className="bg-[#FDE8E4] py-20">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="tp-heading text-center mb-12">
          <h2 className="font-display text-[2rem] sm:text-[3rem] font-bold text-[#2D2D2D] leading-[1.15]">
            Beautiful Templates for Every Occasion
          </h2>
          <p className="font-body text-[1rem] font-normal text-[#6B6B6B] mt-3">
            Each template is carefully designed to make your photos shine
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <div
              key={t.title}
              className={`tp-card group relative overflow-hidden rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-300 ring-0 ring-offset-0 ${t.borderColor} hover:ring-2`}
            >
              {/* Image */}
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={t.img}
                  alt={t.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                {/* Badge */}
                <span
                  className={`absolute top-3 left-3 ${t.badgeColor} text-white font-body text-[0.75rem] font-semibold px-3 py-1 rounded-lg`}
                >
                  {t.badge}
                </span>

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(253,232,228,0.95)] via-[rgba(253,232,228,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                  <h4 className="font-display text-[1.25rem] font-semibold text-white leading-[1.3] mb-1"
                    style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>
                    {t.title}
                  </h4>
                  <p className="font-body text-sm text-white/90 leading-[1.5] mb-4"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                    {t.desc}
                  </p>
                  <Link
                    to="/builder"
                    className="inline-flex items-center justify-center font-body text-[0.875rem] font-semibold bg-white/20 backdrop-blur-sm text-white px-5 py-2.5 rounded-full border border-white/40 hover:bg-white/30 transition-colors duration-200 w-fit"
                  >
                    Use This Template
                  </Link>
                </div>
              </div>

              {/* Title below image (visible when not hovered) */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[rgba(253,232,228,0.95)] to-transparent group-hover:opacity-0 transition-opacity duration-300">
                <h4 className="font-display text-[1.15rem] font-semibold text-[#2D2D2D]">
                  {t.title}
                </h4>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/templates"
            className="inline-flex items-center font-body text-[0.875rem] font-semibold text-[#F4C2A1] border-[1.5px] border-[#F4C2A1] px-8 py-3.5 rounded-xl hover:bg-[#F4C2A1] hover:text-white transition-all duration-250"
          >
            View All Templates &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 5: TESTIMONIALS ═══════════════════════════ */
function TestimonialsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.tst-heading', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: gentle,
      });
      gsap.from('.tst-card', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', once: true },
        opacity: 0,
        y: 30,
        stagger: 0.12,
        duration: 0.6,
        ease: gentle,
      });
      gsap.from('.tst-avatar', {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', once: true },
        scale: 0.8,
        opacity: 0,
        stagger: 0.12,
        duration: 0.5,
        ease: gentle,
        delay: 0.2,
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const testimonials = [
    {
      img: '/testimonial-1.jpg',
      borderColor: 'border-[#F4C2A1]',
      quote:
        'Megy Prints made creating my wedding album so easy! The templates are gorgeous and the print quality is amazing. I couldn\'t be happier.',
      name: 'Sarah M.',
      detail: 'Wedding Album \u2014 Elegant Template',
    },
    {
      img: '/testimonial-2.jpg',
      borderColor: 'border-[#9BCFB8]',
      quote:
        'I needed graduation albums for my entire class. The auto-generate feature saved me hours, and my students loved the results!',
      name: 'Mr. Dela Cruz',
      detail: 'Graduation Albums \u2014 Graduation Template',
    },
    {
      img: '/testimonial-3.jpg',
      borderColor: 'border-[#B8A9D9]',
      quote:
        'The kids theme is absolutely adorable! I made albums for both my children\'s birthdays and they turned out perfect.',
      name: 'Jenny L.',
      detail: 'Birthday Albums \u2014 Kids Theme',
    },
  ];

  return (
    <section ref={sectionRef} className="bg-[#FFF8F0] py-20">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        <h2 className="tst-heading font-display text-[2rem] sm:text-[3rem] font-bold text-[#2D2D2D] leading-[1.15] text-center mb-12">
          What Our Customers Say
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="tst-card relative bg-[#FFFBF7] rounded-2xl shadow-card p-8"
            >
              {/* Quote icon */}
              <Quote className="w-6 h-6 text-[#F4C2A1] opacity-30 mb-3" />

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: 0.3 + i * 0.08,
                      duration: 0.3,
                      ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
                    }}
                  >
                    <Star className="w-4 h-4 text-[#F4C2A1] fill-[#F4C2A1]" />
                  </motion.div>
                ))}
              </div>

              <p className="font-body text-[1rem] font-normal italic text-[#4A4A4A] leading-[1.7] mb-5">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <img
                  src={t.img}
                  alt={t.name}
                  className={`tst-avatar w-14 h-14 rounded-full object-cover border-2 ${t.borderColor}`}
                />
                <div>
                  <h5 className="font-body text-[0.875rem] font-semibold text-[#2D2D2D]">
                    {t.name}
                  </h5>
                  <span className="font-body text-[0.75rem] font-medium text-[#9B9B9B]">
                    {t.detail}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ SECTION 6: CTA ═══════════════════════════ */
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
        background: 'linear-gradient(135deg, #F4C2A1 0%, #E8A598 50%, #B8A9D9 100%)',
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

        <p className="font-body text-[1.125rem] font-normal text-white/90 leading-[1.7] mt-4">
          Start building your perfect album today. No account required &mdash; just
          upload your photos and go!
        </p>

        <div className="mt-8">
          <Link
            to="/builder"
            className="inline-flex items-center font-body text-[0.875rem] font-semibold bg-white text-[#2D2D2D] px-10 py-4 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)] hover:scale-[1.03] transition-all duration-200"
          >
            Get Started &mdash; It&apos;s Free!
          </Link>
        </div>

        <div className="mt-4">
          <Link
            to="/templates"
            className="inline-flex items-center font-body text-[0.875rem] font-medium text-white/80 hover:text-white hover:underline transition-all duration-200"
          >
            Or browse templates first &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ HOME PAGE ═══════════════════════════ */
export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustBarSection />
      <HowItWorksSection />
      <TemplatePreviewSection />
      <TestimonialsSection />
      <CTASection />
    </>
  );
}
