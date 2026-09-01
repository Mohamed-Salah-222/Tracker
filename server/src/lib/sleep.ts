import { SleepEntry } from "../models/SleepEntry";
import { loadTrackerGoals } from "../models/TrackerGoals";

const DAY = 86_400_000;

export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "7h 20m", the only way a duration is ever shown. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "23:30" from 1410. */
export function clockLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Bedtimes measured around midnight rather than from it.
 *
 * On a plain 0 to 1439 axis, going to bed at 23:50 one night and 00:10 the next looks
 * like a twenty-three hour swing, so the spread of an extremely regular sleeper reads
 * as chaos. Late evening is folded to negative minutes so those two nights sit twenty
 * minutes apart, which is what they are.
 */
export function bedAxis(bedMinutes: number): number {
  return bedMinutes >= 720 ? bedMinutes - 1440 : bedMinutes;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function meanOf(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export type SleepBand = { min: number; max: number };

export async function sleepBand(): Promise<SleepBand> {
  const goals = await loadTrackerGoals();
  return { min: goals.sleepMinMinutes, max: goals.sleepMaxMinutes };
}

export function inBand(minutes: number, band: SleepBand): boolean {
  return minutes >= band.min && minutes <= band.max;
}

export type SleepNight = {
  date: string;
  bedMinutes: number;
  wakeMinutes: number;
  minutes: number;
  quality: number | null;
  note: string;
  inBand: boolean;
};

export function shapeNight(
  doc: { date: Date; bedMinutes: number; wakeMinutes: number; minutes: number; quality?: number | null; note?: string },
  band: SleepBand,
): SleepNight {
  return {
    date: iso(doc.date),
    bedMinutes: doc.bedMinutes,
    wakeMinutes: doc.wakeMinutes,
    minutes: doc.minutes,
    quality: doc.quality ?? null,
    note: doc.note ?? "",
    inBand: inBand(doc.minutes, band),
  };
}

/**
 * Everything the sleep view shows about a window of nights.
 *
 * `logged` and the averages are over nights that exist. `nights` covers the whole
 * window including the gaps, because a missing night is the point of a sleep chart:
 * a run of blanks is the finding, not an absence of one.
 */
export async function sleepSummary(todayIso: string, days: number) {
  const band = await sleepBand();
  const end = Date.parse(todayIso + "T00:00:00Z");
  const start = end - (days - 1) * DAY;

  const docs = await SleepEntry.find({ date: { $gte: new Date(start), $lte: new Date(end) } }).sort({ date: 1 });
  const byDate = new Map(docs.map((d) => [iso(d.date), d]));

  const nights: (SleepNight | { date: string; minutes: null })[] = [];
  for (let t = start; t <= end; t += DAY) {
    const key = iso(new Date(t));
    const doc = byDate.get(key);
    nights.push(doc ? shapeNight(doc, band) : { date: key, minutes: null });
  }

  const durations = docs.map((d) => d.minutes);
  const qualities = docs.map((d) => d.quality).filter((q): q is number => typeof q === "number");
  const avgMinutes = meanOf(durations);
  const bedSpread = stdDev(docs.map((d) => bedAxis(d.bedMinutes)));
  const avgBedAxis = meanOf(docs.map((d) => bedAxis(d.bedMinutes)));
  const avgWake = meanOf(docs.map((d) => d.wakeMinutes));

  // Nights in a row, counted back from today. Today not being logged yet is not a
  // broken streak at nine in the morning, so the count may start at yesterday.
  let streak = 0;
  for (let t = end; t >= start; t -= DAY) {
    const key = iso(new Date(t));
    if (byDate.has(key)) streak++;
    else if (key !== todayIso) break;
  }

  return {
    band,
    days,
    logged: docs.length,
    nights,
    avgMinutes: avgMinutes === null ? null : Math.round(avgMinutes),
    /** Spread of bedtimes in minutes. Lower is a more regular sleeper. */
    bedSpread: bedSpread === null ? null : Math.round(bedSpread),
    avgBedMinutes: avgBedAxis === null ? null : Math.round((avgBedAxis + 1440) % 1440),
    avgWakeMinutes: avgWake === null ? null : Math.round(avgWake),
    avgQuality: qualities.length === 0 ? null : Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10,
    inBandCount: durations.filter((m) => inBand(m, band)).length,
    shortest: durations.length ? Math.min(...durations) : null,
    longest: durations.length ? Math.max(...durations) : null,
    streak,
  };
}
