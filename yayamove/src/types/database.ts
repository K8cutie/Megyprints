/**
 * Hand-written types mirroring supabase/migrations/0001_init.sql.
 * (Swap for `supabase gen types typescript` output once the project is live.)
 */

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type JobStatus = "open" | "matched" | "in_progress" | "completed" | "cancelled";
export type QuoteStatus = "sent" | "accepted" | "declined" | "withdrawn";
export type CategorySlug =
  | "maid"
  | "carpentry"
  | "plumbing"
  | "computer-technician"
  | "aircon-service";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  province: string | null;
  is_provider: boolean;
  created_at: string;
}

export interface ProviderProfile {
  id: string;
  user_id: string;
  headline: string;
  bio: string | null;
  primary_category: CategorySlug;
  hourly_rate: number | null;
  service_area: string | null;
  years_experience: number | null;
  verification_status: VerificationStatus; // server-controlled only
  rating_avg: number; // server-computed only
  rating_count: number;
  jobs_completed: number;
  created_at: string;
}

export interface ProviderSkill {
  id: string;
  provider_id: string;
  category: CategorySlug;
  skill: string;
}

export interface WorkExperience {
  id: string;
  provider_id: string;
  title: string;
  employer: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
}

export interface Certificate {
  id: string;
  provider_id: string;
  title: string;
  issuer: string | null;
  year: number | null;
  file_path: string | null; // private storage object path
}

export interface NbiClearance {
  id: string;
  provider_id: string;
  file_path: string; // PRIVATE bucket object path — never a public URL
  status: VerificationStatus; // server-controlled
  consent_given: boolean;
  uploaded_at: string;
  reviewed_at: string | null;
}

export interface Job {
  id: string;
  seeker_id: string;
  category: CategorySlug;
  title: string;
  description: string;
  city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: JobStatus;
  created_at: string;
}

export interface Quote {
  id: string;
  job_id: string;
  provider_id: string;
  amount: number;
  message: string | null;
  status: QuoteStatus;
  created_at: string;
}

export interface Review {
  id: string;
  provider_id: string;
  reviewer_id: string;
  job_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T> };

export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>;
      provider_profiles: Row<ProviderProfile>;
      provider_skills: Row<ProviderSkill>;
      work_experience: Row<WorkExperience>;
      certificates: Row<Certificate>;
      nbi_clearances: Row<NbiClearance>;
      jobs: Row<Job>;
      quotes: Row<Quote>;
      reviews: Row<Review>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
