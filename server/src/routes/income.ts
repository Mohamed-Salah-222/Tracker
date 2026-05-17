import { Router } from "express";
import { Rate } from "../models/Rate";
import { IncomeEntry } from "../models/IncomeEntry";
import { DayStatus } from "../models/DayStatus";
import { toDayUTC, monthRange } from "../lib/dates";

const router = Router();

// ===== RATES =====

// Get current active rate
router.get("/rate", async (_req, res) => {
  const rate = await Rate.findOne({ effectiveTo: null }).sort({ effectiveFrom: -1 });
  res.json(rate);
});

// Set a new rate (closes the previous one)
router.post("/rate", async (req, res) => {
  const { ratePerMinute } = req.body;
  if (typeof ratePerMinute !== "number" || ratePerMinute < 0) {
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
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string); // 1-12
  if (!year || !month) return res.status(400).json({ error: "year and month required" });

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
  const fromStr = req.query.from as string;
  const toStr = req.query.to as string;
  if (!fromStr || !toStr) return res.status(400).json({ error: "from and to required" });

  const from = toDayUTC(fromStr);
  const toEnd = toDayUTC(toStr);
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
  if (!date || typeof minutes !== "number" || minutes <= 0) {
    return res.status(400).json({ error: "date and positive minutes required" });
  }

  const activeRate = await Rate.findOne({ effectiveTo: null }).sort({ effectiveFrom: -1 });
  if (!activeRate) {
    return res.status(400).json({ error: "Set your rate first" });
  }

  const day = toDayUTC(date);
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
  const entry = await IncomeEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  if (typeof minutes === "number") {
    entry.minutes = minutes;
    entry.amount = +(minutes * entry.ratePerMinute).toFixed(2);
  }
  if (date) entry.date = toDayUTC(date);

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
  if (!date) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(date);

  if (!status) {
    await DayStatus.deleteOne({ date: day });
    return res.json({ ok: true, removed: true });
  }

  const result = await DayStatus.findOneAndUpdate({ date: day }, { status, note: note || "" }, { upsert: true, new: true });
  res.json(result);
});

export default router;
