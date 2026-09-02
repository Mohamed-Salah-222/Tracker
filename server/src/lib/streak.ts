import { UsageDay } from "../models/UsageDay";
import { EarnedBadge } from "../models/EarnedBadge";
import { BADGES, nextBadge, qualifyingBadges } from "./badges";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayUTC = (isoDate: string) => new Date(isoDate + "T00:00:00Z");

export type StreakSummary = {
  today: string;
  usedToday: boolean;
  current: number;
  longest: number;
  daysUsed: number;
  firstDay: string | null;
  /** The last 8 weeks, oldest first, for the strip on the page. */
  recent: { date: string; used: boolean }[];
  /** Set when the run is alive but today has not been counted yet. */
  atRisk: boolean;
};

/**
 * Current run, best run, and total days.
 *
 * Today not being logged yet does not break the run: at nine in the morning you have
 * not missed anything, you simply have not opened the app. So the current streak is
 * counted back from today if today is there, and from yesterday if it is not. It only
 * breaks once a whole day has passed unused.
 */
export async function streakSummary(todayIso: string): Promise<StreakSummary> {
  const docs = await UsageDay.find().sort({ date: 1 }).select({ date: 1 });
  const used = new Set(docs.map((d) => iso(d.date)));
  const todayMs = Date.parse(todayIso + "T00:00:00Z");

  let current = 0;
  const startsToday = used.has(todayIso);
  let cursor = startsToday ? todayMs : todayMs - DAY;
  while (used.has(iso(new Date(cursor)))) {
    current++;
    cursor -= DAY;
  }

  // Longest run anywhere in the history, walked once over the sorted days.
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const doc of docs) {
    const ms = Date.parse(iso(doc.date) + "T00:00:00Z");
    run = previous !== null && ms - previous === DAY ? run + 1 : 1;
    previous = ms;
    if (run > longest) longest = run;
  }

  const recent: { date: string; used: boolean }[] = [];
  for (let i = 55; i >= 0; i--) {
    const date = iso(new Date(todayMs - i * DAY));
    recent.push({ date, used: used.has(date) });
  }

  return {
    today: todayIso,
    usedToday: startsToday,
    current,
    longest: Math.max(longest, current),
    daysUsed: docs.length,
    firstDay: docs.length ? iso(docs[0].date) : null,
    recent,
    atRisk: current > 0 && !startsToday,
  };
}

export type ShapedBadge = {
  key: string;
  label: string;
  detail: string;
  group: string;
  measure: string;
  threshold: number;
  unit: string;
  earned: boolean;
  earnedOn: string | null;
  /** How far along, for the bar on a locked card. */
  progress: number;
  value: number;
};

/**
 * Award anything newly reached, then describe the whole catalogue.
 *
 * Earning is recorded the first time it is seen and never removed. Writing it down
 * rather than deriving it on every read is what lets the app still say "earned on 12
 * September" after the run behind it has ended.
 */
export async function syncBadges(measures: Record<string, number>, todayIso: string): Promise<{ badges: ShapedBadge[]; awarded: ShapedBadge[] }> {
  const existing = new Map((await EarnedBadge.find()).map((b) => [b.key, b]));
  const awardedKeys: string[] = [];

  for (const badge of qualifyingBadges(measures)) {
    if (existing.has(badge.key)) continue;
    try {
      const created = await EarnedBadge.create({ key: badge.key, earnedOn: todayIso, value: measures[badge.measure] ?? 0 });
      existing.set(badge.key, created);
      awardedKeys.push(badge.key);
    } catch {
      // A duplicate key means two requests raced to award the same badge. The other
      // one won, which is the correct outcome either way.
    }
  }

  const badges: ShapedBadge[] = BADGES.map((badge) => {
    const earned = existing.get(badge.key);
    const value = measures[badge.measure] ?? 0;
    return {
      key: badge.key,
      label: badge.label,
      detail: badge.detail,
      group: badge.group,
      measure: badge.measure,
      threshold: badge.threshold,
      unit: badge.unit ?? "",
      earned: Boolean(earned),
      earnedOn: earned?.earnedOn ?? null,
      progress: Math.min(100, Math.round((value / badge.threshold) * 100)),
      value,
    };
  });
  // Catalogue order, deliberately not re-sorted. The list is already grouped by
  // measure and rising within each, so sorting the whole thing by threshold would
  // interleave the ladders and put "a month in a row" next to "thirty days in total".

  return { badges, awarded: badges.filter((b) => awardedKeys.includes(b.key)) };
}

/** The next rung on each measure that has one, keyed by measure. */
export function nextUp(measures: Record<string, number>): Record<string, { key: string; label: string; threshold: number; value: number }> {
  const out: Record<string, { key: string; label: string; threshold: number; value: number }> = {};
  for (const measure of new Set(BADGES.map((b) => b.measure))) {
    const value = measures[measure] ?? 0;
    const next = nextBadge(measure, value);
    if (next) out[measure] = { key: next.key, label: next.label, threshold: next.threshold, value };
  }
  return out;
}

/**
 * Mark a day as used.
 *
 * Idempotent per day by construction: the first call creates the row, every later one
 * bumps its counter. A day can only join the streak once however many times the app is
 * opened, which is the whole point of it being a daily habit.
 */
export async function markUsed(dateIso: string, area: string | null): Promise<void> {
  // `date` is left out of $setOnInsert on purpose: it is the filter, so an upsert
  // already puts it on the new document, and naming it twice is a write conflict.
  await UsageDay.updateOne(
    { date: dayUTC(dateIso) },
    {
      $inc: { actions: 1 },
      $setOnInsert: { backfilled: false },
      ...(area ? { $addToSet: { areas: area } } : {}),
    },
    { upsert: true },
  );
}
