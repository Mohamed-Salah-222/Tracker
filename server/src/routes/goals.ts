import { Router } from "express";
import { Goal2, HORIZONS, GOAL_STATUSES, type Horizon, type GoalStatus } from "../models/Goal2";
import { GoalCheckpoint } from "../models/GoalCheckpoint";
import { isValidPeriodKey, periodBounds, periodKeyFor, periodLabel } from "../lib/goal-periods";
import { isFiniteNumber, objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();
router.param("id", objectIdParam);

const isHorizon = (v: unknown): v is Horizon => typeof v === "string" && (HORIZONS as readonly string[]).includes(v);
const isStatus = (v: unknown): v is GoalStatus => typeof v === "string" && (GOAL_STATUSES as readonly string[]).includes(v);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayFrom = (v: unknown) => iso(parseDayUTC(v) ?? new Date());

type MeasureInput = { unit?: unknown; startValue?: unknown; targetValue?: unknown };

function readMeasure(raw: unknown): { ok: true; value: null | { unit: string; startValue: number; targetValue: number } } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const m = raw as MeasureInput;
  if (!isFiniteNumber(m.startValue) || !isFiniteNumber(m.targetValue)) return { ok: false, error: "a measurable goal needs a start and a target number" };
  if (m.startValue === m.targetValue) return { ok: false, error: "the start and the target are the same number, so there is nothing to track" };
  return { ok: true, value: { unit: trimmedString(m.unit)?.slice(0, 20) ?? "", startValue: m.startValue, targetValue: m.targetValue } };
}

type GoalDoc = InstanceType<typeof Goal2>;

/**
 * What a goal looks like to the page: the stored fields plus everything that can be
 * worked out from its checkpoints, so the client never has to do the arithmetic in
 * two places.
 */
