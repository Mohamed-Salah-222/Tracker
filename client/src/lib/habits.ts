// Habit definitions. These used to be a hardcoded enum plus three lookup maps
// spread over five files, so adding one meant a code change and a deploy.
import { AxiosError } from "axios";
import { api } from "./api";

export type HabitType = "check" | "count";

export type HabitDef = {
  _id: string;
  key: string;
  label: string;
  description: string;
  icon: string;
  type: HabitType;
  dailyTarget: number;
  unit: string;
  /** 0 means every day of the month. */
  monthlyTarget: number;
  onHabitsPage: boolean;
  order: number;
  archived: boolean;
  /** Set when another page fills this in, which locks how it is measured. */
  derivedFrom: string | null;
};

export function habitError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function listHabits(archived = false): Promise<HabitDef[]> {
  const r = await api.get<HabitDef[]>("/habits", { params: archived ? { archived: "1" } : {} });
  return r.data;
}

/**
 * The icons a habit can wear. Anything the app already uses somewhere, so the set
 * stays recognisable rather than becoming a full icon picker.
 */
export const HABIT_ICONS = [
  "circle-check",
  "pill",
  "hands",
  "moon",
  "footprints",
  "book-open",
  "folder-kanban",
  "languages",
  "dumbbell",
  "list-checks",
  "flame",
  "beef",
  "droplet",
  "briefcase",
  "heart",
  "brain",
  "sun",
  "music",
  "pen-line",
  "bike",
] as const;

/** How a monthly target reads on screen. */
export function monthlyLabel(monthlyTarget: number): string {
  return monthlyTarget > 0 ? `${monthlyTarget} days a month` : "Every day";
}
