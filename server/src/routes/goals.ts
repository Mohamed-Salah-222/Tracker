import { Router } from "express";
import type { Types } from "mongoose";
import { LifeGoal, GOAL_ICONS, GOAL_KINDS, GOAL_TASK_STATUSES, type GoalIcon, type GoalKind, type GoalTaskStatus } from "../models/LifeGoal";
import { GoalContribution } from "../models/GoalContribution";
import { WeightEntry } from "../models/WeightEntry";
import { WeightGoal } from "../models/WeightGoal";
import { HttpError, isFiniteNumber, isNonNegativeNumber, isPositiveNumber, objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);
router.param("taskId", objectIdParam);
router.param("contributionId", objectIdParam);
router.param("entryId", objectIdParam);

type LifeGoalDoc = InstanceType<typeof LifeGoal>;
type ContributionDoc = InstanceType<typeof GoalContribution>;
type WeightEntryDoc = InstanceType<typeof WeightEntry>;

// ===== Validation helpers =====

function readKind(value: unknown): GoalKind | null {
  return typeof value === "string" && (GOAL_KINDS as readonly string[]).includes(value) ? (value as GoalKind) : null;
}

function readIcon(value: unknown): GoalIcon | null {
  return typeof value === "string" && (GOAL_ICONS as readonly string[]).includes(value) ? (value as GoalIcon) : null;
}

function readStatus(value: unknown): GoalTaskStatus | null {
  return typeof value === "string" && (GOAL_TASK_STATUSES as readonly string[]).includes(value) ? (value as GoalTaskStatus) : null;
}

// Optional numeric field: absent/null clears it, anything else must be a real number.
function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isNonNegativeNumber(value)) throw new HttpError(400, `${field} must be a non-negative number`);
  return value;
}

// ===== Progress =====

function projectPercent(goal: LifeGoalDoc): number {
  const total = goal.tasks.length;
  if (!total) return 0;
  const done = goal.tasks.filter((task) => task.status === "completed" || task.done).length;
  return Math.round((done / total) * 100);
}

function moneyPercent(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.round(Math.min(current / target, 1) * 100);
}

// Weight and body fat are averaged when both are being tracked, so hitting the
// weight number with unchanged body composition doesn't read as 100% done.
function weightPercent(goal: LifeGoalDoc, targetKg: number, latest: WeightEntryDoc | undefined): number {
  const cfg = goal.weight;
  if (!cfg) return 0;

  const startWeight = cfg.start ?? latest?.weightKg;
  if (startWeight == null) return 0;
  const currentWeight = latest?.weightKg ?? startWeight;
  const totalToLose = startWeight - targetKg;
  const weightProgress = totalToLose > 0 ? Math.min(Math.max((startWeight - currentWeight) / totalToLose, 0), 1) : 0;

  const currentFat = latest?.fatPct ?? cfg.startFat;
  if (cfg.startFat == null || cfg.targetFatMax == null || currentFat == null) {
    return Math.round(weightProgress * 100);
  }
  const fatToLose = cfg.startFat - cfg.targetFatMax;
  const fatProgress = fatToLose > 0 ? Math.min(Math.max((cfg.startFat - currentFat) / fatToLose, 0), 1) : 0;
  return Math.round(((weightProgress + fatProgress) / 2) * 100);
}

// ===== Serialization =====

function taskView(task: LifeGoalDoc["tasks"][number]) {
  return {
    id: String(task._id),
    title: task.title,
    section: task.section ?? "",
    status: task.status,
    done: task.done,
    threadCount: task.threadCount,
    order: task.order,
  };
}

function contributionView(contribution: ContributionDoc) {
  return {
    id: String(contribution._id),
    date: contribution.date.toISOString(),
    amount: contribution.amount,
    note: contribution.note ?? "",
  };
}

function weightLogView(entry: WeightEntryDoc) {
  return {
    id: String(entry._id),
    date: entry.date.toISOString().slice(0, 10),
    weightKg: entry.weightKg,
    fatPct: entry.fatPct ?? null,
    musclePct: entry.musclePct ?? null,
    waterPct: entry.waterPct ?? null,
    boneKg: entry.boneKg ?? null,
  };
}

