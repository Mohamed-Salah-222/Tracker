import { Schema, model } from "mongoose";
import { enforceSingleton } from "../lib/schema-guards";
import { rehomeSettings } from "../lib/settings-migrate";

/**
 * Everything the app is configured to be.
 *
 * Before this there was no settings system, only five unrelated ones: two singleton
 * documents, a habit collection, and six localStorage keys holding preferences that
 * should follow the person rather than the browser. A row hidden on the laptop was
 * still there on the phone, and the rest timer had to be turned off twice.
 *
 * One document, read once at startup. When this becomes multi-user it gains an owner
 * and nothing else about it changes.
 */
export const MODULE_KEYS = [
  "tasks",
  "journal",
  "sleep",
  "calories",
  "foods",
  "kitchen",
  "workout",
  "body",
  "goals",
  "income",
  "payments",
  "badges",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Presets are shortcuts that set the switches below, never a separate mode. There is
 * one piece of state to reason about: which modules are on.
 */
export const PRESETS: Record<"simple" | "standard" | "everything", ModuleKey[]> = {
  simple: ["tasks"],
  standard: ["tasks", "journal", "sleep", "calories", "foods", "goals", "badges"],
  everything: [...MODULE_KEYS],
};

export const THEMES = ["system", "light", "dark"] as const;
export const FONTS = ["geist", "system", "serif", "mono"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const ACCENTS = ["mono", "blue", "green", "amber", "violet"] as const;

const settingsSchema = new Schema(
  {
    /** Which parts of the app exist. Off hides a module everywhere and deletes nothing. */
    modules: {
      type: Map,
      of: Boolean,
      default: () => new Map(MODULE_KEYS.map((key) => [key, true])),
    },
    /** Sidebar order, by module key or page url. Anything unlisted keeps its natural place. */
    navOrder: { type: [String], default: [] },

    appearance: {
      theme: { type: String, enum: THEMES, default: "system" },
      font: { type: String, enum: FONTS, default: "geist" },
      density: { type: String, enum: DENSITIES, default: "comfortable" },
      /**
       * Used only for the filled "done" state. The palette is otherwise monochrome on
       * purpose: every state in this app is told apart by weight, and hues everywhere
       * would break that language rather than extend it.
       */
      accent: { type: String, enum: ACCENTS, default: "mono" },
    },

    week: {
      /** 0 is Sunday, matching getUTCDay. */
      startsOn: { type: Number, default: 6, min: 0, max: 6 },
      /**
       * Which days are the weekend. Was hardcoded to Saturday and Sunday, which is
       * wrong in Cairo: the Work row auto-excused Sundays and marked Fridays missed.
       */
      weekendDays: { type: [Number], default: [5, 6] },
    },

    dashboard: {
      /** Habit keys hidden from the grid. Was a localStorage list, so it was per browser. */
      hiddenRows: { type: [String], default: [] },
    },

    workout: {
      restTimerEnabled: { type: Boolean, default: false },
      restSeconds: { type: Number, default: 90, min: 10, max: 900 },
    },

    /**
     * The nudges the app works out for itself, each one switchable.
     *
     * Separate from the reminders you write, because these have no row to delete:
     * turning one off is the only way to stop it, and it should not require deleting
     * the subscription it was warning you about.
     */
    autoReminders: {
      subscription: { type: Boolean, default: true },
      goal: { type: Boolean, default: true },
      kitchen: { type: Boolean, default: true },
      overdue: { type: Boolean, default: true },
    },

    /**
     * Hours when the app says nothing.
     *
     * Only the automatic nudges are held: a reminder you set yourself, at a time you
     * chose, fires when you said it would. You cannot accidentally schedule an
     * automatic one for three in the morning, and if you deliberately set one there,
     * the app is not going to argue.
     */
    quietHours: {
      enabled: { type: Boolean, default: false },
      from: { type: String, default: "22:00" },
      to: { type: String, default: "07:00" },
    },

    /**
     * Several automatic nudges at once arrive as one notification rather than four.
     * Aggressive defaults are the single most common complaint about this kind of app,
     * and four buzzes in a second is how an app teaches you to turn it off.
     */
    digestAuto: { type: Boolean, default: true },

    /** When the last export was taken, so the page can say how stale the backup is. */
    lastExportAt: { type: Date, default: null },

    /** Set once the browser's old localStorage preferences have been folded in. */
    migratedLocal: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// The weekend has to be real days, and a week has to start on one.
settingsSchema.pre("validate", function () {
  if (!this.week) return;
  const days = (this.week.weekendDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  this.week.weekendDays = [...new Set(days)].sort();
});

enforceSingleton(settingsSchema, "Settings");

/**
 * Explicit collection name. Mongoose would pluralise this model to "settings", and a
 * document is already sitting there that this codebase has no model or reference for:
 * monthlyTargetUSD, usdToLE, weekday and weekend targets. Writing into it added this
 * app fields to somebody else document, which lib/settings-migrate.ts undoes.
 *
 * The same mistake has now been made three times in this database, with "habits" and
 * with "goals" twice. Name the collection.
 */
export const Settings = model("Settings", settingsSchema, "appsettings");

export type SettingsValues = {
  modules: Record<ModuleKey, boolean>;
  navOrder: string[];
  appearance: { theme: string; font: string; density: string; accent: string };
  week: { startsOn: number; weekendDays: number[] };
  dashboard: { hiddenRows: string[] };
  autoReminders: Record<string, boolean>;
  quietHours: { enabled: boolean; from: string; to: string };
  digestAuto: boolean;
  workout: { restTimerEnabled: boolean; restSeconds: number };
  lastExportAt: string | null;
  migratedLocal: boolean;
};

/** Reads the singleton, creating it with defaults the first time. */
export async function loadSettings(): Promise<SettingsValues> {
  await rehomeSettings();
  const doc = (await Settings.findOne()) ?? (await Settings.create({}));
  const modules = Object.fromEntries(MODULE_KEYS.map((key) => [key, doc.modules?.get(key) ?? true])) as Record<ModuleKey, boolean>;
  return {
    modules,
    navOrder: doc.navOrder ?? [],
    appearance: {
      theme: doc.appearance?.theme ?? "system",
      font: doc.appearance?.font ?? "geist",
      density: doc.appearance?.density ?? "comfortable",
      accent: doc.appearance?.accent ?? "mono",
    },
    week: { startsOn: doc.week?.startsOn ?? 6, weekendDays: doc.week?.weekendDays ?? [5, 6] },
    dashboard: { hiddenRows: doc.dashboard?.hiddenRows ?? [] },
    autoReminders: {
      subscription: doc.autoReminders?.subscription !== false,
      goal: doc.autoReminders?.goal !== false,
      kitchen: doc.autoReminders?.kitchen !== false,
      overdue: doc.autoReminders?.overdue !== false,
    },
    quietHours: {
      enabled: doc.quietHours?.enabled ?? false,
      from: doc.quietHours?.from ?? "22:00",
      to: doc.quietHours?.to ?? "07:00",
    },
    digestAuto: doc.digestAuto !== false,
    workout: { restTimerEnabled: doc.workout?.restTimerEnabled ?? false, restSeconds: doc.workout?.restSeconds ?? 90 },
    lastExportAt: doc.lastExportAt ? doc.lastExportAt.toISOString() : null,
    migratedLocal: doc.migratedLocal ?? false,
  };
}

/** True when a module is switched on. Everything server-side asks through this. */
export function moduleOn(settings: SettingsValues, key: ModuleKey): boolean {
  return settings.modules[key] !== false;
}
