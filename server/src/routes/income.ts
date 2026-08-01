import { Router } from "express";
import { Rate } from "../models/Rate";
import { IncomeEntry } from "../models/IncomeEntry";
import { DayStatus } from "../models/DayStatus";
import { monthRange } from "../lib/dates";
import { isNonNegativeNumber, isPositiveNumber, objectIdParam, parseDayUTC } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);

// ===== RATES =====

// Get current active rate
router.get("/rate", async (_req, res) => {
  const rate = await Rate.findOne({ effectiveTo: null }).sort({ effectiveFrom: -1 });
  res.json(rate);
});

// Set a new rate (closes the previous one)
router.post("/rate", async (req, res) => {
  const { ratePerMinute } = req.body;
  if (!isNonNegativeNumber(ratePerMinute)) {
    return res.status(400).json({ error: "ratePerMinute must be a non-negative number" });
  }
  const now = new Date();
  await Rate.updateMany({ effectiveTo: null }, { effectiveTo: now });
  const created = await Rate.create({ ratePerMinute, effectiveFrom: now });
  res.json(created);
});

// ===== ENTRIES =====

// Get all entries for a month + day statuses + month total
router.get("/month", async (req, res) => {
  const year = parseInt(req.query.year as string, 10);
  const month = parseInt(req.query.month as string, 10); // 1-12
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return res.status(400).json({ error: "valid year required" });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "month must be between 1 and 12" });
  }

  const { start, end } = monthRange(year, month);

  const entries = await IncomeEntry.find({
    date: { $gte: start, $lt: end },
    deletedAt: null,
  }).sort({ date: -1, createdAt: -1 });

  const dayStatuses = await DayStatus.find({
    date: { $gte: start, $lt: end },
  });

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  res.json({ entries, dayStatuses, total });
});

// Get entries + statuses for a date range (used for week view)
router.get("/range", async (req, res) => {
  const from = parseDayUTC(req.query.from);
  const toEnd = parseDayUTC(req.query.to);
  if (!from || !toEnd) return res.status(400).json({ error: "valid from and to dates required" });
  toEnd.setUTCDate(toEnd.getUTCDate() + 1); // inclusive

  const entries = await IncomeEntry.find({
    date: { $gte: from, $lt: toEnd },
    deletedAt: null,
  }).sort({ date: 1, createdAt: 1 });

  const dayStatuses = await DayStatus.find({
    date: { $gte: from, $lt: toEnd },
  });

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  res.json({ entries, dayStatuses, total });
});

// Create entry
router.post("/entry", async (req, res) => {
  const { date, minutes } = req.body;
  const day = parseDayUTC(date);
  if (!day || !isPositiveNumber(minutes)) {
    return res.status(400).json({ error: "valid date and positive minutes required" });
  }

  const activeRate = await Rate.findOne({ effectiveTo: null }).sort({ effectiveFrom: -1 });
  if (!activeRate) {
    return res.status(400).json({ error: "Set your rate first" });
  }

  const amount = +(minutes * activeRate.ratePerMinute).toFixed(2);

  // Soft-delete any existing entry for this day
  await IncomeEntry.updateMany({ date: day, deletedAt: null }, { deletedAt: new Date() });

  const entry = await IncomeEntry.create({
    date: day,
    minutes,
    ratePerMinute: activeRate.ratePerMinute,
    amount,
  });
  res.json(entry);
});

// Update entry (re-snapshots amount using stored rate)
router.patch("/entry/:id", async (req, res) => {
  const { minutes, date } = req.body;

  if (minutes !== undefined && !isPositiveNumber(minutes)) {
    return res.status(400).json({ error: "minutes must be a positive number" });
  }
  let day: Date | null = null;
  if (date !== undefined) {
    day = parseDayUTC(date);
    if (!day) return res.status(400).json({ error: "valid date required" });
  }

  const entry = await IncomeEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  if (minutes !== undefined) {
    entry.minutes = minutes;
    entry.amount = +(minutes * entry.ratePerMinute).toFixed(2);
  }
  if (day) entry.date = day;

  await entry.save();
  res.json(entry);
});

// Soft delete
router.delete("/entry/:id", async (req, res) => {
  const entry = await IncomeEntry.findById(req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  entry.deletedAt = new Date();
  await entry.save();
  res.json({ ok: true });
});

// ===== DAY STATUS =====

router.put("/day-status", async (req, res) => {
  const { date, status, note } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });

  if (status !== undefined && status !== null && typeof status !== "string") {
    return res.status(400).json({ error: "status must be a string" });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  if (!status) {
    await DayStatus.deleteOne({ date: day });
    return res.json({ ok: true, removed: true });
  }

  const result = await DayStatus.findOneAndUpdate({ date: day }, { status, note: note || "" }, { upsert: true, new: true });
  res.json(result);
});

export default router;
