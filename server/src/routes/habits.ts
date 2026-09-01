import { Router } from "express";
import { Habit, HABIT_TYPES, type HabitType } from "../models/Habit";
import { DashboardTracker } from "../models/DashboardTracker";
import { ensureHabits } from "../lib/habit-seed";
import { isNonNegativeNumber, objectIdParam, trimmedString } from "../lib/validation";

const router = Router();
router.param("id", objectIdParam);

const isType = (v: unknown): v is HabitType => typeof v === "string" && (HABIT_TYPES as readonly string[]).includes(v);

/** Keys are how months of tracker rows find their habit, so they never change. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function shape(h: InstanceType<typeof Habit>) {
  return {
    _id: String(h._id),
    key: h.key,
    label: h.label,
    description: h.description,
    icon: h.icon,
    type: h.type,
    dailyTarget: h.dailyTarget,
    unit: h.unit,
    monthlyTarget: h.monthlyTarget,
    onHabitsPage: h.onHabitsPage,
    order: h.order,
    archived: h.archived,
    derivedFrom: h.derivedFrom ?? null,
  };
}

router.get("/", async (req, res) => {
  await ensureHabits();
  const filter = req.query.archived === "1" ? { archived: true } : { archived: false };
  const habits = await Habit.find(filter).sort({ order: 1, label: 1 });
  res.json(habits.map(shape));
});

router.post("/", async (req, res) => {
  await ensureHabits();
  const label = trimmedString(req.body?.label);
  if (!label) return res.status(400).json({ error: "name required" });
  const type: HabitType = isType(req.body?.type) ? req.body.type : "check";
  const dailyTarget = req.body?.dailyTarget;
  if (type === "count" && !(isNonNegativeNumber(dailyTarget) && dailyTarget > 0)) {
    return res.status(400).json({ error: "a counted habit needs a daily target above 0" });
  }
  const monthlyTarget = req.body?.monthlyTarget ?? 0;
  if (!isNonNegativeNumber(monthlyTarget)) return res.status(400).json({ error: "monthly target must be zero or more" });

  const base = slugify(label);
  if (!base) return res.status(400).json({ error: "name needs at least one letter or number" });
  // A key collision means the same habit already exists, including an archived one
  // whose history would otherwise be silently adopted by the new row.
  const clash = await Habit.findOne({ key: base });
  if (clash) {
    return res.status(409).json({ error: clash.archived ? `"${clash.label}" is archived; restore it instead` : `"${clash.label}" already exists` });
  }

  const last = await Habit.findOne().sort({ order: -1 });
  const habit = await Habit.create({
    key: base,
    label,
    description: trimmedString(req.body?.description) ?? "",
    icon: trimmedString(req.body?.icon) ?? "circle-check",
    type,
    dailyTarget: type === "count" ? dailyTarget : 0,
    unit: type === "count" ? (trimmedString(req.body?.unit) ?? "") : "",
    monthlyTarget,
    onHabitsPage: req.body?.onHabitsPage !== false,
    order: (last?.order ?? 0) + 1,
  });
  res.json(shape(habit));
});

router.patch("/:id", async (req, res) => {
  const habit = await Habit.findById(req.params.id);
  if (!habit) return res.status(404).json({ error: "not found" });

  if (req.body?.label !== undefined) {
    const label = trimmedString(req.body.label);
    if (!label) return res.status(400).json({ error: "name required" });
    habit.label = label;
  }
  if (req.body?.description !== undefined) habit.description = trimmedString(req.body.description) ?? "";
  if (req.body?.icon !== undefined) habit.icon = trimmedString(req.body.icon) ?? "circle-check";
  if (req.body?.onHabitsPage !== undefined) habit.onHabitsPage = !!req.body.onHabitsPage;

  if (req.body?.type !== undefined) {
    if (!isType(req.body.type)) return res.status(400).json({ error: "invalid type" });
    // A derived habit's value comes from another page, so its shape is not ours to change.
    if (habit.derivedFrom && req.body.type !== habit.type) {
      return res.status(400).json({ error: `${habit.label} is filled in from another page, so how it is measured cannot change here` });
    }
    habit.type = req.body.type;
  }
  if (req.body?.dailyTarget !== undefined) {
    if (!isNonNegativeNumber(req.body.dailyTarget)) return res.status(400).json({ error: "daily target must be zero or more" });
    habit.dailyTarget = req.body.dailyTarget;
  }
  if (req.body?.unit !== undefined) habit.unit = trimmedString(req.body.unit) ?? "";
  if (req.body?.monthlyTarget !== undefined) {
    if (!isNonNegativeNumber(req.body.monthlyTarget)) return res.status(400).json({ error: "monthly target must be zero or more" });
    habit.monthlyTarget = req.body.monthlyTarget;
  }
  if (habit.type === "check") {
    habit.dailyTarget = 0;
    habit.unit = "";
  }

  try {
    await habit.save();
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "invalid habit" });
  }
  res.json(shape(habit));
});

/** Archive. The history stays, and the row can come back with it. */
router.delete("/:id", async (req, res) => {
  const habit = await Habit.findById(req.params.id);
  if (!habit) return res.status(404).json({ error: "not found" });
  if (habit.derivedFrom) {
    return res.status(400).json({ error: `${habit.label} is filled in from another page and cannot be removed here` });
  }
  habit.archived = true;
  await habit.save();
  const history = await DashboardTracker.countDocuments({ kind: habit.key });
  res.json({ ok: true, keptDays: history });
});

router.post("/:id/restore", async (req, res) => {
  const habit = await Habit.findById(req.params.id);
  if (!habit) return res.status(404).json({ error: "not found" });
  habit.archived = false;
  await habit.save();
  res.json(shape(habit));
});

/**
 * Permanent, and it takes the history with it. Archiving is the reversible option;
 * this is for a habit added by mistake.
 */
router.delete("/:id/permanent", async (req, res) => {
  const habit = await Habit.findById(req.params.id);
  if (!habit) return res.status(404).json({ error: "not found" });
  if (habit.derivedFrom) return res.status(400).json({ error: "this one is filled in from another page" });
  if (!habit.archived) return res.status(400).json({ error: "archive it first" });
  const removed = await DashboardTracker.deleteMany({ kind: habit.key });
  await Habit.deleteOne({ _id: habit._id });
  res.json({ ok: true, daysRemoved: removed.deletedCount ?? 0 });
});

router.put("/order", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });
  await Promise.all(ids.map((id, index) => Habit.updateOne({ _id: id }, { $set: { order: index } })));
  res.json({ ok: true });
});

export default router;