// Shared context so a list of goals costs one query per related collection
// instead of one per goal.
type GoalContext = {
  contributionsByGoal: Map<string, ContributionDoc[]>;
  weightTargetKg: number | null;
  weightLogs: WeightEntryDoc[];
};

async function loadContext(goals: LifeGoalDoc[]): Promise<GoalContext> {
  const moneyIds = goals.filter((goal) => goal.kind === "money").map((goal) => goal._id);
  const hasWeight = goals.some((goal) => goal.kind === "weight");

  const [contributions, weightGoal, weightLogs] = await Promise.all([
    moneyIds.length ? GoalContribution.find({ goalId: { $in: moneyIds }, deletedAt: null }).sort({ date: -1 }) : Promise.resolve([]),
    hasWeight ? WeightGoal.findOne() : Promise.resolve(null),
    hasWeight ? WeightEntry.find({ deletedAt: null }).sort({ date: -1 }) : Promise.resolve([]),
  ]);

  const contributionsByGoal = new Map<string, ContributionDoc[]>();
  for (const contribution of contributions) {
    const key = String(contribution.goalId);
    const bucket = contributionsByGoal.get(key);
    if (bucket) bucket.push(contribution);
    else contributionsByGoal.set(key, [contribution]);
  }

  return { contributionsByGoal, weightTargetKg: weightGoal?.targetKg ?? null, weightLogs };
}

function goalView(goal: LifeGoalDoc, ctx: GoalContext, detailed: boolean) {
  const base = {
    id: String(goal._id),
    title: goal.title,
    subtitle: goal.subtitle ?? "",
    kind: goal.kind,
    color: goal.color,
    icon: goal.icon,
    percent: 0,
  };

  if (goal.kind === "project") {
    const tasks = [...goal.tasks].sort((a, b) => a.order - b.order).map(taskView);
    return { ...base, percent: projectPercent(goal), tasks };
  }

  if (goal.kind === "money" && goal.money) {
    const contributions = ctx.contributionsByGoal.get(String(goal._id)) ?? [];
    const current = contributions.reduce((sum, item) => sum + item.amount, goal.money.startingAmount);
    return {
      ...base,
      percent: moneyPercent(current, goal.money.target),
      money: {
        current,
        target: goal.money.target,
        currency: goal.money.currency,
        startingAmount: goal.money.startingAmount,
        transactions: detailed ? contributions.map(contributionView) : undefined,
      },
    };
  }

  if (goal.kind === "weight" && goal.weight) {
    const cfg = goal.weight;
    // Fall back to the goal's own band when no global WeightGoal has been set yet.
    const latest = ctx.weightLogs[0];
    const targetKg = ctx.weightTargetKg ?? cfg.targetMax ?? cfg.start ?? 100;
    return {
      ...base,
      percent: weightPercent(goal, targetKg, latest),
      weight: {
        current: latest?.weightKg ?? cfg.start ?? null,
        start: cfg.start ?? null,
        target: targetKg,
        targetMin: cfg.targetMin ?? undefined,
        targetMax: cfg.targetMax ?? undefined,
        unit: cfg.unit,
        // `fatPct` is the starting body fat the progress maths measures against,
        // matching how the board reads it.
        fatPct: cfg.startFat ?? undefined,
        targetFatMin: cfg.targetFatMin ?? undefined,
        targetFatMax: cfg.targetFatMax ?? undefined,
        logs: detailed ? ctx.weightLogs.map(weightLogView) : undefined,
      },
    };
  }

  return base;
}

async function loadGoal(id: string): Promise<LifeGoalDoc> {
  const goal = await LifeGoal.findById(id);
  if (!goal || goal.archived) throw new HttpError(404, "goal not found");
  return goal;
}

async function respondWithGoal(goal: LifeGoalDoc, res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  const ctx = await loadContext([goal]);
  res.json(goalView(goal, ctx, true));
}

// ===== Goals =====