function shape(goal: GoalDoc, checkpoints: InstanceType<typeof GoalCheckpoint>[], todayIso: string) {
  const mine = checkpoints.filter((c) => String(c.goalId) === String(goal._id)).sort((a, b) => b.date.getTime() - a.date.getTime());
  const withValue = mine.filter((c) => c.value !== null && c.value !== undefined);
  const latest = mine[0] ?? null;

  let percent: number | null = null;
  let current: number | null = null;
  if (goal.measure) {
    current = withValue.length > 0 ? (withValue[0].value as number) : goal.measure.startValue;
    const span = goal.measure.targetValue - goal.measure.startValue;
    const moved = current - goal.measure.startValue;
    percent = span === 0 ? 0 : Math.max(0, Math.min(100, Math.round((moved / span) * 100)));
  }

  const range = goal.startDate && goal.endDate ? { start: iso(goal.startDate), end: iso(goal.endDate) } : null;
  const bounds = periodBounds(goal.horizon, goal.periodKey ?? null, range);
  const daysLeft = bounds ? Math.round((Date.parse(bounds.end + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86_400_000) : null;
  // A period planned ahead should say so rather than reading as a long deadline.
  const daysUntilStart = bounds ? Math.round((Date.parse(bounds.start + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86_400_000) : null;
  const lastAt = latest ? iso(latest.date) : null;
  const quietDays = lastAt ? Math.round((Date.parse(todayIso + "T00:00:00Z") - Date.parse(lastAt + "T00:00:00Z")) / 86_400_000) : null;

  return {
    _id: String(goal._id),
    title: goal.title,
    why: goal.why,
    horizon: goal.horizon,
    periodKey: goal.periodKey,
    periodLabel: periodLabel(goal.horizon, goal.periodKey ?? null, range),
    startDate: bounds?.start ?? null,
    endDate: bounds?.end ?? null,
    /** Positive while the period is still ahead of today. */
    daysUntilStart: daysUntilStart !== null && daysUntilStart > 0 ? daysUntilStart : null,
    targetDate: goal.targetDate ? iso(goal.targetDate) : null,
    measure: goal.measure ? { unit: goal.measure.unit, startValue: goal.measure.startValue, targetValue: goal.measure.targetValue } : null,
    status: goal.status,
    completedAt: goal.completedAt ? iso(goal.completedAt) : null,
    order: goal.order,
    percent,
    current,
    checkpointCount: mine.length,
    lastCheckpointAt: lastAt,
    /** Days since the last entry, so a goal going quiet can say so. */
    quietDays,
    daysLeft,
  };
}

// =====================================================================
// GET /goals?today=YYYY-MM-DD&status=active&period=2026-09
// =====================================================================
router.get("/", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  const filter: Record<string, unknown> = {};
  if (isStatus(req.query.status)) filter.status = req.query.status;
  else if (req.query.status !== "all") filter.status = { $ne: "archived" };
  if (typeof req.query.period === "string" && req.query.period) filter.periodKey = req.query.period;

  const goals = await Goal2.find(filter).sort({ order: 1, createdAt: 1 });
  const checkpoints = await GoalCheckpoint.find({ goalId: { $in: goals.map((g) => g._id) } });
  res.json({
    today: todayIso,
    currentMonth: periodKeyFor("monthly", todayIso),
    currentWeek: periodKeyFor("weekly", todayIso),
    goals: goals.map((g) => shape(g, checkpoints, todayIso)),
  });
});

/** Which periods have goals, so past months and weeks can be browsed. */
router.get("/periods", async (_req, res) => {
  const rows = await Goal2.aggregate<{ _id: { horizon: string; periodKey: string }; n: number }>([
    { $match: { periodKey: { $ne: null } } },
    { $group: { _id: { horizon: "$horizon", periodKey: "$periodKey" }, n: { $sum: 1 } } },
    { $sort: { "_id.periodKey": -1 } },
  ]);
  res.json(
    rows.map((r) => ({
      horizon: r._id.horizon,
      periodKey: r._id.periodKey,
      label: periodLabel(r._id.horizon as Horizon, r._id.periodKey),
      count: r.n,
    })),
  );
});

// =====================================================================
// Goals
// =====================================================================
router.post("/", async (req, res) => {
  const title = trimmedString(req.body?.title);
  if (!title) return res.status(400).json({ error: "give it a name" });
  const horizon: Horizon = isHorizon(req.body?.horizon) ? req.body.horizon : "lifetime";

  const todayIso = todayFrom(req.body?.today);
  // A period goal defaults to the period you are in, which is what you nearly always
  // mean when you add one.
  const periodKey = horizon === "lifetime" || horizon === "custom" ? null : (trimmedString(req.body?.periodKey) ?? periodKeyFor(horizon, todayIso));
  if (!isValidPeriodKey(horizon, periodKey)) return res.status(400).json({ error: "that period does not look right" });

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (horizon === "custom") {
    startDate = parseDayUTC(req.body?.startDate);
    endDate = parseDayUTC(req.body?.endDate);
    if (!startDate || !endDate) return res.status(400).json({ error: "a custom range needs a start and an end" });
    if (startDate > endDate) return res.status(400).json({ error: "the end cannot come before the start" });
  }

  const measure = readMeasure(req.body?.measure);
  if (!measure.ok) return res.status(400).json({ error: measure.error });

  let targetDate: Date | null = null;
  if (req.body?.targetDate) {
    targetDate = parseDayUTC(req.body.targetDate);
    if (!targetDate) return res.status(400).json({ error: "that target date does not look right" });
  }

  const last = await Goal2.findOne({ horizon, periodKey }).sort({ order: -1 });
  const goal = await Goal2.create({
    title,
    why: trimmedString(req.body?.why) ?? "",
    horizon,
    periodKey,
    startDate,
    endDate,
    targetDate,
    measure: measure.value,
    order: (last?.order ?? 0) + 1,
  });
  res.json(shape(goal, [], todayIso));
});

router.patch("/:id", async (req, res) => {
  const goal = await Goal2.findById((req.params as WithGoalId).id);
  if (!goal) return res.status(404).json({ error: "not found" });
  const todayIso = todayFrom(req.body?.today);

  if (req.body?.title !== undefined) {
    const title = trimmedString(req.body.title);
    if (!title) return res.status(400).json({ error: "give it a name" });
    goal.title = title;
  }
  if (req.body?.why !== undefined) goal.why = trimmedString(req.body.why) ?? "";

  if (req.body?.horizon !== undefined) {
    if (!isHorizon(req.body.horizon)) return res.status(400).json({ error: "unknown horizon" });
    goal.horizon = req.body.horizon;
    // Moving between horizons has to bring a valid period with it, or drop the old one.
    if (goal.horizon === "lifetime" || goal.horizon === "custom") goal.periodKey = null;
    else if (!isValidPeriodKey(goal.horizon, goal.periodKey ?? null)) goal.periodKey = periodKeyFor(goal.horizon, todayIso);
  }
  if (req.body?.periodKey !== undefined) {
    const key = req.body.periodKey === null ? null : trimmedString(req.body.periodKey);
    if (goal.horizon !== "custom" && !isValidPeriodKey(goal.horizon, key)) return res.status(400).json({ error: "that period does not look right" });
    goal.periodKey = goal.horizon === "custom" ? null : (key ?? null);
  }
  for (const field of ["startDate", "endDate"] as const) {
    if (req.body?.[field] === undefined) continue;
    if (req.body[field] === null || req.body[field] === "") {
      goal[field] = null;
      continue;
    }
    const d = parseDayUTC(req.body[field]);
    if (!d) return res.status(400).json({ error: `that ${field === "startDate" ? "start" : "end"} date does not look right` });
    goal[field] = d;
  }
  if (req.body?.targetDate !== undefined) {
    if (req.body.targetDate === null || req.body.targetDate === "") goal.targetDate = null;
    else {
      const d = parseDayUTC(req.body.targetDate);
      if (!d) return res.status(400).json({ error: "that target date does not look right" });
      goal.targetDate = d;
    }
  }
  if (req.body?.measure !== undefined) {
    const measure = readMeasure(req.body.measure);
    if (!measure.ok) return res.status(400).json({ error: measure.error });
    goal.set("measure", measure.value);
  }
  if (req.body?.status !== undefined) {
    if (!isStatus(req.body.status)) return res.status(400).json({ error: "unknown status" });
    goal.status = req.body.status;
    goal.completedAt = req.body.status === "done" ? new Date() : null;
  }

  try {
    await goal.save();
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "could not save that" });
  }
  const checkpoints = await GoalCheckpoint.find({ goalId: goal._id });
  res.json(shape(goal, checkpoints, todayIso));
});

/** Removes the goal and its whole timeline. Archiving is the reversible option. */
router.delete("/:id", async (req, res) => {
  const goal = await Goal2.findById((req.params as WithGoalId).id);
  if (!goal) return res.status(404).json({ error: "not found" });
  const removed = await GoalCheckpoint.deleteMany({ goalId: goal._id });
  await Goal2.deleteOne({ _id: goal._id });
  res.json({ ok: true, checkpointsRemoved: removed.deletedCount ?? 0 });
});

router.put("/order", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });
  await Promise.all(ids.map((id, index) => Goal2.updateOne({ _id: id }, { $set: { order: index } })));
  res.json({ ok: true });
});

