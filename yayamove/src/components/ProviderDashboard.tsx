import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Inbox,
  CalendarCheck,
  CheckCircle2,
  Wallet,
  Star,
  ShieldAlert,
  MapPin,
  Clock,
  Send,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CATEGORY_BY_SLUG } from "@/lib/categories";
import {
  SAMPLE_LEADS,
  SAMPLE_PROVIDER_BOOKINGS,
  SAMPLE_EARNINGS,
  type Lead,
  type ProviderBooking,
} from "@/lib/sampleProviderData";
import { formatPHP, timeAgo } from "@/lib/utils";

export function ProviderDashboard({ verified }: { verified: boolean }) {
  const [leads, setLeads] = useState<Lead[]>(SAMPLE_LEADS);
  const [bookings, setBookings] = useState<ProviderBooking[]>(SAMPLE_PROVIDER_BOOKINGS);
  const [quoteFor, setQuoteFor] = useState<Lead | null>(null);

  const earningsThisMonth = SAMPLE_EARNINGS[SAMPLE_EARNINGS.length - 1].amount;
  const maxEarning = Math.max(...SAMPLE_EARNINGS.map((e) => e.amount));
  const completed = bookings.filter((b) => b.status === "completed").length;
  const active = bookings.filter((b) => b.status === "accepted" || b.status === "requested").length;

  const stats = useMemo(
    () => [
      { label: "New leads", value: String(leads.length), icon: Inbox, tint: "text-brand-600" },
      { label: "Active bookings", value: String(active), icon: CalendarCheck, tint: "text-accent" },
      { label: "Completed", value: String(completed), icon: CheckCircle2, tint: "text-emerald-600" },
      { label: "This month", value: formatPHP(earningsThisMonth), icon: Wallet, tint: "text-brand-700" },
    ],
    [leads.length, active, completed, earningsThisMonth],
  );

  const updateBooking = (id: string, status: ProviderBooking["status"]) => {
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status } : b)));
    toast.success(`Booking ${status}.`);
  };

  return (
    <div className="space-y-6">
      {/* verification banner */}
      {!verified && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="size-6 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-bold text-amber-900">Get NBI-verified to unlock more bookings</p>
              <p className="text-sm text-amber-800/80">Verified pros appear higher and earn the trust badge.</p>
            </div>
            <Badge variant="warning">Pending</Badge>
          </div>
        </Card>
      )}

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className={`size-5 ${s.tint}`} />
            </div>
            <p className="mt-2 text-2xl font-extrabold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* leads */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Incoming job leads</h2>
            <Badge variant="default">{leads.length} matching you</Badge>
          </div>
          {leads.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No new leads right now. We'll notify you when a matching job is posted.
            </Card>
          ) : (
            leads.map((lead) => {
              const cat = CATEGORY_BY_SLUG[lead.category];
              const Icon = cat.icon;
              return (
                <Card key={lead.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${cat.gradient} text-white`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold">{lead.title}</h3>
                        <span className="text-sm font-extrabold text-brand-700">
                          {formatPHP(lead.budgetMin)}–{formatPHP(lead.budgetMax)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{lead.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {lead.city}</span>
                        <span className="flex items-center gap-1"><Clock className="size-3.5" /> {timeAgo(lead.postedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="gradient" size="sm" onClick={() => setQuoteFor(lead)}>
                      <Send /> Send quote
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setLeads((ls) => ls.filter((l) => l.id !== lead.id))}>
                      Dismiss
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* sidebar: earnings + bookings */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Earnings</h3>
              <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
                <Star className="size-4 fill-amber-400 text-amber-400" /> 4.9
              </span>
            </div>
            <div className="mt-4 flex h-28 items-end justify-between gap-1.5">
              {SAMPLE_EARNINGS.map((e) => (
                <div key={e.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-accent transition-all"
                    style={{ height: `${(e.amount / maxEarning) * 100}%` }}
                    title={formatPHP(e.amount)}
                  />
                  <span className="text-[10px] text-muted-foreground">{e.month}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold">Your bookings</h3>
            <div className="mt-3 space-y-3">
              {bookings.map((b) => (
                <div key={b.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{b.seekerName}</span>
                    <span className="text-sm font-bold text-brand-700">{formatPHP(b.amount)}</span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {b.address}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <BookingStatus status={b.status} />
                    {b.status === "requested" && (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 bg-emerald-600 px-2 hover:bg-emerald-700" onClick={() => updateBooking(b.id, "accepted")}>Accept</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => updateBooking(b.id, "declined")}>Decline</Button>
                      </div>
                    )}
                    {b.status === "accepted" && (
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => updateBooking(b.id, "completed")}>Mark done</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {quoteFor && <QuoteModal lead={quoteFor} onClose={() => setQuoteFor(null)} onSent={() => setLeads((ls) => ls.filter((l) => l.id !== quoteFor.id))} />}
    </div>
  );
}

function BookingStatus({ status }: { status: ProviderBooking["status"] }) {
  const map = {
    requested: <Badge variant="warning">Requested</Badge>,
    accepted: <Badge variant="default"><CalendarCheck className="size-3" /> Accepted</Badge>,
    completed: <Badge variant="success"><CheckCircle2 className="size-3" /> Completed</Badge>,
    declined: <Badge variant="muted">Declined</Badge>,
  } as const;
  return map[status];
}

function QuoteModal({ lead, onClose, onSent }: { lead: Lead; onClose: () => void; onSent: () => void }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const send = () => {
    if (!amount) {
      toast.error("Enter your quote amount.");
      return;
    }
    // Live build: insert into `quotes` (RLS: provider_id = my_provider_id()).
    toast.success(`Quote sent for "${lead.title}"!`);
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Send a quote</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{lead.title} · {lead.city}</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="amount">Your price (₱)</Label>
            <Input id="amount" type="number" min={0} className="mt-1.5" placeholder="800" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Client budget: {formatPHP(lead.budgetMin)}–{formatPHP(lead.budgetMax)}</p>
          </div>
          <div>
            <Label htmlFor="msg">Message</Label>
            <Textarea id="msg" className="mt-1.5" placeholder="Introduce yourself and what's included…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <Button variant="gradient" size="lg" className="mt-5 w-full" onClick={send}>
          <Send /> Send quote
        </Button>
      </Card>
    </div>
  );
}
