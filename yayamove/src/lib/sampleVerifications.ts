import type { CategorySlug } from "@/types/database";

export interface PendingVerification {
  id: string;
  providerName: string;
  category: CategorySlug;
  city: string;
  submittedAt: string;
  yearsExperience: number;
  skills: string[];
  hasCertificates: boolean;
  /** placeholder for the private signed-URL preview of the NBI clearance */
  nbiPreview: string;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const SAMPLE_PENDING: PendingVerification[] = [
  {
    id: "v1",
    providerName: "Kevin Reyes",
    category: "computer-technician",
    city: "Makati City",
    submittedAt: daysAgo(1),
    yearsExperience: 6,
    skills: ["Virus removal", "OS reinstall", "Hardware upgrade", "Networking"],
    hasCertificates: true,
    nbiPreview: "NBI-2026-0098-KR",
  },
  {
    id: "v2",
    providerName: "Grace Aquino",
    category: "maid",
    city: "Parañaque",
    submittedAt: daysAgo(2),
    yearsExperience: 5,
    skills: ["Cooking", "General cleaning", "Elderly care"],
    hasCertificates: false,
    nbiPreview: "NBI-2026-0101-GA",
  },
  {
    id: "v3",
    providerName: "Mark Villanueva",
    category: "plumbing",
    city: "Pasig City",
    submittedAt: daysAgo(3),
    yearsExperience: 9,
    skills: ["Leak repair", "Water heater", "Pipe installation"],
    hasCertificates: true,
    nbiPreview: "NBI-2026-0104-MV",
  },
];