// =====================================================================
// The timeline
// =====================================================================
/** mergeParams gives these the goal id from the parent path. */
const checkpoints = Router({ mergeParams: true }) as import("express").Router & object;
type WithGoalId = { id: string; cid?: string };
checkpoints.param("cid", objectIdParam);

type CheckpointDoc = InstanceType<typeof GoalCheckpoint>;

function shapeCheckpoint(c: CheckpointDoc) {
  return {
    _id: String(c._id),
    date: iso(c.date),
    note: c.note,
    improve: c.improve,
    value: c.value ?? null,
    comments: (c.comments ?? []).map((m) => ({ _id: String(m._id), body: m.body, createdAt: m.createdAt?.toISOString() ?? null })),
  };
}

checkpoints.get("/", async (req, res) => {
  const rows = await GoalCheckpoint.find({ goalId: (req.params as WithGoalId).id }).sort({ date: -1, createdAt: -1 });
  res.json(rows.map(shapeCheckpoint));
});

checkpoints.post("/", async (req, res) => {
  const goal = await Goal2.findById((req.params as WithGoalId).id);
  if (!goal) return res.status(404).json({ error: "goal not found" });

  const date = parseDayUTC(req.body?.date) ?? parseDayUTC(todayFrom(req.body?.today));
  if (!date) return res.status(400).json({ error: "valid date required" });
  const note = trimmedString(req.body?.note) ?? "";
  const improve = trimmedString(req.body?.improve) ?? "";
  const value = req.body?.value === null || req.body?.value === undefined || req.body?.value === "" ? null : Number(req.body.value);
  if (value !== null && !isFiniteNumber(value)) return res.status(400).json({ error: "that number does not look right" });
  if (!note && !improve && value === null) return res.status(400).json({ error: "write something, or record a number" });

  const created = await GoalCheckpoint.create({ goalId: goal._id, date, note, improve, value });
  res.json(shapeCheckpoint(created));
});

