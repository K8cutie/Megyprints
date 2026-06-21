import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldX,
  Lock,
  FileText,
  Clock,
  MapPin,
  Award,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { SAMPLE_PENDING, type PendingVerification } from "@/lib/sampleVerifications";
import { CATEGORY_BY_SLUG } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { initials, timeAgo } from "@/lib/utils";

export default function AdminVerification() {
  const [queue, setQueue] = useState<PendingVerification[]>(SAMPLE_PENDING);
  const [preview, setPreview] = useState<PendingVerification | null>(null);
  const [reviewed, setReviewed] = useState(0);

  const decide = (v: PendingVerification, approve: boolean) => {
    // Live build: admin-only RLS update sets nbi_clearances.status +
    // provider_profiles.verification_status (guard trigger allows is_admin()).
    setQueue((q) => q.filter((x) => x.id !== v.id));
    setReviewed((r) => r + 1);
    setPreview(null);
    toast[approve ? "success" : "error"](
      approve
        ? `${v.providerName} approved — NBI Verified ✅`
        : `${v.providerName}'s submission was rejected.`,
    );
  };

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold">Verification queue</h1>
            <Badge variant="solid" className="gap-1">
              <Lock className="size-3" /> Admin
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Review NBI clearances and approve trusted pros. Documents are private &amp; access-logged.
          </p>
        </div>
        <div className="flex gap-3">
          <Card className="px-5 py-3 text-center">
            <p className="text-2xl font-extrabold text-amber-600">{queue.length}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </Card>
          <Card className="px-5 py-3 text-center">
            <p className="text-2xl font-extrabold text-emerald-600">{reviewed}</p>
            <p className="text-xs text-muted-foreground">Reviewed today</p>
          </Card>
        </div>
      </div>

      {queue.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <p className="mt-3 text-lg font-bold">Queue cleared! 🎉</p>
          <p className="mt-1 text-muted-foreground">No pending verifications. Nice work.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {queue.map((v) => {
            const cat = CATEGORY_BY_SLUG[v.category];
            const Icon = cat.icon;
            return (
              <Card key={v.id} className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white">
                    {initials(v.providerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{v.providerName}</h3>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Icon className="size-3.5" /> {cat.name}</span>
                      <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {v.city}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3.5" /> {v.yearsExperience} yrs</span>
                    </p>
                  </div>
                  <Badge variant="warning" className="gap-1">
                    <Clock className="size-3" /> {timeAgo(v.submittedAt)}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.skills.map((s) => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                  {v.hasCertificates && (
                    <Badge variant="default" className="gap-1"><Award className="size-3" /> Certificates</Badge>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPreview(v)}>
                    <Eye /> Review NBI
                  </Button>
                  <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide(v, true)}>
                    <ShieldCheck /> Approve
                  </Button>
                  <Button variant="outline" className="text-destructive hover:bg-destructive/5" onClick={() => decide(v, false)}>
                    <ShieldX /> Reject
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* NBI preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-brand-700">
              <Lock className="size-5" />
              <h2 className="text-lg font-bold">NBI Clearance — {preview.providerName}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Accessed via short-lived signed URL · this view is access-logged.
            </p>

            {/* placeholder document preview */}
            <div className="mt-4 flex aspect-[1.4/1] flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 text-center">
              <FileText className="size-14 text-brand-400" />
              <p className="mt-3 font-mono text-sm font-semibold text-brand-700">{preview.nbiPreview}</p>
              <p className="mt-1 text-xs text-muted-foreground">Encrypted document preview (demo)</p>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => decide(preview, true)}
              >
                <ShieldCheck /> Approve &amp; verify
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-destructive hover:bg-destructive/5"
                onClick={() => decide(preview, false)}
              >
                <ShieldX /> Reject
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
