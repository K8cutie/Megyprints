import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, Trash2, ShieldCheck, AlertTriangle, X, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export default function Account() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  // RA 10173 "right to data portability": export the user's data.
  const downloadData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        email: user?.email ?? "demo@yayamove.ph",
        name: (user?.user_metadata?.full_name as string) ?? "Demo User",
      },
      note: "This is your Yayamove data export (demo). In production this is generated server-side and includes your profile, jobs, bookings, messages, and reviews.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yayamove-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Your data export has been downloaded.");
  };

  return (
    <div className="container max-w-2xl py-12">
      <h1 className="text-3xl font-extrabold">Account &amp; privacy</h1>
      <p className="mt-1 text-muted-foreground">
        Manage your data and exercise your rights under the Data Privacy Act of 2012.
      </p>

      {/* privacy summary */}
      <Card className="mt-6 border-brand-200 bg-brand-50 p-5">
        <p className="flex items-center gap-2 font-bold text-brand-800">
          <Lock className="size-4" /> Your sensitive documents are protected
        </p>
        <p className="mt-1 text-sm text-brand-900/80">
          Any NBI clearance or certificate you uploaded is stored privately and encrypted,
          visible only to you and our verification team.
        </p>
      </Card>

      {/* data portability */}
      <Card className="mt-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Download className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold">Download my data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Get a copy of your profile, jobs, bookings, messages, and reviews (JSON).
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={downloadData}>
              <Download /> Export data
            </Button>
          </div>
        </div>
      </Card>

      {/* consent */}
      <Card className="mt-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold">Verification consent</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You consented to us processing your NBI clearance for identity verification.
              You can withdraw this anytime — your badge will be removed and the document deleted.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => toast.success("Consent withdrawn. Your NBI document will be deleted.")}
            >
              Withdraw consent
            </Button>
          </div>
        </div>
      </Card>

      {/* danger zone — erasure */}
      <Card className="mt-4 border-destructive/30 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-destructive">Delete my account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete your account and all personal data, including any uploaded
              documents. This cannot be undone.
            </p>
            <Button variant="outline" size="sm" className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setConfirming(true)}>
              <Trash2 /> Delete account
            </Button>
          </div>
        </div>
      </Card>

      {confirming && (
        <DeleteModal
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            // Live build: a Supabase Edge Function (service_role) cascades the
            // delete across all tables + storage, then removes the auth user.
            toast.success("Your account and data have been deleted.");
            await signOut();
            navigate("/");
          }}
        />
      )}
    </div>
  );
}

function DeleteModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
            <AlertTriangle className="size-5" /> Delete account
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This permanently erases your account, profile, documents, messages, and bookings.
          Type <span className="font-bold text-foreground">DELETE</span> to confirm.
        </p>
        <Label htmlFor="confirm" className="sr-only">Type DELETE</Label>
        <Input id="confirm" className="mt-4" placeholder="DELETE" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 bg-destructive hover:brightness-95"
            disabled={text !== "DELETE"}
            onClick={onConfirm}
          >
            <Trash2 /> Permanently delete
          </Button>
        </div>
      </Card>
    </div>
  );
}
