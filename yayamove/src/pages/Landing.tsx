import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Star,
  Search,
  MessageSquare,
  CalendarCheck,
  ArrowRight,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/categories";
import { SAMPLE_PROVIDERS } from "@/lib/sampleData";
import { ProviderCard } from "@/components/ProviderCard";
import { Logo } from "@/components/Logo";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div>
      {/* ───────────────── HERO ───────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-brand-mesh" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/40 to-transparent" />

        <div className="container grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
          <div>
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft backdrop-blur"
            >
              <ShieldCheck className="size-3.5" /> NBI-verified pros · Metro Manila
            </motion.div>

            <motion.h1
              custom={1}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-5 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl"
            >
              Trusted local help,{" "}
              <span className="brand-gradient-text">a few taps away.</span>
            </motion.h1>

            <motion.p
              custom={2}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-5 max-w-md text-lg text-muted-foreground"
            >
              Find verified maids, carpenters, plumbers, computer technicians, and
              aircon pros near you. Browse profiles or post a job and get quotes.
            </motion.p>

            {/* search bar */}
            <motion.div
              custom={3}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-7 flex flex-col gap-3 sm:flex-row"
            >
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-white/80 px-4 shadow-soft backdrop-blur">
                <Search className="size-5 text-muted-foreground" />
                <input
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="What do you need done?"
                  onKeyDown={(e) => e.key === "Enter" && navigate("/browse")}
                />
              </div>
              <Button size="lg" variant="gradient" onClick={() => navigate("/browse")}>
                Find a pro <ArrowRight />
              </Button>
            </motion.div>

            <motion.div
              custom={4}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Star className="size-4 fill-amber-400 text-amber-400" /> 4.8 avg rating
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-brand-600" /> Verified clearances
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-brand-600" /> Near you
              </span>
            </motion.div>
          </div>

          {/* hero visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto hidden max-w-sm md:block"
          >
            <div className="absolute -inset-6 -z-10 animate-float rounded-[3rem] bg-gradient-to-br from-brand-400/30 to-accent/30 blur-2xl" />
            <div className="glass rounded-[2rem] p-6">
              <div className="flex items-center justify-between">
                <Logo />
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  Online now
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {SAMPLE_PROVIDERS.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-white/80 p-3"
                  >
                    <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                      {p.name.split(" ").map((w) => w[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.city} · ⭐ {p.rating_avg}
                      </p>
                    </div>
                    {p.verified && <ShieldCheck className="size-5 text-brand-600" />}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ───────────────── CATEGORIES ───────────────── */}
      <section className="container py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">What do you need help with?</h2>
            <p className="mt-1 text-muted-foreground">Pick a service to see verified pros near you.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.slug}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-50px" }}
                custom={i}
                variants={fadeUp}
              >
                <Link
                  to={`/browse?category=${c.slug}`}
                  className="group ring-focus block h-full rounded-2xl"
                >
                  <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-glow">
                    <div
                      className={`flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.gradient} text-white shadow-soft transition-transform group-hover:scale-110`}
                    >
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <h3 className="font-bold leading-tight">{c.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{c.tagline}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ───────────────── HOW IT WORKS ───────────────── */}
      <section className="border-y border-border bg-gradient-to-b from-brand-50/50 to-white py-16">
        <div className="container">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">How Yayamove works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
            Two easy ways to get the job done — your choice.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Browse or post",
                body: "Search verified pros by service and area, or post a job and let pros come to you.",
              },
              {
                icon: MessageSquare,
                title: "Chat & compare quotes",
                body: "Message directly, compare ratings and prices, and pick the right person for you.",
              },
              {
                icon: CalendarCheck,
                title: "Book & rate",
                body: "Agree on a time, get it done, then leave a review to help the next neighbor.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.title}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                custom={i}
                variants={fadeUp}
                className="relative rounded-2xl border border-border bg-white p-6 shadow-soft"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <s.icon className="size-6" />
                </div>
                <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-brand-100">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── FEATURED PROS ───────────────── */}
      <section className="container py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Top-rated near you</h2>
            <p className="mt-1 text-muted-foreground">Hand-picked, verified, and ready to help.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/browse")} className="hidden sm:inline-flex">
            View all <ArrowRight />
          </Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_PROVIDERS.slice(0, 6).map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </section>

      {/* ───────────────── TRUST STRIP ───────────────── */}
      <section className="container pb-16">
        <div className="overflow-hidden rounded-3xl bg-brand-900 p-8 text-white sm:p-12">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                <ShieldCheck className="size-3.5" /> Trust &amp; safety first
              </div>
              <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
                Every pro can be NBI-verified.
              </h2>
              <p className="mt-3 max-w-md text-brand-100/80">
                Providers upload their NBI clearance for review. Documents are stored
                privately and encrypted — never public — and verification is approved
                only by Yayamove. Your safety isn’t a checkbox a stranger can tick.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { n: "5", l: "Core services" },
                { n: "100%", l: "Private NBI docs" },
                { n: "4.8★", l: "Avg. rating" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl bg-white/10 p-5 text-center backdrop-blur">
                  <div className="font-display text-2xl font-extrabold sm:text-3xl">{s.n}</div>
                  <div className="mt-1 text-xs text-brand-100/80">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── PRO CTA ───────────────── */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-8 text-center shadow-soft sm:p-14">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-accent/20 blur-3xl" />
          <Sparkles className="mx-auto size-8 text-brand-600" />
          <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Are you a skilled pro?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Build a verified profile, showcase your skills and experience, and get
            booked by households near you — no Facebook group hustle required.
          </p>
          <Button
            size="lg"
            variant="gradient"
            className="mt-6"
            onClick={() => navigate("/become-a-pro")}
          >
            Become a Yayamove pro <ArrowRight />
          </Button>
        </div>
      </section>
    </div>
  );
}
