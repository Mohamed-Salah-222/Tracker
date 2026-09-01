import { Router } from "express";
import { WeightEntry } from "../models/WeightEntry";
import { WeightGoal } from "../models/WeightGoal";
import { BODY_METRICS } from "../lib/body-metrics";
import { applyMeasurements, bodySummary, shapeEntry } from "../lib/body-log";
import { objectIdParam, parseDayUTC } from "../lib/validation";

const router = Router();
router.param("id", objectIdParam);

const todayFrom = (v: unknown) => (parseDayUTC(v) ?? new Date()).toISOString().slice(0, 10);

/** What can be measured. The form is built from this, so there is one list, not two. */
router.get("/metrics", (_req, res) => {
  res.json(BODY_METRICS);
});

// =====================================================================
// GET /body?today=
// Every reading plus, per measurement, its series and how far it has moved.
// =====================================================================
router.get("/", async (req, res) => {
  const [summary, goal] = await Promise.all([bodySummary(todayFrom(req.query.today)), WeightGoal.findOne()]);
  res.json({ ...summary, goal: goal ?? (await WeightGoal.create({})) });
});

// =====================================================================
// POST /body
// One reading per day, so a second weigh-in on the same date corrects the first
// rather than putting two points on the chart an hour apart.
// =====================================================================
router.post("/", async (req, res) => {
  const date = parseDayUTC(req.body?.date);
  if (!date) return res.status(400).json({ error: "a date is required" });

  const existing = await WeightEntry.findOne({ date, deletedAt: null });
  const doc = existing ?? new WeightEntry({ date });
  const applied = applyMeasurements(doc, req.body ?? {}, { requireWeight: !existing });
  if (!applied.ok) return res.status(400).json({ error: applied.error });

  await doc.save();
  res.json(shapeEntry(doc));
});

router.patch("/:id", async (req, res) => {
  const doc = await WeightEntry.findById(req.params.id);
  if (!doc || doc.deletedAt) return res.status(404).json({ error: "not found" });

  if (req.body?.date !== undefined) {
    const date = parseDayUTC(req.body.date);
    if (!date) return res.status(400).json({ error: "a date is required" });
    doc.date = date;
  }
  const applied = applyMeasurements(doc, req.body ?? {}, { requireWeight: false });
  if (!applied.ok) return res.status(400).json({ error: applied.error });

  await doc.save();
  res.json(shapeEntry(doc));
});

/** Soft delete, matching how the older weight route has always removed a reading. */
router.delete("/:id", async (req, res) => {
  const doc = await WeightEntry.findById(req.params.id);
  if (!doc || doc.deletedAt) return res.status(404).json({ error: "not found" });
  doc.deletedAt = new Date();
  await doc.save();
  res.json({ ok: true });
});

export default router;
