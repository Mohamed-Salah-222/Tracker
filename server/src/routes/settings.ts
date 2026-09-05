import { Router } from "express";
import { ACCENTS, DENSITIES, FONTS, MODULE_KEYS, PRESETS, Settings, THEMES, loadSettings, type ModuleKey } from "../models/Settings";

const router = Router();

/**
 * A 24-hour wall clock, checked by parsing rather than by a pattern.
 *
 * An anchored regex in this codebase has lost its backslashes to a patch script four
 * times now, and a broken one either rejects every real time or accepts anything.
 */
function isClock(v: unknown): v is string {
  if (typeof v !== "string" || v.length !== 5 || v[2] !== ":") return false;
  const hours = Number(v.slice(0, 2));
  const minutes = Number(v.slice(3));
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

const isOneOf = (list: readonly string[], v: unknown): v is string => typeof v === "string" && list.includes(v);

router.get("/", async (_req, res) => {
  res.json({ ...(await loadSettings()), moduleKeys: MODULE_KEYS, presets: PRESETS });
});

// =====================================================================
// PATCH /settings
//
// Every section is optional and merged, so a page can save the one thing it changed
// without holding a full copy of the document and writing back a stale rest of it.
// =====================================================================
router.patch("/", async (req, res) => {
  const doc = (await Settings.findOne()) ?? (await Settings.create({}));
  const body = req.body ?? {};

  if (body.modules !== undefined) {
    if (typeof body.modules !== "object" || body.modules === null) return res.status(400).json({ error: "modules must be an object" });
    for (const [key, on] of Object.entries(body.modules)) {
      if (!(MODULE_KEYS as readonly string[]).includes(key)) return res.status(400).json({ error: `unknown module: ${key}` });
      if (typeof on !== "boolean") return res.status(400).json({ error: `${key} must be true or false` });
      doc.modules.set(key, on);
    }
  }

  // A preset is applied here rather than in the client so every caller gets the same
  // answer to "what does Simple mean".
  if (body.preset !== undefined) {
    const preset = PRESETS[body.preset as keyof typeof PRESETS];
    if (!preset) return res.status(400).json({ error: "unknown preset" });
    for (const key of MODULE_KEYS) doc.modules.set(key, preset.includes(key));
  }

  if (body.navOrder !== undefined) {
    if (!Array.isArray(body.navOrder) || body.navOrder.some((v: unknown) => typeof v !== "string")) {
      return res.status(400).json({ error: "navOrder must be a list of keys" });
    }
    doc.navOrder = body.navOrder.slice(0, 40);
  }

  if (body.appearance !== undefined && doc.appearance) {
    const appearance = doc.appearance;
    const a = body.appearance ?? {};
    if (a.theme !== undefined && !isOneOf(THEMES, a.theme)) return res.status(400).json({ error: "unknown theme" });
    if (a.font !== undefined && !isOneOf(FONTS, a.font)) return res.status(400).json({ error: "unknown font" });
    if (a.density !== undefined && !isOneOf(DENSITIES, a.density)) return res.status(400).json({ error: "unknown density" });
    if (a.accent !== undefined && !isOneOf(ACCENTS, a.accent)) return res.status(400).json({ error: "unknown accent" });
    if (a.theme !== undefined) appearance.theme = a.theme;
    if (a.font !== undefined) appearance.font = a.font;
    if (a.density !== undefined) appearance.density = a.density;
    if (a.accent !== undefined) appearance.accent = a.accent;
  }

  if (body.week !== undefined && doc.week) {
    const week = doc.week;
    const w = body.week ?? {};
    if (w.startsOn !== undefined) {
      if (!Number.isInteger(w.startsOn) || w.startsOn < 0 || w.startsOn > 6) return res.status(400).json({ error: "startsOn must be a day of the week" });
      week.startsOn = w.startsOn;
    }
    if (w.weekendDays !== undefined) {
      if (!Array.isArray(w.weekendDays) || w.weekendDays.some((d: unknown) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) {
        return res.status(400).json({ error: "weekendDays must be days of the week" });
      }
      if (w.weekendDays.length > 6) return res.status(400).json({ error: "at least one day has to be a working day" });
      week.weekendDays = w.weekendDays;
    }
  }

  if (body.dashboard?.hiddenRows !== undefined && doc.dashboard) {
    const rows = body.dashboard.hiddenRows;
    if (!Array.isArray(rows) || rows.some((v: unknown) => typeof v !== "string")) return res.status(400).json({ error: "hiddenRows must be a list of habit keys" });
    doc.dashboard.hiddenRows = [...new Set(rows as string[])];
  }

  if (body.workout !== undefined && doc.workout) {
    const workout = doc.workout;
    const w = body.workout ?? {};
    if (w.restTimerEnabled !== undefined) {
      if (typeof w.restTimerEnabled !== "boolean") return res.status(400).json({ error: "restTimerEnabled must be true or false" });
      workout.restTimerEnabled = w.restTimerEnabled;
    }
    if (w.restSeconds !== undefined) {
      if (!Number.isFinite(w.restSeconds) || w.restSeconds < 10 || w.restSeconds > 900) return res.status(400).json({ error: "rest must be between 10 and 900 seconds" });
      workout.restSeconds = Math.round(w.restSeconds);
    }
  }

  if (body.autoReminders !== undefined && doc.autoReminders) {
    const auto = doc.autoReminders as unknown as Record<string, boolean>;
    for (const [key, on] of Object.entries(body.autoReminders as Record<string, unknown>)) {
      if (!["subscription", "goal", "kitchen", "overdue"].includes(key)) return res.status(400).json({ error: `unknown reminder: ${key}` });
      if (typeof on !== "boolean") return res.status(400).json({ error: `${key} must be true or false` });
      auto[key] = on;
    }
  }

  if (body.quietHours !== undefined && doc.quietHours) {
    const q = body.quietHours as { enabled?: unknown; from?: unknown; to?: unknown };
    if (q.enabled !== undefined) {
      if (typeof q.enabled !== "boolean") return res.status(400).json({ error: "quiet hours must be on or off" });
      doc.quietHours.enabled = q.enabled;
    }
    for (const edge of ["from", "to"] as const) {
      if (q[edge] === undefined) continue;
      if (!isClock(q[edge])) return res.status(400).json({ error: `quiet hours ${edge} must be a time like 22:00` });
      doc.quietHours[edge] = q[edge] as string;
    }
    // A window from a time to the same time is either nothing or everything, and
    // nobody who typed it meant everything.
    if (doc.quietHours.from === doc.quietHours.to) return res.status(400).json({ error: "quiet hours need a start and an end that differ" });
  }

  if (body.digestAuto !== undefined) {
    if (typeof body.digestAuto !== "boolean") return res.status(400).json({ error: "digest must be true or false" });
    doc.digestAuto = body.digestAuto;
  }

  if (body.migratedLocal === true) doc.migratedLocal = true;

  try {
    await doc.save();
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "could not save settings" });
  }
  res.json({ ...(await loadSettings()), moduleKeys: MODULE_KEYS, presets: PRESETS });
});

/** Which modules are on, as a bare list. Used by the nav before anything else loads. */
router.get("/modules", async (_req, res) => {
  const settings = await loadSettings();
  res.json(MODULE_KEYS.filter((key: ModuleKey) => settings.modules[key]));
});

export default router;
