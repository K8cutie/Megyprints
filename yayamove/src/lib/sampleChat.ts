import { SAMPLE_PROVIDERS } from "./sampleData";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string; // "me" or the provider's id
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Conversation {
  id: string;
  /** the other party (a provider, in demo) */
  partyId: string;
  partyName: string;
  partyCategory: string;
  verified: boolean;
}

export const ME = "me";

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    partyId: SAMPLE_PROVIDERS[0].id,
    partyName: SAMPLE_PROVIDERS[0].name,
    partyCategory: SAMPLE_PROVIDERS[0].primary_category,
    verified: SAMPLE_PROVIDERS[0].verified,
  },
  {
    id: "c2",
    partyId: SAMPLE_PROVIDERS[4].id,
    partyName: SAMPLE_PROVIDERS[4].name,
    partyCategory: SAMPLE_PROVIDERS[4].primary_category,
    verified: SAMPLE_PROVIDERS[4].verified,
  },
  {
    id: "c3",
    partyId: SAMPLE_PROVIDERS[2].id,
    partyName: SAMPLE_PROVIDERS[2].name,
    partyCategory: SAMPLE_PROVIDERS[2].primary_category,
    verified: SAMPLE_PROVIDERS[2].verified,
  },
];

export const SAMPLE_MESSAGES: ChatMessage[] = [
  // Maria Santos
  { id: "m1", conversationId: "c1", senderId: ME, body: "Hi Maria! Are you free this Saturday for general cleaning of a 2-bedroom condo?", createdAt: minsAgo(180), readAt: minsAgo(178) },
  { id: "m2", conversationId: "c1", senderId: SAMPLE_PROVIDERS[0].id, body: "Hello po! Yes, I'm available Saturday morning. Around what time?", createdAt: minsAgo(176), readAt: minsAgo(175) },
  { id: "m3", conversationId: "c1", senderId: ME, body: "9am would be perfect. How much for half-day?", createdAt: minsAgo(170), readAt: minsAgo(169) },
  { id: "m4", conversationId: "c1", senderId: SAMPLE_PROVIDERS[0].id, body: "₱180/hr po, usually 4 hours for that size. So around ₱720. Includes bathroom and kitchen deep clean. 😊", createdAt: minsAgo(168), readAt: null },

  // Allan (aircon)
  { id: "m5", conversationId: "c2", senderId: ME, body: "Hi Allan, 2 split-type units need cleaning. Are you available next week?", createdAt: minsAgo(60), readAt: minsAgo(58) },
  { id: "m6", conversationId: "c2", senderId: SAMPLE_PROVIDERS[4].id, body: "Yes sir! Tuesday or Wednesday afternoon. ₱600 per unit, with free check-up.", createdAt: minsAgo(55), readAt: null },

  // Jun (plumbing)
  { id: "m7", conversationId: "c3", senderId: SAMPLE_PROVIDERS[2].id, body: "Good day! I saw your job post for the kitchen leak. I can come by tomorrow morning.", createdAt: minsAgo(12), readAt: null },
];

/** Canned replies used in demo mode to make the chat feel alive. */
export const DEMO_REPLIES = [
  "Sounds good po! 👍",
  "Okay, noted. I'll prepare my tools.",
  "Yes, that works for me. See you then!",
  "Sure! Let me check my schedule and confirm.",
  "Salamat! I'll send you the details shortly.",
];
