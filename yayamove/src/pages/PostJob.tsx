import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Send } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { createJob } from "@/lib/api";
import type { CategorySlug } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const schema = z.object({
  category: z.string().min(1, "Pick a service"),
  title: z.string().min(5, "Give your job a short title"),
  description: z.string().min(20, "Add a few details (min 20 chars)"),
  city: z.string().min(2, "Where is the job?"),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
});
type FormValues = z.infer<typeof schema>;

export default function PostJob() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const category = watch("category");

  const onSubmit = async (data: FormValues) => {
    try {
      await createJob({
        category: data.category as CategorySlug,
        title: data.title,
        description: data.description,
        city: data.city,
        budget_min: data.budgetMin,
        budget_max: data.budgetMax,
      });
      setSubmitted(true);
      toast.success("Job posted! Nearby pros will send quotes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post job.");
    }
  };

  if (submitted) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-12">
        <Card className="max-w-md p-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-extrabold">Your job is live!</h1>
          <p className="mt-2 text-muted-foreground">
            Verified pros near you can now see it and send quotes. You’ll get notified
            as offers come in.
          </p>
          <Button variant="gradient" className="mt-6" onClick={() => setSubmitted(false)}>
            Post another job
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold">Post a job</h1>
        <p className="mt-1 text-muted-foreground">
          Describe what you need. Nearby verified pros will send you quotes.
        </p>
      </header>

      <Card className="p-6 sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <Label>Service needed</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setValue("category", c.slug, { shouldValidate: true })}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-3 text-center text-sm font-semibold transition-all",
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-700 shadow-soft"
                        : "border-border hover:border-brand-300 hover:bg-brand-50/50",
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs leading-tight">{c.name}</span>
                  </button>
                );
              })}
            </div>
            {errors.category && <p className="mt-1 text-xs text-destructive">{errors.category.message}</p>}
          </div>

          <div>
            <Label htmlFor="title">Job title</Label>
            <Input id="title" className="mt-1.5" placeholder="e.g. Aircon cleaning for 2 split-type units" {...register("title")} />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div>
            <Label htmlFor="description">Details</Label>
            <Textarea
              id="description"
              className="mt-1.5"
              placeholder="Describe the job, any specifics, preferred schedule…"
              {...register("description")}
            />
            {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div>
            <Label htmlFor="city">City / Area</Label>
            <Input id="city" className="mt-1.5" placeholder="e.g. Quezon City" {...register("city")} />
            {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="budgetMin">Budget min (₱)</Label>
              <Input id="budgetMin" type="number" min={0} className="mt-1.5" placeholder="500" {...register("budgetMin")} />
            </div>
            <div>
              <Label htmlFor="budgetMax">Budget max (₱)</Label>
              <Input id="budgetMax" type="number" min={0} className="mt-1.5" placeholder="1500" {...register("budgetMax")} />
            </div>
          </div>

          <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isSubmitting}>
            <Send /> {isSubmitting ? "Posting…" : "Post job & get quotes"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
