import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** show the "Yayamove" wordmark next to the mark */
  withText?: boolean;
  textClassName?: string;
}

/** The maid-silhouette mark in a blue badge, rendered inline as SVG. */
export function Logo({ className, withText = true, textClassName }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 512 512"
        className={cn("h-9 w-9", className)}
        role="img"
        aria-label="Yayamove"
      >
        <defs>
          <linearGradient id="lgBg" x1="0" y1="0" x2="512" y2="512">
            <stop stopColor="#3b82f6" />
            <stop offset="0.55" stopColor="#1d4ed8" />
            <stop offset="1" stopColor="#172554" />
          </linearGradient>
          <linearGradient id="lgFig" x1="256" y1="120" x2="256" y2="470">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#dbeafe" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="480" height="480" rx="120" fill="url(#lgBg)" />
        <g fill="url(#lgFig)">
          <path d="M192 146c0-12 12-22 28-25 8-14 22-23 36-23s28 9 36 23c16 3 28 13 28 25 0 7-5 12-12 13-6 7-16 11-28 12h-48c-12-1-22-5-28-12-7-1-12-6-12-13z" />
          <circle cx="256" cy="196" r="52" />
          <rect x="240" y="240" width="32" height="30" rx="10" />
          <path d="M168 470c0-58 30-104 74-122 4 10 8 14 14 14s10-4 14-14c44 18 74 64 74 122z" />
          <path
            d="M222 358c0-10 15-18 34-18s34 8 34 18v70c0 8-6 14-14 14h-40c-8 0-14-6-14-14z"
            fill="#bfdbfe"
          />
        </g>
      </svg>
      {withText && (
        <span
          className={cn(
            "font-display text-xl font-extrabold tracking-tight text-brand-900",
            textClassName,
          )}
        >
          Yaya<span className="brand-gradient-text">move</span>
        </span>
      )}
    </span>
  );
}