router.get("/", async (_req, res) => {
  const goals = await LifeGoal.find({ archived: false }).sort({ order: 1, createdAt: 1 });
  const ctx = await loadContext(goals);
  res.json(goals.map((goal) => goalView(goal, ctx, false)));
});

router.post("/", async (req, res) => {
  const title = trimmedString(req.body?.title);
  if (!title) return res.status(400).json({ error: "title required" });

  const kind = readKind(req.body?.kind);
  if (!kind) return res.status(400).json({ error: "kind must be project, money or weight" });

  const icon = req.body?.icon === undefined ? null : readIcon(req.body.icon);
  if (req.body?.icon !== undefined && !icon) {
    return res.status(400).json({ error: `icon must be one of ${GOAL_ICONS.join(", ")}` });
  }
  if (req.body?.color !== undefined && typeof req.body.color !== "string") {
    return res.status(400).json({ error: "color must be a string" });
  }
  if (req.body?.subtitle !== undefined && typeof req.body.subtitle !== "string") {
    return res.status(400).json({ error: "subtitle must be a string" });
  }

  const doc: Record<string, unknown> = {
    title,
    subtitle: req.body?.subtitle ?? "",
    kind,
    color: req.body?.color ?? "#18181b",
    icon: icon ?? defaultIconFor(kind),
    order: await LifeGoal.countDocuments({ archived: false }),
  };

  if (kind === "money") {
    const money = req.body?.money ?? {};
    if (!isPositiveNumber(money.target)) {
      return res.status(400).json({ error: "money.target must be a positive number" });
    }
    const currency = trimmedString(money.currency) ?? "LE";
    if (money.startingAmount !== undefined && !isFiniteNumber(money.startingAmount)) {
      return res.status(400).json({ error: "money.startingAmount must be a number" });
    }
    doc.money = { target: money.target, currency, startingAmount: money.startingAmount ?? 0 };
  }

  if (kind === "weight") {
    // The board wraps the single WeightGoal/WeightEntry pair, so a second weight
    // goal would silently mirror the first one's target and log.
    const existing = await LifeGoal.countDocuments({ kind: "weight", archived: false });
    if (existing > 0) throw new HttpError(409, "a weight goal already exists");

    const weight = req.body?.weight ?? {};
    if (weight.start !== undefined && weight.start !== null && !isPositiveNumber(weight.start)) {
      return res.status(400).json({ error: "weight.start must be a positive number" });
    }
    doc.weight = {
      unit: trimmedString(weight.unit) ?? "kg",
      start: weight.start ?? null,
      targetMin: optionalNumber(weight.targetMin, "weight.targetMin"),
      targetMax: optionalNumber(weight.targetMax, "weight.targetMax"),
      startFat: optionalNumber(weight.startFat, "weight.startFat"),
      targetFatMin: optionalNumber(weight.targetFatMin, "weight.targetFatMin"),
      targetFatMax: optionalNumber(weight.targetFatMax, "weight.targetFatMax"),
    };
    if (weight.target !== undefined) {
      if (!isPositiveNumber(weight.target)) {
        return res.status(400).json({ error: "weight.target must be a positive number" });
      }
      await setWeightTarget(weight.target);
    }
  }

  const created = await LifeGoal.create(doc);
  await respondWithGoal(created, res);
});

router.get("/:id", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  await respondWithGoal(goal, res);
});

