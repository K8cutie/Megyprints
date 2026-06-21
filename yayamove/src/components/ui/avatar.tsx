import { cn, initials } from "@/lib/utils";

const sizes = {
  sm: "size-10 text-sm rounded-full",
  md: "size-12 text-base rounded-2xl",
  lg: "size-14 text-lg rounded-2xl",
  xl: "size-24 text-3xl rounded-3xl",
} as const;

interface AvatarProps {
  name: string;
  size?: keyof typeof sizes;
  /** tailwind gradient stops, e.g. a category gradient; defaults to brand */
  gradient?: string;
  className?: string;
}

/** The initials avatar bubble used across the app (was hand-rolled ~9×). */
export function Avatar({ name, size = "md", gradient, className }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br font-display font-bold text-white shadow-soft",
        gradient ?? "from-brand-500 to-brand-700",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials(name) || "?"}
    </div>
  );
}
