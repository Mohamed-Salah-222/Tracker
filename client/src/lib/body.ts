import { AxiosError } from "axios";
import { api } from "./api";

/**
 * The measurement list is fetched, not hardcoded.
 *
 * The server owns which measurements exist, their units and their sane ranges, so a
 * new one appears in the form and the charts without the client being told about it.
 */
export type BodyMetric = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  group: "core" | "composition" | "tape";
  better: "down" | "up" | null;
};

export type MetricPoint = { date: string; value: number };

export type Delta = { change: number; good: boolean | null } | null;

export type MetricView = BodyMetric & {
  tracked: boolean;
  readings: number;
  latest: MetricPoint | null;
  first: MetricPoint | null;
  points: MetricPoint[];
  deltas: { week: Delta; month: Delta; quarter: Delta; all: Delta };
};

export type BodyEntry = {
  _id: string;
  date: string;
  note: string;
  weightKg: number;
  fatKg: number | null;
  leanKg: number | null;
} & Record<string, string | number | null>;

export type BodySummary = {
  entries: BodyEntry[];
  metrics: MetricView[];
  count: number;
  goal: { _id: string; targetKg: number };
};

export const GROUP_LABEL: Record<BodyMetric["group"], string> = {
  core: "Weight",
  composition: "Body composition",
  tape: "Tape measurements",
};

export function bodyError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function loadBody(today: string): Promise<BodySummary> {
  const r = await api.get<BodySummary>("/body", { params: { today } });
  return r.data;
}

export async function loadMetrics(): Promise<BodyMetric[]> {
  const r = await api.get<BodyMetric[]>("/body/metrics");
  return r.data;
}

export async function saveReading(body: Record<string, unknown>): Promise<BodyEntry> {
  const r = await api.post<BodyEntry>("/body", body);
  return r.data;
}

export async function patchReading(id: string, body: Record<string, unknown>): Promise<BodyEntry> {
  const r = await api.patch<BodyEntry>(`/body/${id}`, body);
  return r.data;
}

export async function deleteReading(id: string): Promise<void> {
  await api.delete(`/body/${id}`);
}

export const fmtValue = (v: number, m: { decimals: number; unit: string }) => `${v.toFixed(m.decimals)}${m.unit === "%" ? "" : " "}${m.unit}`;

/** "-1.5 kg" with the sign kept, because the direction is the whole message. */
export function fmtDelta(d: Delta, metric: { decimals: number; unit: string }): string | null {
  if (!d) return null;
  if (d.change === 0) return "no change";
  const sign = d.change > 0 ? "+" : "-";
  return `${sign}${Math.abs(d.change).toFixed(metric.decimals)}${metric.unit === "%" ? "" : " "}${metric.unit}`;
}