router.patch("/:id", async (req, res) => {
  const goal = await loadGoal(req.params.id);

  if (req.body?.title !== undefined) {
    const title = trimmedString(req.body.title);
    if (!title) return res.status(400).json({ error: "title required" });
    goal.title = title;
  }
  if (req.body?.subtitle !== undefined) {
    if (typeof req.body.subtitle !== "string") return res.status(400).json({ error: "subtitle must be a string" });
    goal.subtitle = req.body.subtitle;
  }
  if (req.body?.color !== undefined) {
    if (typeof req.body.color !== "string") return res.status(400).json({ error: "color must be a string" });
    goal.color = req.body.color;
  }
  if (req.body?.icon !== undefined) {
    const icon = readIcon(req.body.icon);
    if (!icon) return res.status(400).json({ error: `icon must be one of ${GOAL_ICONS.join(", ")}` });
    goal.icon = icon;
  }

  if (req.body?.money !== undefined) {
    if (goal.kind !== "money" || !goal.money) return res.status(400).json({ error: "goal is not a money goal" });
    const money = req.body.money ?? {};
    if (money.target !== undefined) {
      if (!isPositiveNumber(money.target)) return res.status(400).json({ error: "money.target must be a positive number" });
      goal.money.target = money.target;
    }
    if (money.currency !== undefined) {
      const currency = trimmedString(money.currency);
      if (!currency) return res.status(400).json({ error: "money.currency required" });
      goal.money.currency = currency;
    }
    if (money.startingAmount !== undefined) {
      if (!isFiniteNumber(money.startingAmount)) return res.status(400).json({ error: "money.startingAmount must be a number" });
      goal.money.startingAmount = money.startingAmount;
    }
  }

  if (req.body?.weight !== undefined) {
    if (goal.kind !== "weight" || !goal.weight) return res.status(400).json({ error: "goal is not a weight goal" });
    const weight = req.body.weight ?? {};
    if (weight.start !== undefined) {
      if (weight.start !== null && !isPositiveNumber(weight.start)) return res.status(400).json({ error: "weight.start must be a positive number" });
      goal.weight.start = weight.start;
    }
    if (weight.unit !== undefined) {
      const unit = trimmedString(weight.unit);
      if (!unit) return res.status(400).json({ error: "weight.unit required" });
      goal.weight.unit = unit;
    }
    for (const field of ["targetMin", "targetMax", "startFat", "targetFatMin", "targetFatMax"] as const) {
      if (weight[field] !== undefined) {
        goal.weight[field] = optionalNumber(weight[field], `weight.${field}`);
      }
    }
    // The real target weight is the shared WeightGoal singleton, not a copy here.
    if (weight.target !== undefined) {
      if (!isPositiveNumber(weight.target)) return res.status(400).json({ error: "weight.target must be a positive number" });
      await setWeightTarget(weight.target);
    }
  }

  await goal.save();
  await respondWithGoal(goal, res);
});

router.delete("/:id", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  goal.archived = true;
  await goal.save();
  // Contributions belong to the goal alone, so they go with it. WeightEntry rows
  // are shared with the Calories page and are deliberately left in place.
  await GoalContribution.updateMany({ goalId: goal._id, deletedAt: null }, { deletedAt: new Date() });
  res.json({ ok: true });
});

// ===== Project tasks =====

router.post("/:id/tasks", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "project") return res.status(400).json({ error: "goal is not a project goal" });

  const title = trimmedString(req.body?.title);
  if (!title) return res.status(400).json({ error: "title required" });

  const status = req.body?.status === undefined ? "planning" : readStatus(req.body.status);
  if (!status) return res.status(400).json({ error: `status must be one of ${GOAL_TASK_STATUSES.join(", ")}` });
  if (req.body?.section !== undefined && typeof req.body.section !== "string") {
    return res.status(400).json({ error: "section must be a string" });
  }

  const maxOrder = goal.tasks.reduce((max, task) => Math.max(max, task.order), -1);
  goal.tasks.push({ title, section: req.body?.section ?? "", status, done: status === "completed", threadCount: 0, order: maxOrder + 1 });
  await goal.save();
  await respondWithGoal(goal, res);
});