checkpoints.patch("/:cid", async (req, res) => {
  const row = await GoalCheckpoint.findOne({ _id: (req.params as WithGoalId).cid, goalId: (req.params as WithGoalId).id });
  if (!row) return res.status(404).json({ error: "not found" });

  if (req.body?.date !== undefined) {
    const d = parseDayUTC(req.body.date);
    if (!d) return res.status(400).json({ error: "valid date required" });
    row.date = d;
  }
  if (req.body?.note !== undefined) row.note = trimmedString(req.body.note) ?? "";
  if (req.body?.improve !== undefined) row.improve = trimmedString(req.body.improve) ?? "";
  if (req.body?.value !== undefined) {
    if (req.body.value === null || req.body.value === "") row.value = null;
    else {
      const v = Number(req.body.value);
      if (!isFiniteNumber(v)) return res.status(400).json({ error: "that number does not look right" });
      row.value = v;
    }
  }

  try {
    await row.save();
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "could not save that" });
  }
  res.json(shapeCheckpoint(row));
});

// ---- comments on one checkpoint ----
checkpoints.post("/:cid/comments", async (req, res) => {
  const p = req.params as WithGoalId;
  const row = await GoalCheckpoint.findOne({ _id: p.cid, goalId: p.id });
  if (!row) return res.status(404).json({ error: "not found" });
  const body = trimmedString(req.body?.body);
  if (!body) return res.status(400).json({ error: "write something" });
  row.comments.push({ body } as (typeof row.comments)[number]);
  await row.save();
  res.json(shapeCheckpoint(row));
});

checkpoints.delete("/:cid/comments/:commentId", async (req, res) => {
  const p = req.params as WithGoalId & { commentId?: string };
  const row = await GoalCheckpoint.findOne({ _id: p.cid, goalId: p.id });
  if (!row) return res.status(404).json({ error: "not found" });
  const before = row.comments.length;
  row.comments = row.comments.filter((m) => String(m._id) !== p.commentId) as typeof row.comments;
  if (row.comments.length === before) return res.status(404).json({ error: "comment not found" });
  await row.save();
  res.json(shapeCheckpoint(row));
});

checkpoints.delete("/:cid", async (req, res) => {
  const row = await GoalCheckpoint.findOneAndDelete({ _id: (req.params as WithGoalId).cid, goalId: (req.params as WithGoalId).id });
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

router.use("/:id/checkpoints", checkpoints);

export default router;
