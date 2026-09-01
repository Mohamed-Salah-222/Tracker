import { AxiosError } from "axios";
import { api } from "./api";

export type SleepNight = {
  date: string;
  bedMinutes: number;
  wakeMinutes: number;
  minutes: number;
  quality: number | null;
  note: string;
  inBand: boolean;
};

export type SleepGap = { date: string; minutes: null };

export type SleepSummary = {
  band: { min: number; max: number };
  days: number;
  logged: number;
  nights: (SleepNight | SleepGap)[];
  avgMinutes: number | null;
  /** Spread of bedtimes in minutes. Lower is a more regular sleeper. */
  bedSpread: number | null;
  avgBedMinutes: number | null;
  avgWakeMinutes: number | null;
  avgQuality: number | null;
  inBandCount: number;
  shortest: number | null;
  longest: number | null;
  streak: number;
};

export const isNight = (n: SleepNight | SleepGap): n is SleepNight => n.minutes !== null;

/** "7h 20m". Durations are never shown as a decimal number of hours. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "23:30" from 1410, which is also the value a time input wants. */
export function clockLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** How far apart two bedtimes are, in words, given the spread in minutes. */
export function regularityLabel(spread: number | null): string {
  if (spread === null) return "not enough nights";
  if (spread <= 20) return "very regular";
  if (spread <= 45) return "fairly regular";
  if (spread <= 90) return "drifting";
  return "all over the place";
}

export const QUALITY_LABELS = ["", "awful", "poor", "ok", "good", "great"];

export function sleepError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function loadSleep(today: string, days = 30): Promise<SleepSummary> {
  const r = await api.get<SleepSummary>("/sleep", { params: { today, days } });
  return r.data;
}

export async function loadNight(date: string): Promise<SleepNight | null> {
  const r = await api.get<SleepNight | null>("/sleep/day", { params: { date } });
  return r.data;
}

export async function saveNight(body: { date: string; bedTime: string; wakeTime: string; quality: number | null; note: string }): Promise<SleepNight> {
  const r = await api.put<SleepNight>("/sleep/day", body);
  return r.data;
}

export async function deleteNight(date: string): Promise<void> {
  await api.delete("/sleep/day", { params: { date } });
}
