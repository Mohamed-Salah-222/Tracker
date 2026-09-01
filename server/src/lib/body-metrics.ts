/**
 * Everything the body log measures, in one table.
 *
 * The weigh-in used to be a single number with four InBody fields on the model that
 * no route ever read and no form ever offered, so a reading that measured fat, muscle
 * and water could only be stored as its weight. Adding a measurement is a row here:
 * validation, the form and the charts are all generated from this list, and the
 * client fetches it rather than keeping a second copy that could drift.
 */
export type BodyMetric = {
  key: string;
  label: string;
  unit: string;
  /** Rejected outside this range, which catches a decimal point in the wrong place. */
  min: number;
  max: number;
  decimals: number;
  group: "core" | "composition" | "tape";
  /** Which way is progress, for the arrow next to a change. Null when it depends. */
  better: "down" | "up" | null;
};

export const BODY_METRICS: BodyMetric[] = [
  { key: "weightKg", label: "Weight", unit: "kg", min: 20, max: 400, decimals: 1, group: "core", better: null },

  { key: "fatPct", label: "Body fat", unit: "%", min: 1, max: 70, decimals: 1, group: "composition", better: "down" },
  { key: "musclePct", label: "Muscle", unit: "%", min: 1, max: 90, decimals: 1, group: "composition", better: "up" },
  { key: "waterPct", label: "Water", unit: "%", min: 1, max: 90, decimals: 1, group: "composition", better: null },
  { key: "boneKg", label: "Bone", unit: "kg", min: 0.5, max: 10, decimals: 2, group: "composition", better: null },

  { key: "neckCm", label: "Neck", unit: "cm", min: 20, max: 80, decimals: 1, group: "tape", better: null },
  { key: "chestCm", label: "Chest", unit: "cm", min: 50, max: 200, decimals: 1, group: "tape", better: "up" },
  { key: "waistCm", label: "Waist", unit: "cm", min: 40, max: 200, decimals: 1, group: "tape", better: "down" },
  { key: "hipsCm", label: "Hips", unit: "cm", min: 50, max: 200, decimals: 1, group: "tape", better: "down" },
  { key: "armCm", label: "Arm", unit: "cm", min: 15, max: 80, decimals: 1, group: "tape", better: "up" },
  { key: "thighCm", label: "Thigh", unit: "cm", min: 25, max: 120, decimals: 1, group: "tape", better: "up" },
  { key: "calfCm", label: "Calf", unit: "cm", min: 15, max: 80, decimals: 1, group: "tape", better: "up" },
];

export const METRIC_KEYS = BODY_METRICS.map((m) => m.key);
export const OPTIONAL_KEYS = METRIC_KEYS.filter((k) => k !== "weightKg");

export const metricBy = (key: string): BodyMetric | undefined => BODY_METRICS.find((m) => m.key === key);

/**
 * Read one measurement off a request body.
 *
 * Absent leaves the stored value alone, an explicit null or empty string clears it,
 * and anything outside the metric's range is an error rather than a silent write of
 * a waist of 8 cm.
 */
export type ReadResult = { ok: true; value: number | null | undefined } | { ok: false; error: string };

export function readMetric(key: string, raw: unknown): ReadResult {
  const metric = metricBy(key);
  if (!metric) return { ok: false, error: `unknown measurement: ${key}` };
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };

  const n = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, error: `${metric.label} must be a number` };
  if (n < metric.min || n > metric.max) return { ok: false, error: `${metric.label} looks wrong: ${metric.min} to ${metric.max} ${metric.unit}` };
  return { ok: true, value: Math.round(n * 10 ** metric.decimals) / 10 ** metric.decimals };
}

/**
 * Kilograms of fat and of everything else.
 *
 * A percentage on its own hides the thing you actually care about: losing four kilos
 * while holding the same body fat percentage means muscle went with it, and only the
 * absolute numbers say so.
 */
export function derivedMass(weightKg: number, fatPct: number | null | undefined) {
  if (typeof fatPct !== "number") return { fatKg: null, leanKg: null };
  const fatKg = Math.round(weightKg * fatPct) / 100;
  return { fatKg, leanKg: Math.round((weightKg - fatKg) * 10) / 10 };
}
