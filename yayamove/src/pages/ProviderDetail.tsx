import { useParams, useNavigate, Link } from "react-router-dom";
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
} from "lucide-react";
import { SAMPLE_PROVIDERS } from "@/lib/sampleData";
import { CATEGORY_BY_SLUG } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatPHP, initials } from "@/lib/utils";

export default function ProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const provider = SAMPLE_PROVIDERS.find((p) => p.id === id);

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

              <Button variant="gradient" size="lg" className="mt-5 w-full">
                <CalendarCheck /> Request booking
              </Button>
              <Button variant="outline" size="lg" className="mt-2 w-full">
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
    </div>
  );
}
