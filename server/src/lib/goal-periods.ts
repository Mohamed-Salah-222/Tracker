// Period keys for goals.
//
// A week is keyed by the date of its Monday rather than an ISO week number: it sorts
// correctly, never disagrees with itself across a year boundary, and renders as a
// date without anyone needing a lookup table.
export type Horizon = "lifetime" | "monthly" | "weekly" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * The start of the week a day belongs to.
 *
 * Which day a week starts on is a setting, so this takes it rather than assuming.
 * Existing weekly goals are unaffected: their period is stored as the date the week
 * began, not as an index, so an old key still describes the same seven days.
 */
export function weekKeyOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function periodKeyFor(horizon: Horizon, iso: string): string | null {
  if (horizon === "monthly") return monthKeyOf(iso);
  if (horizon === "weekly") return weekKeyOf(iso);
  return null;
}

const dayFmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function isValidPeriodKey(horizon: Horizon, key: unknown): boolean {
  // A custom range carries dates instead of a key, so there is nothing to check here.
  if (horizon === "lifetime" || horizon === "custom") return key === null || key === undefined;
  if (typeof key !== "string") return false;
  if (horizon === "monthly") return /^\d{4}-\d{2}$/.test(key);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && weekKeyOf(key) === key;
}

/** How a period reads on screen. */
export function periodLabel(horizon: Horizon, key: string | null, range?: { start: string; end: string } | null): string {
  if (horizon === "custom") return range ? `${dayFmt(range.start)} to ${dayFmt(range.end)}` : "No end date";
  if (horizon === "lifetime" || !key) return "No end date";
  if (horizon === "monthly") {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const start = new Date(key + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} to ${fmt(end)}`;
}

/** Inclusive first and last day of a period, for "days left". */
export function periodBounds(horizon: Horizon, key: string | null, range?: { start: string; end: string } | null): { start: string; end: string } | null {
  if (horizon === "custom") return range ?? null;
  if (horizon === "lifetime" || !key) return null;
  if (horizon === "monthly") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    return { start: `${key}-01`, end: `${y}-${pad(m)}-${pad(last.getUTCDate())}` };
  }
  const start = new Date(key + "T00:00:00Z");
  return { start: key, end: new Date(start.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) };
}
