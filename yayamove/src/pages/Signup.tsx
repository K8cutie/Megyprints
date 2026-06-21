import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Megyprints lesson: weak 6-char passwords were flagged. Enforce a real policy.
const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .regex(/[a-z]/, "One lowercase letter")
  .regex(/[A-Z]/, "One uppercase letter")
  .regex(/[0-9]/, "One number");

const schema = z
  .object({
    fullName: z.string().min(2, "Please enter your name"),
    email: z.string().email("Enter a valid email"),
    password: passwordSchema,
    confirm: z.string(),
    accountType: z.enum(["seeker", "provider"]),
    consent: z.literal(true, {
      errorMap: () => ({ message: "You must accept to continue" }),
    }),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don’t match",
  });

type FormValues = z.infer<typeof schema>;

const rules = [
  { label: "10+ characters", test: (v: string) => v.length >= 10 },
  { label: "Uppercase", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Lowercase", test: (v: string) => /[a-z]/.test(v) },
  { label: "Number", test: (v: string) => /[0-9]/.test(v) },
];

export default function Signup() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accountType: "seeker" },
  });

  const password = watch("password") ?? "";
  const accountType = watch("accountType");

  const onSubmit = async (data: FormValues) => {
    if (!isSupabaseConfigured || !supabase) {
      toast.error("Demo mode — connect Supabase in .env to create accounts.");
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName, is_provider: data.accountType === "provider" },
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created! Check your email to confirm.");
    navigate(data.accountType === "provider" ? "/become-a-pro" : "/browse");
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-brand-mesh" />
      <div className="container flex items-center justify-center py-12">
        <div className="w-full max-w-md">
          <div className="glass rounded-3xl p-7 sm:p-8">
            <div className="flex justify-center">
              <Logo />
            </div>
            <h1 className="mt-5 text-center text-2xl font-extrabold">Create your account</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Join Yayamove — it’s free.
            </p>

            {/* account type */}
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              {(["seeker", "provider"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue("accountType", t)}
                  className={cn(
                    "rounded-lg py-2 text-sm font-semibold transition-colors",
                    accountType === t ? "bg-white text-brand-700 shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {t === "seeker" ? "I need help" : "I’m a pro"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" className="mt-1.5" placeholder="Juan dela Cruz" {...register("fullName")} />
                {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>}
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" className="mt-1.5" placeholder="you@email.com" {...register("email")} />
                {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    placeholder="Create a strong password"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {rules.map((r) => {
                    const ok = r.test(password);
                    return (
                      <span
                        key={r.label}
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          ok ? "text-emerald-600" : "text-muted-foreground",
                        )}
                      >
                        <Check className={cn("size-3", !ok && "opacity-30")} /> {r.label}
                      </span>
                    );
                  })}
                </div>
                {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type={show ? "text" : "password"} className="mt-1.5" {...register("confirm")} />
                {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm.message}</p>}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted-foreground">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" {...register("consent")} />
                <span>
                  I agree to the Terms and Privacy Policy, and consent to Yayamove processing
                  my data — including any NBI clearance I upload — under the{" "}
                  <span className="font-medium text-foreground">Data Privacy Act of 2012</span>.
                </span>
              </label>
              {errors.consent && <p className="text-xs text-destructive">{errors.consent.message}</p>}

              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create account"}
              </Button>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-brand-600" /> Your documents are private &amp; encrypted.
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-700 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
