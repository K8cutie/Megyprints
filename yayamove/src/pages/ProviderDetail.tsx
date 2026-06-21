import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Star,
  MapPin,
  Briefcase,
  Clock,
  MessageSquare,
  CalendarCheck,
  ShieldCheck,
  Award,
  ArrowLeft,
  X,
} from "lucide-react";
import { type ProviderListItem } from "@/lib/sampleData";
import { CATEGORY_BY_SLUG, type ServiceCategory } from "@/lib/categories";
import { useChat } from "@/hooks/useChat";
import { useProvider } from "@/hooks/useProviders";
import { createBooking } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ReviewsSection } from "@/components/ReviewsSection";
import { formatPHP, initials } from "@/lib/utils";

export default function ProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { provider, loading } = useProvider(id);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="container py-24 text-center">
        <p className="text-lg font-bold">Provider not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/browse")}>
          Back to browse
        </Button>
      </div>
    );
  }

  const cat = CATEGORY_BY_SLUG[provider.primary_category];
  const Icon = cat.icon;

  return (
    <ProviderDetailInner provider={provider} cat={cat} Icon={Icon} navigate={navigate} />
  );
}

function ProviderDetailInner({
  provider,
  cat,
  Icon,
  navigate,
}: {
  provider: ProviderListItem;
  cat: ServiceCategory;
  Icon: ServiceCategory["icon"];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { openWith } = useChat();
  const [booking, setBooking] = useState(false);

  const startChat = () => {
    const id = openWith({
      id: provider.id,
      name: provider.name,
      category: provider.primary_category,
      verified: provider.verified,
    });
    navigate(`/messages?c=${id}`);
  };

  return (
    <div>
      {/* cover */}
      <div className={`h-40 w-full bg-gradient-to-r ${cat.gradient}`} />
      <div className="container -mt-16 pb-16">
        <Link
          to="/browse"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white"
        >
          <ArrowLeft className="size-4" /> Back to browse
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* main */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className={`flex size-24 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br ${cat.gradient} font-display text-3xl font-extrabold text-white shadow-glow`}
                >
                  {initials(provider.name)}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-extrabold">{provider.name}</h1>
                    <VerifiedBadge verified={provider.verified} />
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    <Icon className="size-4" /> {cat.name}
                  </p>
                  <p className="mt-2 text-foreground/80">{provider.headline}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1 font-semibold text-amber-600">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      {provider.rating_avg.toFixed(1)} ({provider.rating_count})
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-4" /> {provider.city}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="size-4" /> {provider.jobs_completed} jobs done
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-4" /> {provider.years_experience} yrs exp
                    </span>
                  </div>
                </div>
              </div>

              <hr className="my-6 border-border" />

              <section>
                <h2 className="text-lg font-bold">About</h2>
                <p className="mt-2 text-foreground/80">{provider.bio}</p>
              </section>

              <section className="mt-6">
                <h2 className="text-lg font-bold">Skills</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {provider.skills.map((s) => (
                    <Badge key={s} variant="default" className="px-3 py-1 text-sm">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>

              <section className="mt-6">
                <h2 className="text-lg font-bold">Work experience</h2>
                <div className="mt-3 space-y-3">
                  <div className="flex gap-3 rounded-xl border border-border p-4">
                    <Briefcase className="mt-0.5 size-5 shrink-0 text-brand-600" />
                    <div>
                      <p className="font-semibold">
                        {cat.name} — {provider.years_experience} years of service
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Serving households across {provider.service_area}.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Award className="size-5 text-brand-600" /> Certificates
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {provider.verified
                    ? "TESDA / NBI documents on file and verified by Yayamove."
                    : "No certificates uploaded yet."}
                </p>
              </section>
            </Card>

            <ReviewsSection
              providerId={provider.id}
              ratingAvg={provider.rating_avg}
              ratingCount={provider.rating_count}
            />
          </div>

          {/* sidebar */}
          <aside className="space-y-4">
            <Card className="sticky top-20 p-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Starting at</p>
                  <p className="text-3xl font-extrabold text-brand-700">
                    {formatPHP(provider.hourly_rate)}
                    <span className="text-base font-medium text-muted-foreground">/hr</span>
                  </p>
                </div>
                <VerifiedBadge verified={provider.verified} />
              </div>

              <Button variant="gradient" size="lg" className="mt-5 w-full" onClick={() => setBooking(true)}>
                <CalendarCheck /> Request booking
              </Button>
              <Button variant="outline" size="lg" className="mt-2 w-full" onClick={startChat}>
                <MessageSquare /> Message
              </Button>

              <div className="mt-5 space-y-2.5 rounded-xl bg-brand-50 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-brand-800">
                  <ShieldCheck className="size-4" /> Yayamove Trust
                </p>
                <p className="text-muted-foreground">
                  Service area: <span className="font-medium text-foreground">{provider.service_area}</span>
                </p>
                <p className="text-muted-foreground">
                  Identity documents are stored privately and reviewed by our team.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      </div>

      {booking && (
        <BookingModal provider={provider} onClose={() => setBooking(false)} />
      )}
    </div>
  );
}

function BookingModal({
  provider,
  onClose,
}: {
  provider: ProviderListItem;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date || !address) {
      toast.error("Please add a date and address.");
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({
        provider_id: provider.id,
        category: provider.primary_category,
        scheduled_for: date ? new Date(date).toISOString() : undefined,
        address,
        notes,
        amount: provider.hourly_rate,
      });
      toast.success(`Booking requested with ${provider.name}! They'll confirm shortly.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Request booking</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          with <span className="font-semibold text-foreground">{provider.name}</span> · {formatPHP(provider.hourly_rate)}/hr
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="date">Preferred date &amp; time</Label>
            <Input id="date" type="datetime-local" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input id="address" className="mt-1.5" placeholder="Where is the job?" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" className="mt-1.5" placeholder="Any details the pro should know…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <Button variant="gradient" size="lg" className="mt-5 w-full" onClick={submit} disabled={submitting}>
          <CalendarCheck /> {submitting ? "Sending…" : "Send booking request"}
        </Button>
      </Card>
    </div>
  );
}
