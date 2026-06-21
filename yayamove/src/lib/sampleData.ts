import type { CategorySlug } from "@/types/database";

/** Demo-mode providers so the design is viewable before Supabase is connected. */
export interface SampleProvider {
  id: string;
  name: string;
  headline: string;
  primary_category: CategorySlug;
  city: string;
  service_area: string;
  hourly_rate: number;
  years_experience: number;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  verified: boolean;
  skills: string[];
  bio: string;
}

export const SAMPLE_PROVIDERS: SampleProvider[] = [
  {
    id: "p1",
    name: "Maria Santos",
    headline: "Reliable kasambahay • 8 yrs caring for QC homes",
    primary_category: "maid",
    city: "Quezon City",
    service_area: "QC, San Juan, Mandaluyong",
    hourly_rate: 180,
    years_experience: 8,
    rating_avg: 4.9,
    rating_count: 124,
    jobs_completed: 210,
    verified: true,
    skills: ["General cleaning", "Laundry & ironing", "Cooking", "Childcare"],
    bio: "Detail-oriented and trustworthy. I treat every home like my own.",
  },
  {
    id: "p2",
    name: "Roberto Cruz",
    headline: "Master carpenter • custom cabinets & repairs",
    primary_category: "carpentry",
    city: "Pasig City",
    service_area: "Pasig, Taguig, Makati",
    hourly_rate: 350,
    years_experience: 15,
    rating_avg: 4.8,
    rating_count: 88,
    jobs_completed: 142,
    verified: true,
    skills: ["Cabinet making", "Furniture repair", "Door & window", "Wood finishing"],
    bio: "From a wobbly chair to a full kitchen fit-out — I build it to last.",
  },
  {
    id: "p3",
    name: "Jun Dela Peña",
    headline: "Licensed plumber • fast leak & drainage fixes",
    primary_category: "plumbing",
    city: "Mandaluyong",
    service_area: "Mandaluyong, Makati, QC",
    hourly_rate: 300,
    years_experience: 10,
    rating_avg: 4.7,
    rating_count: 65,
    jobs_completed: 98,
    verified: true,
    skills: ["Leak repair", "Drain cleaning", "Water heater", "Pipe installation"],
    bio: "On-time, clean work, no hidden charges. Emergency calls welcome.",
  },
  {
    id: "p4",
    name: "Kevin Reyes",
    headline: "PC & laptop repair • home service",
    primary_category: "computer-technician",
    city: "Makati City",
    service_area: "Makati, BGC, Ortigas",
    hourly_rate: 280,
    years_experience: 6,
    rating_avg: 4.9,
    rating_count: 73,
    jobs_completed: 119,
    verified: false,
    skills: ["Virus removal", "OS reinstall", "Hardware upgrade", "Networking"],
    bio: "Same-day diagnosis. I explain the problem in plain Tagalog/English.",
  },
  {
    id: "p5",
    name: "Allan Bautista",
    headline: "Aircon cleaning & repair • split & window type",
    primary_category: "aircon-service",
    city: "Taguig City",
    service_area: "Taguig, Parañaque, Muntinlupa",
    hourly_rate: 320,
    years_experience: 12,
    rating_avg: 4.8,
    rating_count: 101,
    jobs_completed: 176,
    verified: true,
    skills: ["Cleaning", "Freon recharge", "Installation", "Troubleshooting"],
    bio: "Cool comfort, guaranteed. Free check-up with every cleaning.",
  },
  {
    id: "p6",
    name: "Grace Aquino",
    headline: "All-around kasambahay • cooking specialist",
    primary_category: "maid",
    city: "Parañaque",
    service_area: "Parañaque, Las Piñas, Muntinlupa",
    hourly_rate: 200,
    years_experience: 5,
    rating_avg: 4.6,
    rating_count: 42,
    jobs_completed: 64,
    verified: false,
    skills: ["Cooking", "General cleaning", "Elderly care", "Laundry & ironing"],
    bio: "Home-cooked Filipino meals and a spotless home, every visit.",
  },
];
