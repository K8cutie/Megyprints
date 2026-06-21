import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** NBI-verified trust marker. Verification is server-controlled — a provider can
 *  never self-set this (see RLS in 0002_rls_lockdown.sql). */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <Badge variant="success" title="NBI clearance verified by Yayamove">
        <ShieldCheck className="size-3.5" />
        NBI Verified
      </Badge>
    );
  }
  return (
    <Badge variant="muted" title="Verification pending">
      <ShieldAlert className="size-3.5" />
      Unverified
    </Badge>
  );
}
