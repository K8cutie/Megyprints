import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  User,
  Sparkles,
  Briefcase,
  Award,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
  Upload,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { cn } from "@/lib/utils";

interface Experience {
  id: string;
  title: string;
  employer: string;
  startYear: string;
  endYear: string;
  description: string;
}
interface Certificate {
  id: string;
  title: string;
  issuer: string;
  year: string;
  fileName: string;
}

const STEPS = [
  { key: "personal", label: "Personal", icon: User },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "certificates", label: "Certificates", icon: Award },
  { key: "nbi", label: "NBI Clearance", icon: ShieldCheck },
] as const;

const uid = () => Math.random().toString(36).slice(2, 9);

export default function ProviderOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // personal
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [rate, setRate] = useState("");
  const [years, setYears] = useState("");

  // skills
  const [category, setCategory] = useState<CategorySlug | "">("");
  const [skills, setSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");

  // experience
  const [experiences, setExperiences] = useState<Experience[]>([]);
  // certificates
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  // nbi
  const [nbiFile, setNbiFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);

  const selectedCat = CATEGORIES.find((c) => c.slug === category);

  const toggleSkill = (s: string) =>
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const addCustomSkill = () => {
    const s = customSkill.trim();
    if (s && !skills.includes(s)) setSkills((p) => [...p, s]);
    setCustomSkill("");
  };

  const canProceed = (): boolean => {
    switch (STEPS[step].key) {
      case "personal":
        return fullName.length > 1 && phone.length > 6 && city.length > 1 && headline.length > 4;
      case "skills":
        return category !== "" && skills.length > 0;
      case "experience":
        return true; // optional but encouraged
      case "certificates":
        return true; // optional
      case "nbi":
        return nbiFile !== null && consent;
      default:
        return false;
    }
  };

  const next = () => {
    if (!canProceed()) {
      toast.error("Please complete the required fields.");
      return;
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else submit();
  };

  const submit = async () => {
    // Live build: insert provider_profile + skills + experience + certificates,
    // then upload NBI image to the PRIVATE `nbi-clearances` bucket and create an
    // nbi_clearances row with status='pending'. Verification is approved
    // server-side only (RLS) — never self-set here.
    await new Promise((r) => setTimeout(r, 700));
    setDone(true);
    toast.success("Profile submitted for verification!");
  };

  if (done) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-12">
        <div className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-soft sm:p-10">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="size-9 text-emerald-500" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">You’re all set, {fullName.split(" ")[0]}! 🎉</h1>
          <p className="mt-2 text-muted-foreground">
            Your pro profile has been submitted. Our team will review your NBI clearance —
            you’ll get the <span className="font-semibold text-brand-700">NBI Verified</span> badge
            once approved. Documents you uploaded are stored privately and encrypted.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="gradient" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate("/browse")}>
              See other pros
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold">Become a Yayamove pro</h1>
        <p className="mt-1 text-muted-foreground">
          Build a verified profile that gets you booked. Takes ~5 minutes.
        </p>
      </header>

      {/* stepper */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const complete = i < step;
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full border-2 transition-all",
                    active && "border-brand-600 bg-brand-600 text-white shadow-glow",
                    complete && "border-emerald-500 bg-emerald-500 text-white",
                    !active && !complete && "border-border bg-white text-muted-foreground",
                  )}
                >
                  {complete ? <Check className="size-5" /> : <Icon className="size-5" />}
                </div>
                <span
                  className={cn(
                    "hidden text-[11px] font-semibold sm:block",
                    active ? "text-brand-700" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("mx-1 h-0.5 flex-1 rounded", complete ? "bg-emerald-500" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-brand-700">
          <StepIcon className="size-5" />
          <h2 className="text-lg font-bold">{STEPS[step].label}</h2>
        </div>

        {/* ───── STEP: PERSONAL ───── */}
        {STEPS[step].key === "personal" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">Full name *</Label>
              <Input id="fullName" className="mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan dela Cruz" />
            </div>
            <div>
              <Label htmlFor="phone">Mobile number *</Label>
              <Input id="phone" className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917 123 4567" />
            </div>
            <div>
              <Label htmlFor="city">City *</Label>
              <Input id="city" className="mt-1.5" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Quezon City" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="area">Service area</Label>
              <Input id="area" className="mt-1.5" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="QC, San Juan, Mandaluyong" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="headline">Headline *</Label>
              <Input id="headline" className="mt-1.5" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Reliable kasambahay • 8 yrs experience" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea id="bio" className="mt-1.5" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell households why they can trust you…" />
            </div>
            <div>
              <Label htmlFor="rate">Hourly rate (₱)</Label>
              <Input id="rate" type="number" min={0} className="mt-1.5" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="250" />
            </div>
            <div>
              <Label htmlFor="years">Years of experience</Label>
              <Input id="years" type="number" min={0} className="mt-1.5" value={years} onChange={(e) => setYears(e.target.value)} placeholder="5" />
            </div>
          </div>
        )}

        {/* ───── STEP: SKILLS ───── */}
        {STEPS[step].key === "skills" && (
          <div>
            <Label>Primary service *</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => {
                      setCategory(c.slug);
                      setSkills([]);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all",
                      active ? "border-brand-500 bg-brand-50 text-brand-700 shadow-soft" : "border-border hover:border-brand-300",
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-semibold leading-tight">{c.name}</span>
                  </button>
                );
              })}
            </div>

            {selectedCat && (
              <div className="mt-6">
                <Label>Your skills * <span className="font-normal text-muted-foreground">(tap to select)</span></Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCat.sampleSkills.map((s) => {
                    const active = skills.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSkill(s)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all",
                          active ? "border-brand-600 bg-brand-600 text-white" : "border-border hover:border-brand-300",
                        )}
                      >
                        {active && <Check className="mr-1 inline size-3.5" />}
                        {s}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-2">
                  <Input
                    value={customSkill}
                    onChange={(e) => setCustomSkill(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSkill())}
                    placeholder="Add another skill…"
                  />
                  <Button type="button" variant="outline" onClick={addCustomSkill}>
                    <Plus /> Add
                  </Button>
                </div>

                {skills.filter((s) => !selectedCat.sampleSkills.includes(s)).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {skills
                      .filter((s) => !selectedCat.sampleSkills.includes(s))
                      .map((s) => (
                        <Badge key={s} variant="solid" className="gap-1 py-1">
                          {s}
                          <button onClick={() => toggleSkill(s)} aria-label={`Remove ${s}`}>
                            <Trash2 className="size-3" />
                          </button>
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───── STEP: EXPERIENCE ───── */}
        {STEPS[step].key === "experience" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add past jobs or employers. This builds trust — optional but recommended.
            </p>
            {experiences.map((exp, idx) => (
              <div key={exp.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-brand-700">Experience #{idx + 1}</span>
                  <button
                    onClick={() => setExperiences((p) => p.filter((e) => e.id !== exp.id))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Role / title"
                    value={exp.title}
                    onChange={(e) => setExperiences((p) => p.map((x) => (x.id === exp.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="Employer / household"
                    value={exp.employer}
                    onChange={(e) => setExperiences((p) => p.map((x) => (x.id === exp.id ? { ...x, employer: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="Start year"
                    value={exp.startYear}
                    onChange={(e) => setExperiences((p) => p.map((x) => (x.id === exp.id ? { ...x, startYear: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="End year (or blank = present)"
                    value={exp.endYear}
                    onChange={(e) => setExperiences((p) => p.map((x) => (x.id === exp.id ? { ...x, endYear: e.target.value } : x)))}
                  />
                  <Textarea
                    className="sm:col-span-2"
                    placeholder="What did you do?"
                    value={exp.description}
                    onChange={(e) => setExperiences((p) => p.map((x) => (x.id === exp.id ? { ...x, description: e.target.value } : x)))}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                setExperiences((p) => [...p, { id: uid(), title: "", employer: "", startYear: "", endYear: "", description: "" }])
              }
            >
              <Plus /> Add work experience
            </Button>
          </div>
        )}

        {/* ───── STEP: CERTIFICATES ───── */}
        {STEPS[step].key === "certificates" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Have TESDA NC II or other certificates? Add them to stand out. Optional.
            </p>
            {certificates.map((c, idx) => (
              <div key={c.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-brand-700">Certificate #{idx + 1}</span>
                  <button
                    onClick={() => setCertificates((p) => p.filter((x) => x.id !== c.id))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Certificate title (e.g. TESDA NC II)"
                    value={c.title}
                    onChange={(e) => setCertificates((p) => p.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="Issuer (e.g. TESDA)"
                    value={c.issuer}
                    onChange={(e) => setCertificates((p) => p.map((x) => (x.id === c.id ? { ...x, issuer: e.target.value } : x)))}
                  />
                  <Input
                    placeholder="Year"
                    value={c.year}
                    onChange={(e) => setCertificates((p) => p.map((x) => (x.id === c.id ? { ...x, year: e.target.value } : x)))}
                  />
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-4 text-sm font-medium text-brand-700">
                    <Upload className="size-4" />
                    {c.fileName || "Upload file"}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) =>
                        setCertificates((p) =>
                          p.map((x) => (x.id === c.id ? { ...x, fileName: e.target.files?.[0]?.name ?? "" } : x)),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setCertificates((p) => [...p, { id: uid(), title: "", issuer: "", year: "", fileName: "" }])}
            >
              <Plus /> Add certificate
            </Button>
          </div>
        )}

        {/* ───── STEP: NBI ───── */}
        {STEPS[step].key === "nbi" && (
          <div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="flex items-center gap-2 font-bold text-brand-800">
                <Lock className="size-4" /> Your NBI clearance is private &amp; encrypted
              </p>
              <p className="mt-1.5 text-sm text-brand-900/70">
                It’s stored in a private, access-controlled bucket — never shown publicly.
                Only Yayamove’s verification team can view it. This is how seekers know
                you’re trustworthy, and it earns your{" "}
                <span className="font-semibold">NBI Verified</span> badge.
              </p>
            </div>

            <div className="mt-5">
              <Label>Upload NBI Clearance (photo or scan) *</Label>
              <label
                className={cn(
                  "mt-2 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                  nbiFile ? "border-emerald-400 bg-emerald-50" : "border-brand-300 bg-brand-50/40 hover:bg-brand-50",
                )}
              >
                {nbiFile ? (
                  <>
                    <FileText className="size-10 text-emerald-500" />
                    <div>
                      <p className="font-semibold text-emerald-700">{nbiFile.name}</p>
                      <p className="text-xs text-muted-foreground">Tap to replace</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="size-10 text-brand-500" />
                    <div>
                      <p className="font-semibold text-brand-700">Tap to upload your NBI clearance</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, or PDF · max 10MB</p>
                    </div>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setNbiFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                I consent to Yayamove securely storing and processing my NBI clearance for
                identity verification, in accordance with the{" "}
                <span className="font-semibold text-foreground">Data Privacy Act of 2012 (RA 10173)</span>.
                I can request deletion at any time.
              </span>
            </label>
          </div>
        )}

        {/* nav */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft /> Back
          </Button>
          <Button type="button" variant="gradient" onClick={next}>
            {step === STEPS.length - 1 ? (
              <>
                Submit for verification <ShieldCheck />
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
