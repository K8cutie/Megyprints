/* ══════════════════════════════════════════════════════════════════════════
   THE LIVE PRICES: public_price_schedule(), the same read-only call the
   website makes at start (src/lib/storeSettings.ts). It returns the
   customer rates only (no costs), the same for every visitor.

   Fail closed, as on the website: until the schedule is here there is no
   price. A load that didn't get it tries again after 3 s, 6 s, … up to every
   minute, and "Prices didn't load — tap to try again" tries at once.
   ══════════════════════════════════════════════════════════════════════════ */
import type { RpcClient } from './rpcClient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLaunchPrice, parseVideoOffer, type LaunchPrice, type PriceSchedule, type VideoOffer } from '@web/lib/pricing';

export const RETRY_FIRST_MS = 3000;
export const RETRY_MAX_MS = 60_000;

/** The launch price while one runs (public_launch_price, 0072), or null.
 *  It only ever adds a crossed-out regular price, so any failure (a database
 *  before 0072, no connection) is simply "no launch price", never an error. */
export async function loadLaunchPrice(client: RpcClient): Promise<LaunchPrice | null> {
  try {
    const { data, error } = await client.rpc('public_launch_price');
    return error ? null : parseLaunchPrice(data);
  } catch {
    return null;
  }
}

/** A database that doesn't have the function asked for, as opposed to one
 *  that couldn't be reached. */
export function isMissingFunction(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''));
}

/** How extra videos are sold (public_video_offer, 0073). It sets what videos
 *  cost, so it is part of the prices: a failed read is a failed load (no
 *  price, tried again); only a database before 0073 (no such function) means
 *  the 0066 packs (video_offer null → videoOfferOf's legacy rule). */
export async function loadVideoOffer(client: RpcClient): Promise<{ ok: true; offer: VideoOffer | null } | { ok: false }> {
  try {
    const { data, error } = await client.rpc('public_video_offer');
    if (!error) return { ok: true, offer: parseVideoOffer(data) };
    return isMissingFunction(error) ? { ok: true, offer: null } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** One read of the schedule, with the launch price and the video offer on
 *  it. Null when it could not be read (never throws). */
export async function loadPriceSchedule(client: RpcClient, configured: boolean): Promise<PriceSchedule | null> {
  if (!configured) return null;
  try {
    const [{ data, error }, launch, video] = await Promise.all([client.rpc('public_price_schedule'), loadLaunchPrice(client), loadVideoOffer(client)]);
    if (error || !data || typeof data !== 'object' || !video.ok) return null;
    return { ...(data as PriceSchedule), launch, video_offer: video.offer };
  } catch {
    return null;
  }
}

/** The wait before the next try: 3 s, 6 s, 12 s, … at most a minute. */
export function nextRetryMs(previous: number | null): number {
  return previous == null ? RETRY_FIRST_MS : Math.min(previous * 2, RETRY_MAX_MS);
}

export interface ScheduleState {
  schedule: PriceSchedule | null;
  /** The first read has not answered yet. */
  loading: boolean;
  /** A try the customer asked for is running. */
  retrying: boolean;
  retry: () => void;
}

export function usePriceSchedule(load: () => Promise<PriceSchedule | null>): ScheduleState {
  const [schedule, setSchedule] = useState<PriceSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay = useRef<number | null>(null);
  const inflight = useRef(false);

  const attempt = useCallback(async (asked: boolean) => {
    if (inflight.current) return;
    inflight.current = true;
    if (asked) setRetrying(true);
    const got = await load();
    inflight.current = false;
    if (!alive.current) return;
    setLoading(false);
    setRetrying(false);
    if (got) { setSchedule(got); delay.current = null; return; }
    delay.current = nextRetryMs(delay.current);
    timer.current = setTimeout(() => { timer.current = null; void attempt(false); }, delay.current);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void attempt(false);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    delay.current = null;
    // Every tap answers: "Loading price…" even when a try (one the app
    // started by itself) is already running. That try's answer is this
    // tap's answer, and it clears this when it comes back.
    setRetrying(true);
    void attempt(true);
  }, [attempt]);

  return { schedule, loading, retrying, retry };
}
