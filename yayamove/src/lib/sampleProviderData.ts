import type { CategorySlug } from "@/types/database";

export interface Lead {
  id: string;
  title: string;
  category: CategorySlug;
  city: string;
  budgetMin: number;
  budgetMax: number;
  postedAt: string;
  description: string;
}

export interface ProviderBooking {
  id: string;
  seekerName: string;
  category: CategorySlug;
  scheduledFor: string;
  address: string;
  amount: number;
  status: "requested" | "accepted" | "completed" | "declined";
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export const SAMPLE_LEADS: Lead[] = [
  { id: "l1", title: "Deep clean 2-bedroom condo", category: "maid", city: "Quezon City", budgetMin: 600, budgetMax: 1000, postedAt: hoursAgo(2), description: "Move-out cleaning, including kitchen and 2 bathrooms." },
  { id: "l2", title: "Weekly laundry & ironing", category: "maid", city: "San Juan", budgetMin: 400, budgetMax: 700, postedAt: hoursAgo(6), description: "Looking for a reliable kasambahay twice a week." },
  { id: "l3", title: "Aircon cleaning — 3 units", category: "aircon-service", city: "Mandaluyong", budgetMin: 1500, budgetMax: 2400, postedAt: hoursAgo(20), description: "Two split-type, one window-type. Prefer weekend." },
];

export const SAMPLE_PROVIDER_BOOKINGS: ProviderBooking[] = [
  { id: "b1", seekerName: "Andrea L.", category: "maid", scheduledFor: inDays(1), address: "Diliman, QC", amount: 720, status: "requested" },
  { id: "b2", seekerName: "Mike P.", category: "maid", scheduledFor: inDays(3), address: "Cubao, QC", amount: 960, status: "accepted" },
  { id: "b3", seekerName: "Joy R.", category: "maid", scheduledFor: hoursAgo(48), address: "San Juan", amount: 540, status: "completed" },
];

/** Last 6 months of earnings for the mini chart (₱). */
export const SAMPLE_EARNINGS = [
  { month: "Jan", amount: 8400 },
  { month: "Feb", amount: 11200 },
  { month: "Mar", amount: 9800 },
  { month: "Apr", amount: 14300 },
  { month: "May", amount: 16100 },
  { month: "Jun", amount: 12750 },
];
