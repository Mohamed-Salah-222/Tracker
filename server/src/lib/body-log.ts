import { WeightEntry } from "../models/WeightEntry";
import { BODY_METRICS, METRIC_KEYS, OPTIONAL_KEYS, derivedMass, readMetric } from "./body-metrics";

const iso = (d: Date) => d.toISOString().slice(0, 10);

type EntryDoc = InstanceType<typeof WeightEntry>;

export type ShapedEntry = Record<string, unknown> & { _id: string; date: string; weightKg: number };

/** One reading, with the two numbers worked out from it rather than stored twice. */
export function shapeEntry(doc: EntryDoc): ShapedEntry {
  const out: Record<string, unknown> = { _id: String(doc._id), date: iso(doc.date), note: doc.note ?? "" };
  for (const key of METRIC_KEYS) out[key] = (doc.get(key) as number | null) ?? null;
  const { fatKg, leanKg } = derivedMass(doc.weightKg, doc.fatPct);
  out.fatKg = fatKg;
  out.leanKg = leanKg;
  return out as ShapedEntry;
}

export type WriteResult = { ok: true; doc: EntryDoc } | { ok: false; error: string };

/**
 * Apply a request body to an entry.
 *
 * Shared by the body log and the older /calories/weight endpoints, which write the
 * same collection. Two write paths for one collection is how the InBody fields ended
 * up unreachable in the first place: the model had them and the only route that
 * existed silently dropped them.
 */
export function applyMeasurements(doc: EntryDoc, body: Record<string, unknown>, { requireWeight }: { requireWeight: boolean }): WriteResult {
  if (requireWeight || body.weightKg !== undefined) {
    const weight = readMetric("weightKg", body.weightKg);
    if (!weight.ok) return { ok: false, error: weight.error };
    if (typeof weight.value !== "number") return { ok: false, error: "a weight is required" };
    doc.weightKg = weight.value;
  }

  for (const key of OPTIONAL_KEYS) {
    const read = readMetric(key, body[key]);
    if (!read.ok) return { ok: false, error: read.error };
    if (read.value === undefined) continue;
    doc.set(key, read.value);
  }

  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") return { ok: false, error: "note must be a string" };
    doc.note = typeof body.note === "string" ? body.note.trim().slice(0, 400) : "";
  }
  return { ok: true, doc };
}

/** The change between two readings of the same measurement, and whether that is progress. */
function deltaOf(key: string, from: number | null, to: number | null) {
  if (from === null || to === null) return null;
  const metric = BODY_METRICS.find((m) => m.key === key);
  const change = Math.round((to - from) * 100) / 100;
  const better = metric?.better ?? null;
  return { change, good: change === 0 || better === null ? null : better === "down" ? change < 0 : change > 0 };
}

/**
 * The whole board: every measurement's latest value, its history, and how far it has
 * moved over the usual windows.
 *
 * A measurement nobody has ever recorded is reported as tracked: false rather than
 * left out, so the form can offer it without the page having to know the list.
 */
export async function bodySummary(todayIso: string) {
  const docs = await WeightEntry.find({ deletedAt: null }).sort({ date: 1 });
  const entries = docs.map(shapeEntry);
  const today = Date.parse(todayIso + "T00:00:00Z");

  /** The last reading at or before a cutoff, which is what "30 days ago" has to mean. */
  const valueAt = (key: string, cutoff: number): number | null => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const at = Date.parse(entries[i].date + "T00:00:00Z");
      if (at > cutoff) continue;
      const v = entries[i][key] as number | null;
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };

  const metrics = BODY_METRICS.map((metric) => {
    const points = entries.filter((e) => typeof e[metric.key] === "number").map((e) => ({ date: e.date, value: e[metric.key] as number }));
    const latest = points.length ? points[points.length - 1] : null;
    const first = points.length ? points[0] : null;

    return {
      ...metric,
      tracked: points.length > 0,
      readings: points.length,
      latest,
      first,
      points,
      deltas: {
        week: latest ? deltaOf(metric.key, valueAt(metric.key, today - 7 * 86_400_000), latest.value) : null,
        month: latest ? deltaOf(metric.key, valueAt(metric.key, today - 30 * 86_400_000), latest.value) : null,
        quarter: latest ? deltaOf(metric.key, valueAt(metric.key, today - 90 * 86_400_000), latest.value) : null,
        all: latest && first ? deltaOf(metric.key, first.value, latest.value) : null,
      },
    };
  });

  return { entries: [...entries].reverse(), metrics, count: entries.length };
}
