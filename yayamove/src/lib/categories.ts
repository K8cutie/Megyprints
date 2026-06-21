import {
  Sparkles,
  Hammer,
  Wrench,
  Laptop,
  Snowflake,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { CategorySlug } from "@/types/database";

// Single canonical home is types/database.ts; re-exported here for convenience.
export type { CategorySlug };

export interface ServiceCategory {
  slug: CategorySlug;
  name: string;
  tagline: string;
  icon: LucideIcon;
  /** tailwind gradient stops for the category tile */
  gradient: string;
  /** example skills shown during onboarding */
  sampleSkills: string[];
}

export const CATEGORIES: ServiceCategory[] = [
  {
    slug: "maid",
    name: "Maid / Kasambahay",
    tagline: "Cleaning, laundry & home care",
    icon: Sparkles,
    gradient: "from-brand-500 to-brand-700",
    sampleSkills: ["General cleaning", "Laundry & ironing", "Cooking", "Childcare", "Elderly care"],
  },
  {
    slug: "carpentry",
    name: "Carpentry",
    tagline: "Repairs, furniture & fit-outs",
    icon: Hammer,
    gradient: "from-brand-600 to-brand-800",
    sampleSkills: ["Furniture repair", "Cabinet making", "Door & window", "Wood finishing", "Framing"],
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    tagline: "Leaks, fixtures & drainage",
    icon: Wrench,
    gradient: "from-accent to-brand-600",
    sampleSkills: ["Leak repair", "Pipe installation", "Toilet & faucet", "Drain cleaning", "Water heater"],
  },
  {
    slug: "computer-technician",
    name: "Computer Technician",
    tagline: "PC, laptop & network fixes",
    icon: Laptop,
    gradient: "from-brand-500 to-accent",
    sampleSkills: ["OS reinstall", "Virus removal", "Hardware upgrade", "Data recovery", "Networking"],
  },
  {
    slug: "aircon-service",
    name: "Aircon Service",
    tagline: "Cleaning, repair & install",
    icon: Snowflake,
    gradient: "from-brand-400 to-brand-700",
    sampleSkills: ["Cleaning", "Freon recharge", "Installation", "Compressor repair", "Troubleshooting"],
  },
];

export const CATEGORY_BY_SLUG: Record<CategorySlug, ServiceCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
) as Record<CategorySlug, ServiceCategory>;

/** Neutral fallback so unknown/drifted category slugs never crash a render. */
export const FALLBACK_CATEGORY: ServiceCategory = {
  slug: "maid",
  name: "Service",
  tagline: "General service",
  icon: Briefcase,
  gradient: "from-brand-500 to-brand-700",
  sampleSkills: [],
};

/** Safe category lookup — returns a neutral fallback instead of `undefined`. */
export function getCategory(slug: string | null | undefined): ServiceCategory {
  return (slug && CATEGORY_BY_SLUG[slug as CategorySlug]) || FALLBACK_CATEGORY;
}
