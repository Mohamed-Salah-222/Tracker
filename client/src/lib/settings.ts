import { AxiosError } from "axios";
import { api } from "./api";

export const MODULE_KEYS = ["tasks", "journal", "sleep", "calories", "foods", "kitchen", "workout", "body", "goals", "income", "payments", "badges"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type Theme = "system" | "light" | "dark";
export type Font = "geist" | "system" | "serif" | "mono";
export type Density = "comfortable" | "compact";
export type Accent = "mono" | "blue" | "green" | "amber" | "violet";

export type Settings = {
  modules: Record<ModuleKey, boolean>;
  navOrder: string[];
  appearance: { theme: Theme; font: Font; density: Density; accent: Accent };
  week: { startsOn: number; weekendDays: number[] };
  dashboard: { hiddenRows: string[] };
  autoReminders: Record<string, boolean>;
  /** Only the worked-out nudges are held. One you set yourself fires when you said. */
  quietHours: { enabled: boolean; from: string; to: string };
  /** Several worked-out nudges at once arrive as one notification. */
  digestAuto: boolean;
  workout: { restTimerEnabled: boolean; restSeconds: number };
  lastExportAt: string | null;
  migratedLocal: boolean;
};

export type SettingsPatch = {
  modules?: Partial<Record<ModuleKey, boolean>>;
  preset?: "simple" | "standard" | "everything";
  navOrder?: string[];
  appearance?: Partial<Settings["appearance"]>;
  week?: Partial<Settings["week"]>;
  dashboard?: Partial<Settings["dashboard"]>;
  autoReminders?: Record<string, boolean>;
  quietHours?: Partial<Settings["quietHours"]>;
  digestAuto?: boolean;
  workout?: Partial<Settings["workout"]>;
  migratedLocal?: boolean;
};

/** What the app looks like before the server has answered. Matches the model's defaults. */
export const DEFAULT_SETTINGS: Settings = {
  modules: Object.fromEntries(MODULE_KEYS.map((k) => [k, true])) as Record<ModuleKey, boolean>,
  navOrder: [],
  appearance: { theme: "system", font: "geist", density: "comfortable", accent: "mono" },
  week: { startsOn: 6, weekendDays: [5, 6] },
  dashboard: { hiddenRows: [] },
  autoReminders: { subscription: true, goal: true, kitchen: true, overdue: true },
  quietHours: { enabled: false, from: "22:00", to: "07:00" },
  digestAuto: true,
  workout: { restTimerEnabled: false, restSeconds: 90 },
  lastExportAt: null,
  migratedLocal: false,
};

export function settingsError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function fetchSettings(): Promise<Settings> {
  const r = await api.get<Settings>("/settings");
  return r.data;
}

export async function patchSettings(patch: SettingsPatch): Promise<Settings> {
  const r = await api.patch<Settings>("/settings", patch);
  return r.data;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The keys this browser used to keep preferences under, and which field each becomes.
 *
 * A settings page that starts from defaults would silently undo choices already made,
 * so the first load folds whatever is here into the document and then leaves these
 * keys alone forever.
 */
const LEGACY_KEYS = {
  hiddenRows: "lifetracker.dashboard.hiddenRows.v1",
  restSeconds: "workout:rest-seconds",
  restEnabled: "workout:rest-timer-enabled",
} as const;

export function readLegacyLocal(): SettingsPatch | null {
  const patch: SettingsPatch = {};
  try {
    const rows = localStorage.getItem(LEGACY_KEYS.hiddenRows);
    if (rows) {
      const parsed = JSON.parse(rows);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string") && parsed.length > 0) patch.dashboard = { hiddenRows: parsed };
    }
  } catch {
    /* a corrupt value is simply not migrated */
  }
  try {
    const seconds = Number(localStorage.getItem(LEGACY_KEYS.restSeconds));
    const enabled = localStorage.getItem(LEGACY_KEYS.restEnabled);
    const workout: Partial<Settings["workout"]> = {};
    if (Number.isFinite(seconds) && seconds >= 10 && seconds <= 900) workout.restSeconds = Math.round(seconds);
    if (enabled === "1" || enabled === "0") workout.restTimerEnabled = enabled === "1";
    if (Object.keys(workout).length > 0) patch.workout = workout;
  } catch {
    /* same */
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
