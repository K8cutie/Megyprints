import { supabase } from './supabase';

/* The app's error reports (0050: api/client-error.mjs stores them), for the
   console's Errors tab. Owner only (RLS). Kept 30 days. */

export interface ClientError {
  id: number;
  created_at: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  url: string | null;
  user_agent: string | null;
}

export async function fetchClientErrors(limit = 200): Promise<ClientError[]> {
  const { data, error } = await supabase
    .from('client_errors')
    .select('id, created_at, message, stack, context, url, user_agent')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientError[];
}

/** The checkout and Your orders: where a failure can cost an order. */
export const isMoneyPath = (e: Pick<ClientError, 'context'>): boolean =>
  e.context?.path === 'checkout' || e.context?.path === 'your_orders';

/** "checkout · cover_pdf · try 2" from the report's context. */
export function whereOf(e: Pick<ClientError, 'context'>): string {
  const c = e.context ?? {};
  const parts = [c.path, c.step, c.kind].filter((v): v is string => typeof v === 'string' && v !== '');
  if (typeof c.attempt === 'number') parts.push(`try ${c.attempt}`);
  return parts.join(' · ') || 'app';
}

/** The phone and browser, in a few words, from the user agent:
 *  "Android 14 · SM-A546E · Chrome 129", "iPhone · iOS 18.1 · Safari". */
export function deviceOf(ua: string | null | undefined): string {
  if (!ua) return 'unknown device';
  const parts: string[] = [];
  const android = /Android (\d+(?:\.\d+)?)(?:; ([^;)]+))?/.exec(ua);
  const ios = /(iPhone|iPad)[^)]*OS (\d+)[_.](\d+)/.exec(ua);
  if (android) {
    parts.push(`Android ${android[1]}`);
    const model = android[2]?.trim();
    if (model && model !== 'K' && !/^wv$/i.test(model)) parts.push(model);
  } else if (ios) {
    parts.push(ios[1], `iOS ${ios[2]}.${ios[3]}`);
  } else if (/Windows NT/.test(ua)) {
    parts.push('Windows');
  } else if (/Mac OS X/.test(ua)) {
    parts.push('Mac');
  } else if (/Linux/.test(ua)) {
    parts.push('Linux');
  }
  const app = BROWSERS.map(([re, name]) => {
    const m = re.exec(ua);
    return m ? (m[1] ? `${name} ${m[1]}` : name) : '';
  }).find(Boolean);
  if (app) parts.push(app);
  return parts.join(' · ') || 'unknown device';
}

/** First match wins: in-app browsers and Samsung/Edge carry "Chrome/" too. */
const BROWSERS: [RegExp, string][] = [
  [/\b(?:FBAN|FBAV)\b/, 'Facebook app'],
  [/Instagram/, 'Instagram app'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/EdgA?\/(\d+)/, 'Edge'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Safari\//, 'Safari'],
];