router.patch("/:id/tasks/:taskId", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "project") return res.status(400).json({ error: "goal is not a project goal" });

  const task = goal.tasks.id(req.params.taskId as unknown as Types.ObjectId);
  if (!task) return res.status(404).json({ error: "task not found" });

  if (req.body?.title !== undefined) {
    const title = trimmedString(req.body.title);
    if (!title) return res.status(400).json({ error: "title required" });
    task.title = title;
  }
  if (req.body?.status !== undefined) {
    const status = readStatus(req.body.status);
    if (!status) return res.status(400).json({ error: `status must be one of ${GOAL_TASK_STATUSES.join(", ")}` });
    task.status = status;
  }
  if (req.body?.section !== undefined) {
    if (typeof req.body.section !== "string") return res.status(400).json({ error: "section must be a string" });
    task.section = req.body.section;
  }
  if (req.body?.threadCount !== undefined) {
    if (!isNonNegativeNumber(req.body.threadCount)) return res.status(400).json({ error: "threadCount must be a non-negative number" });
    task.threadCount = req.body.threadCount;
  }
  if (req.body?.order !== undefined) {
    if (!isNonNegativeNumber(req.body.order)) return res.status(400).json({ error: "order must be a non-negative number" });
    task.order = req.body.order;
  }

  await goal.save();
  await respondWithGoal(goal, res);
});

router.delete("/:id/tasks/:taskId", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "project") return res.status(400).json({ error: "goal is not a project goal" });

  const task = goal.tasks.id(req.params.taskId as unknown as Types.ObjectId);
  if (!task) return res.status(404).json({ error: "task not found" });

  task.deleteOne();
  await goal.save();
  await respondWithGoal(goal, res);
});

// ===== Money contributions =====

router.post("/:id/contributions", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "money") return res.status(400).json({ error: "goal is not a money goal" });

  const { amount, note } = req.body ?? {};
  if (!isFiniteNumber(amount) || amount === 0) {
    return res.status(400).json({ error: "amount must be a non-zero number" });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }
  const date = req.body?.date === undefined ? new Date() : parseDayUTC(req.body.date);
  if (!date) return res.status(400).json({ error: "valid date required" });

  await GoalContribution.create({ goalId: goal._id, date, amount, note: note ?? "" });
  await respondWithGoal(goal, res);
});

router.delete("/:id/contributions/:contributionId", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "money") return res.status(400).json({ error: "goal is not a money goal" });

  const contribution = await GoalContribution.findOne({ _id: req.params.contributionId, goalId: goal._id, deletedAt: null });
  if (!contribution) return res.status(404).json({ error: "contribution not found" });

  contribution.deletedAt = new Date();
  await contribution.save();
  await respondWithGoal(goal, res);
});

// ===== Weight logs (shared WeightEntry collection) =====

router.post("/:id/weight-logs", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "weight") return res.status(400).json({ error: "goal is not a weight goal" });

  const day = parseDayUTC(req.body?.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (!isPositiveNumber(req.body?.weightKg)) {
    return res.status(400).json({ error: "positive weightKg required" });
  }

  const composition: Record<string, number | null> = {};
  for (const field of ["fatPct", "musclePct", "waterPct", "boneKg"] as const) {
    composition[field] = optionalNumber(req.body?.[field], field);
  }

  // One reading per day: re-scanning the same day corrects that day's numbers
  // rather than stacking a second row the trend would then double-count.
  const entry = await WeightEntry.findOne({ date: day, deletedAt: null });
  if (entry) {
    entry.weightKg = req.body.weightKg;
    entry.set(composition);
    await entry.save();
  } else {
    await WeightEntry.create({ date: day, weightKg: req.body.weightKg, ...composition });
  }

  await respondWithGoal(goal, res);
});

router.delete("/:id/weight-logs/:entryId", async (req, res) => {
  const goal = await loadGoal(req.params.id);
  if (goal.kind !== "weight") return res.status(400).json({ error: "goal is not a weight goal" });

  const entry = await WeightEntry.findOne({ _id: req.params.entryId, deletedAt: null });
  if (!entry) return res.status(404).json({ error: "weight log not found" });

  entry.deletedAt = new Date();
  await entry.save();
  await respondWithGoal(goal, res);
});

// ===== Internals =====

function defaultIconFor(kind: GoalKind): GoalIcon {
  if (kind === "money") return "banknote";
  if (kind === "weight") return "scale";
  return "globe";
}

async function setWeightTarget(targetKg: number) {
  let weightGoal = await WeightGoal.findOne();
  if (!weightGoal) weightGoal = new WeightGoal();
  weightGoal.targetKg = targetKg;
  await weightGoal.save();
}

export default router;
