import { AxiosError } from "axios";
import { toast } from "sonner";
import { api } from "./api";
import { todayISO } from "./today";

export type Badge = {
  key: string;
  label: string;
  detail: string;
  group: string;
  measure: string;
  threshold: number;
  /** What the number is counting: days, sets, litres. Blank when it needs no word. */
  unit: string;
  earned: boolean;
  earnedOn: string | null;
  progress: number;
  value: number;
};

export type BadgeGroup = { key: string; label: string; badges: Badge[]; earned: number; total: number };

export type StreakResponse = {
  today: string;
  usedToday: boolean;
  current: number;
  longest: number;
  daysUsed: number;
  firstDay: string | null;
  recent: { date: string; used: boolean }[];
  atRisk: boolean;
  /** Only on the ping: what was earned by the action just taken. */
  awarded: Badge[];
};

export type BadgeBoard = StreakResponse & {
  measures: Record<string, number>;
  groups: BadgeGroup[];
  badges: Badge[];
  earned: number;
  total: number;
  next: Record<string, { key: string; label: string; threshold: number; value: number }>;
};

export function streakError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

/** The light one, for the pill. Does not touch the badge catalogue. */
export async function loadStreak(today = todayISO()): Promise<StreakResponse> {
  const r = await api.get<StreakResponse>("/streak", { params: { today } });
  return r.data;
}

/** The whole board. Walks every collection, so only the badges page asks for it. */
export async function loadBadges(today = todayISO()): Promise<BadgeBoard> {
  const r = await api.get<BadgeBoard>("/streak/badges", { params: { today } });
  return r.data;
}

const PINGED_KEY = "lifetracker.streak.pinged.v1";

/** Which local day this browser has already counted. */
function lastPinged(): string | null {
  try {
    return localStorage.getItem(PINGED_KEY);
  } catch {
    return null;
  }
}

let inFlight: Promise<StreakResponse | null> | null = null;

/**
 * Tell the server the app was used today.
 *
 * Fires at most once per local day per browser: the server counts a day once however
 * many times it is told, so this is only about not making the same request forty
 * times an afternoon.
 *
 * Never throws and never blocks anything. A streak that fails to record is a small
 * loss; a page that fails to load because a streak ping timed out is a real one, and
 * this runs on the phone in the gym where requests fail all the time.
 */
export async function pingUsage(area?: string): Promise<StreakResponse | null> {
  const today = todayISO();
  if (lastPinged() === today) return null;
  if (inFlight) return inFlight;

  inFlight = api
    .post<StreakResponse>("/streak/ping", { date: today, area })
    .then((r) => {
      try {
        localStorage.setItem(PINGED_KEY, today);
      } catch {
        // A private window pings again next load, which is harmless.
      }
      // Anything earned by what you just did, said once, where you are standing.
      for (const badge of r.data.awarded ?? []) toast.success(`Badge earned: ${badge.label}`, { description: badge.detail });
      return r.data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** The part of the app a request belongs to: "/calories/day?x=1" gives "calories". */
function areaFromUrl(url: string | undefined): string | undefined {
  const path = (url ?? "").split("?")[0].replace(/^\/+/, "");
  const first = path.split("/")[0];
  return /^[a-z][a-z0-9-]{0,20}$/.test(first) ? first : undefined;
}

let watching = false;

/**
 * Count anything that writes as using the app.
 *
 * One interceptor rather than a call in each of the app's many save handlers: there
 * is no version of that which stays complete as pages are added. Only successful
 * writes count, so a failed request in a dead zone does not award a day that never
 * happened, and the ping itself is skipped or it would answer its own request.
 */
export function watchWrites(): void {
  if (watching) return;
  watching = true;
  api.interceptors.response.use((response) => {
    const method = (response.config.method ?? "get").toLowerCase();
    const url = response.config.url ?? "";
    if (method !== "get" && !url.includes("/streak/ping")) void pingUsage(areaFromUrl(url));
    return response;
  });
}

/** "9 days", for the short label in the sidebar. */
export const dayCount = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** How far through the current step of the ladder, for the ring. */
export function towards(next: { threshold: number } | null, value: number): number {
  if (!next) return 100;
  return Math.min(100, Math.round((value / next.threshold) * 100));
}
