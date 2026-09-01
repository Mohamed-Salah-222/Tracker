import { Router } from "express";
import { SleepEntry, nightMinutes } from "../models/SleepEntry";
import { TrackerGoals } from "../models/TrackerGoals";
import { iso, sleepBand, sleepSummary, shapeNight } from "../lib/sleep";
import { isFiniteNumber, parseDayUTC } from "../lib/validation";

const router = Router();

const todayFrom = (v: unknown) => iso(parseDayUTC(v) ?? new Date());

/** Minutes past midnight, as a whole number inside a single day. */
function readClock(v: unknown): number | null {
  if (typeof v === "string") {
    // "23:30" from a time input, which is what the form sends.
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    return Number(m[1]) < 24 && Number(m[2]) < 60 ? mins : null;
  }
  if (!isFiniteNumber(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n <= 1439 ? n : null;
}

// =====================================================================
// GET /sleep?today=&days=30
// The window the chart draws, gaps included.
// =====================================================================
router.get("/", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  res.json(await sleepSummary(todayFrom(req.query.today), days));
});

/** One night, or null when it was not logged. */
router.get("/day", async (req, res) => {
  const date = parseDayUTC(req.query.date);
  if (!date) return res.status(400).json({ error: "a date is required" });
  const doc = await SleepEntry.findOne({ date });
  res.json(doc ? shapeNight(doc, await sleepBand()) : null);
});

// =====================================================================
// PUT /sleep/day
// One night per morning, so this is an upsert rather than a create. Logging the
// same night twice is a correction, not a second night.
// =====================================================================
router.put("/day", async (req, res) => {
  const date = parseDayUTC(req.body?.date);
  if (!date) return res.status(400).json({ error: "a date is required" });

  const bedMinutes = readClock(req.body?.bedMinutes ?? req.body?.bedTime);
  const wakeMinutes = readClock(req.body?.wakeMinutes ?? req.body?.wakeTime);
  if (bedMinutes === null || wakeMinutes === null) return res.status(400).json({ error: "a bed time and a wake time are required" });
  if (nightMinutes(bedMinutes, wakeMinutes) === 0) return res.status(400).json({ error: "the wake time cannot be the same as the bed time" });

  const rawQuality = req.body?.quality;
  let quality: number | null = null;
  if (rawQuality !== null && rawQuality !== undefined && rawQuality !== "") {
    if (!isFiniteNumber(rawQuality) || rawQuality < 1 || rawQuality > 5) return res.status(400).json({ error: "quality runs from 1 to 5" });
    quality = Math.round(rawQuality);
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 400) : "";

  const doc = (await SleepEntry.findOne({ date })) ?? new SleepEntry({ date });
  doc.bedMinutes = bedMinutes;
  doc.wakeMinutes = wakeMinutes;
  doc.quality = quality;
  doc.note = note;
  await doc.save();

  res.json(shapeNight(doc, await sleepBand()));
});

router.delete("/day", async (req, res) => {
  const date = parseDayUTC(req.query.date);
  if (!date) return res.status(400).json({ error: "a date is required" });
  const doc = await SleepEntry.findOneAndDelete({ date });
  if (!doc) return res.status(404).json({ error: "nothing logged for that night" });
  res.json({ ok: true });
});

// =====================================================================
// PATCH /sleep/band
// The 6 to 8 hours that used to be spelled out in a habit label.
// =====================================================================
router.patch("/band", async (req, res) => {
  const min = readClock(req.body?.min ?? req.body?.sleepMinMinutes);
  const max = readClock(req.body?.max ?? req.body?.sleepMaxMinutes);
  if (min === null || max === null) return res.status(400).json({ error: "a shortest and a longest night are required" });
  if (min > max) return res.status(400).json({ error: "the shortest night cannot be longer than the longest" });

  const goals = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));
  goals.sleepMinMinutes = min;
  goals.sleepMaxMinutes = max;
  await goals.save();
  res.json({ min, max });
});

export default router;
