import { useNavigate } from "react-router-dom";
import { Briefcase, Star, ShieldCheck, Plus, Search, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "there";

  const stats = [
    { label: "Active jobs", value: "0", icon: Briefcase },
    { label: "Quotes received", value: "0", icon: Clock },
    { label: "Avg. rating", value: "—", icon: Star },
  ];

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Hi, {name} 👋</h1>
          <p className="mt-1 text-muted-foreground">Here’s what’s happening on Yayamove.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/browse")}>
            <Search /> Browse pros
          </Button>
          <Button variant="gradient" onClick={() => navigate("/post-job")}>
            <Plus /> Post a job
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-5 text-brand-500" />
            </div>
            <p className="mt-2 text-3xl font-extrabold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <ShieldCheck className="size-6" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">Become a verified pro</h2>
              <Badge variant="warning">Not started</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete your pro profile and upload your NBI clearance to start getting
              booked. Verified pros get up to 3× more bookings.
            </p>
            <Button variant="gradient" size="sm" className="mt-4" onClick={() => navigate("/become-a-pro")}>
              Set up pro profile
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="text-lg font-bold">Your jobs</h2>
        <Card className="mt-3 p-10 text-center">
          <Briefcase className="mx-auto size-10 text-muted-foreground/50" />
          <p className="mt-3 font-semibold">No jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Post your first job and verified pros will send you quotes.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/post-job")}>
            <Plus /> Post a job
          </Button>
        </Card>
      </div>
    </div>
  );
}
