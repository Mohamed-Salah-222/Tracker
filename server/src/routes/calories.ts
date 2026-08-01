import { Router } from "express";
import { CalorieEntry, MEAL_SLOTS } from "../models/CalorieEntry";
import { Food } from "../models/Food";
import { FridgeItem } from "../models/FridgeItem";
import { CheatDay } from "../models/CheatDay";
import { WaterEntry } from "../models/WaterEntry";
import { Goal } from "../models/Goal";
import { WeightEntry } from "../models/WeightEntry";
import { WeightGoal } from "../models/WeightGoal";
import { isNonNegativeNumber, isObjectId, isPositiveNumber, objectIdParam, parseDayUTC } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";

const router = Router();

router.param("id", objectIdParam);

type Meal = (typeof MEAL_SLOTS)[number];
function isValidMeal(m: string): m is Meal {
  return (MEAL_SLOTS as readonly string[]).includes(m);
}

// Expects an already-validated UTC day.
function fridayOnOrBefore(day: Date): Date {
  const d = new Date(day);
  const dow = d.getUTCDay();
  const back = (dow - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

// ===========================================================
// EXISTING ROUTES (preserved)
// ===========================================================

router.get("/day", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const entries = await CalorieEntry.find({ date: day, deletedAt: null }).sort({
    createdAt: 1,
  });
  res.json(entries);
});

router.get("/recent-foods", async (_req, res) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const rows = await CalorieEntry.aggregate([{ $match: { deletedAt: null, date: { $gte: since } } }, { $group: { _id: "$foodId", count: { $sum: 1 }, lastUsed: { $max: "$date" } } }, { $sort: { count: -1, lastUsed: -1 } }, { $limit: 12 }]);
  res.json(rows.map((r) => ({ foodId: r._id.toString(), count: r.count })));
});

router.post("/", async (req, res) => {
  const { date, foodId, meal, grams, units } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (!isObjectId(foodId)) return res.status(400).json({ error: "invalid foodId" });
  if (typeof meal !== "string" || !isValidMeal(meal)) return res.status(400).json({ error: "invalid meal" });

  const food = await Food.findById(foodId);
  if (!food || food.archived) return res.status(404).json({ error: "food not found" });

  if (food.entryMode === "perUnit") {
    const n = isPositiveNumber(units) ? units : null;
    if (!n) return res.status(400).json({ error: "units > 0 required" });

    let deducted = 0;
    if (food.trackInFridge) {
      const item = await FridgeItem.findOne({ foodId: food._id });
      if (item) {
        deducted = Math.min(n, item.count);
        if (deducted > 0) {
          item.count -= deducted;
          await item.save();
        }
      }
    }

    const entry = await CalorieEntry.create({
      date: day,
      foodId: food._id,
      foodNameSnapshot: food.name,
      meal,
      entryMode: "perUnit",
      units: n,
      caloriesPerUnitSnapshot: food.caloriesPerUnit,
      proteinPerUnitSnapshot: food.proteinPerUnit,
      carbsPerUnitSnapshot: food.carbsPerUnit,
      fatPerUnitSnapshot: food.fatPerUnit,
      unitLabelSnapshot: food.unitLabel,
      fridgeDeductedAtLog: deducted,
    });
    res.json(entry);
  } else {
    const g = isPositiveNumber(grams) ? grams : null;
    if (!g) return res.status(400).json({ error: "grams > 0 required" });
    const entry = await CalorieEntry.create({
      date: day,
      foodId: food._id,
      foodNameSnapshot: food.name,
      meal,
      entryMode: "perGram",
      grams: g,
      caloriesPerGramSnapshot: food.caloriesPerGram,
      proteinPerGramSnapshot: food.proteinPerGram,
      carbsPerGramSnapshot: food.carbsPerGram,
      fatPerGramSnapshot: food.fatPerGram,
    });
    res.json(entry);
  }
});

router.patch("/weight-goal", async (req, res) => {
  const { targetKg } = req.body;
  if (!isPositiveNumber(targetKg)) {
    return res.status(400).json({ error: "positive targetKg required" });
  }

  let goal = await WeightGoal.findOne();
  if (!goal) goal = await WeightGoal.create({});
  goal.targetKg = targetKg;
  await goal.save();
  res.json(goal);
});

router.patch("/goal", async (req, res) => {
  const fields = ["caloriesTarget", "proteinTarget", "carbsTarget", "fatTarget", "waterMin", "waterTarget", "waterMax"] as const;
  for (const f of fields) {
    if (req.body[f] !== undefined && !isNonNegativeNumber(req.body[f])) {
      return res.status(400).json({ error: `${f} must be a non-negative number` });
    }
  }

  let goal = await Goal.findOne();
  if (!goal) goal = await Goal.create({});

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      goal.set(f, req.body[f]);
    }
  }
  await goal.save();
  res.json(goal);
});

router.patch("/:id", async (req, res) => {
  const { grams, units, meal } = req.body;

  if (meal !== undefined && (typeof meal !== "string" || !isValidMeal(meal))) {
    return res.status(400).json({ error: "invalid meal" });
  }
  if (units !== undefined && !isPositiveNumber(units)) {
    return res.status(400).json({ error: "units > 0 required" });
  }
  if (grams !== undefined && !isPositiveNumber(grams)) {
    return res.status(400).json({ error: "grams > 0 required" });
  }

  const entry = await CalorieEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  if (meal) {
    entry.set("meal", meal);
  }

  if (entry.entryMode === "perUnit") {
    if (units !== undefined) {
      const oldUnits = entry.units ?? 0;
      entry.units = units;

      if ((entry.fridgeDeductedAtLog ?? 0) > 0) {
        const delta = units - oldUnits;
        if (delta !== 0) {
          const item = await FridgeItem.findOne({ foodId: entry.foodId });
          if (item) {
            if (delta > 0) {
              const more = Math.min(delta, item.count);
              item.count -= more;
              entry.fridgeDeductedAtLog = (entry.fridgeDeductedAtLog ?? 0) + more;
            } else {
              const refund = Math.min(-delta, entry.fridgeDeductedAtLog ?? 0);
              item.count += refund;
              entry.fridgeDeductedAtLog = (entry.fridgeDeductedAtLog ?? 0) - refund;
            }
            await item.save();
          }
        }
      }
    }
  } else if (grams !== undefined) {
    entry.grams = grams;
  }

  await entry.save();
  res.json(entry);
});

router.delete("/:id", async (req, res) => {
  const entry = await CalorieEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });
  entry.deletedAt = new Date();
  await entry.save();

  if (entry.entryMode === "perUnit" && (entry.fridgeDeductedAtLog ?? 0) > 0) {
    const item = await FridgeItem.findOne({ foodId: entry.foodId });
    if (item) {
      item.count += entry.fridgeDeductedAtLog ?? 0;
      await item.save();
    }
  }

  res.json({ ok: true });
});

// ===========================================================
// CHEAT DAYS
// ===========================================================

router.get("/cheat-day", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const cd = await CheatDay.findOne({ date: day });
  res.json(cd);
});

router.put("/cheat-day", async (req, res) => {
  const { date, on, note } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  if (!on) {
    await CheatDay.deleteOne({ date: day });
    return res.json({ ok: true, removed: true });
  }

  const result = await CheatDay.findOneAndUpdate({ date: day }, { note: note || "" }, { upsert: true, new: true });
  res.json(result);
});

// ===========================================================
// WATER
// ===========================================================

router.get("/water/day", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const entries = await WaterEntry.find({ date: day, deletedAt: null }).sort({ createdAt: 1 });
  res.json(entries);
});

router.post("/water", async (req, res) => {
  const { date, ml } = req.body;
  const day = parseDayUTC(date);
  if (!day || !isPositiveNumber(ml)) {
    return res.status(400).json({ error: "valid date and positive ml required" });
  }
  const entry = await WaterEntry.create({ date: day, ml });
  res.json(entry);
});

router.delete("/water/:id", async (req, res) => {
  const entry = await WaterEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });
  entry.deletedAt = new Date();
  await entry.save();
  res.json({ ok: true });
});

// ===========================================================
// GOALS
// ===========================================================

router.get("/goal", async (_req, res) => {
  let goal = await Goal.findOne();
  if (!goal) {
    goal = await Goal.create({});
  }
  res.json(goal);
});

// ===========================================================
// WEEK SUMMARY
// ===========================================================

router.get("/week-summary", async (req, res) => {
  const startDay = parseDayUTC(req.query.startDate);
  if (!startDay) return res.status(400).json({ error: "valid startDate required" });

  const start = fridayOnOrBefore(startDay);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7); // exclusive

  const [entries, cheatDays, waterEntries, goal] = await Promise.all([CalorieEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1 }), CheatDay.find({ date: { $gte: start, $lt: end } }), WaterEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1 }), Goal.findOne() ?? Goal.create({})]);

  const cheatSet = new Set(cheatDays.map((c) => c.date.toISOString().slice(0, 10)));

  // Compute per-entry totals
  function entryTotals(e: (typeof entries)[number]) {
    if (e.entryMode === "perUnit") {
      const n = e.units ?? 0;
      return {
        cal: n * (e.caloriesPerUnitSnapshot ?? 0),
        p: n * (e.proteinPerUnitSnapshot ?? 0),
        c: n * (e.carbsPerUnitSnapshot ?? 0),
        f: n * (e.fatPerUnitSnapshot ?? 0),
      };
    }
    const g = e.grams ?? 0;
    return {
      cal: g * (e.caloriesPerGramSnapshot ?? 0),
      p: g * (e.proteinPerGramSnapshot ?? 0),
      c: g * (e.carbsPerGramSnapshot ?? 0),
      f: g * (e.fatPerGramSnapshot ?? 0),
    };
  }

  // Build per-day buckets (always 7 days, zero-filled, even cheat days included for visibility)
  const days: {
    date: string;
    isCheat: boolean;
    cal: number;
    p: number;
    c: number;
    f: number;
    water: number;
    byMeal: Record<Meal, number>;
  }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      isCheat: cheatSet.has(iso),
      cal: 0,
      p: 0,
      c: 0,
      f: 0,
      water: 0,
      byMeal: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
    });
  }
  const dayIndex: Record<string, number> = {};
  days.forEach((d, i) => (dayIndex[d.date] = i));

  for (const e of entries) {
    const iso = e.date.toISOString().slice(0, 10);
    const idx = dayIndex[iso];
    if (idx === undefined) continue;
    const t = entryTotals(e);
    days[idx].cal += t.cal;
    days[idx].p += t.p;
    days[idx].c += t.c;
    days[idx].f += t.f;
    days[idx].byMeal[e.meal as Meal] = (days[idx].byMeal[e.meal as Meal] || 0) + t.cal;
  }
  for (const w of waterEntries) {
    const iso = w.date.toISOString().slice(0, 10);
    const idx = dayIndex[iso];
    if (idx === undefined) continue;
    days[idx].water += w.ml;
  }

  // Aggregate weekly stats — EXCLUDING cheat days
  const tracked = days.filter((d) => !d.isCheat);
  const trackedCount = tracked.length || 1;

  const totals = tracked.reduce(
    (acc, d) => {
      acc.cal += d.cal;
      acc.p += d.p;
      acc.c += d.c;
      acc.f += d.f;
      acc.water += d.water;
      acc.byMeal.breakfast += d.byMeal.breakfast;
      acc.byMeal.lunch += d.byMeal.lunch;
      acc.byMeal.dinner += d.byMeal.dinner;
      acc.byMeal.snack += d.byMeal.snack;
      return acc;
    },
    { cal: 0, p: 0, c: 0, f: 0, water: 0, byMeal: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 } },
  );

  const avg = {
    cal: totals.cal / trackedCount,
    p: totals.p / trackedCount,
    c: totals.c / trackedCount,
    f: totals.f / trackedCount,
    water: totals.water / trackedCount,
  };

  // Best/worst day (tracked only, by calorie adherence — closest to target without going over is "best")
  let bestDay: (typeof tracked)[number] | null = null;
  let worstDay: (typeof tracked)[number] | null = null;
  if (tracked.length > 0 && goal) {
    const target = goal.caloriesTarget;
    let bestScore = Infinity;
    let worstScore = -Infinity;
    for (const d of tracked) {
      if (d.cal === 0) continue; // skip empty days
      // score: distance from target, with penalty for going over
      const over = Math.max(0, d.cal - target);
      const under = Math.max(0, target - d.cal);
      const score = over * 2 + under; // overshooting hurts more
      if (score < bestScore) {
        bestScore = score;
        bestDay = d;
      }
      if (score > worstScore) {
        worstScore = score;
        worstDay = d;
      }
    }
  }

  // Goal attainment counts (tracked days only)
  let calorieGoalDays = 0;
  let proteinGoalDays = 0;
  let carbsGoalDays = 0;
  let fatGoalDays = 0;
  let waterGoalDays = 0;
  if (goal) {
    for (const d of tracked) {
      if (d.cal > 0 && d.cal <= goal.caloriesTarget) calorieGoalDays++;
      if (d.p > 0 && d.p <= goal.proteinTarget) proteinGoalDays++;
      if (d.c > 0 && d.c <= goal.carbsTarget) carbsGoalDays++;
      if (d.f > 0 && d.f <= goal.fatTarget) fatGoalDays++;
      if (d.water >= goal.waterMin) waterGoalDays++;
    }
  }

  res.json({
    startDate: start.toISOString().slice(0, 10),
    endDate: days[6].date,
    days,
    totals,
    avg,
    trackedCount,
    cheatDayCount: days.length - tracked.length,
    bestDay,
    worstDay,
    goalAttainment: {
      calorieGoalDays,
      proteinGoalDays,
      carbsGoalDays,
      fatGoalDays,
      waterGoalDays,
      totalTrackedDays: trackedCount,
    },
    goal,
  });
});

router.get("/coach-report", async (req, res) => {
  const startDay = parseDayUTC(req.query.startDate);
  if (!startDay) return res.status(400).json({ error: "valid startDate required" });

  const start = fridayOnOrBefore(startDay);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const [entries, cheatDays, waterEntries, goal] = await Promise.all([
    CalorieEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1, createdAt: 1 }),
    CheatDay.find({ date: { $gte: start, $lt: end } }),
    WaterEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1 }),
    Goal.findOne(),
  ]);

  const cheatSet = new Set(cheatDays.map((c) => c.date.toISOString().slice(0, 10)));

  function entryTotals(e: (typeof entries)[number]) {
    if (e.entryMode === "perUnit") {
      const n = e.units ?? 0;
      return {
        cal: n * (e.caloriesPerUnitSnapshot ?? 0),
        p: n * (e.proteinPerUnitSnapshot ?? 0),
        c: n * (e.carbsPerUnitSnapshot ?? 0),
        f: n * (e.fatPerUnitSnapshot ?? 0),
      };
    }
    const g = e.grams ?? 0;
    return {
      cal: g * (e.caloriesPerGramSnapshot ?? 0),
      p: g * (e.proteinPerGramSnapshot ?? 0),
      c: g * (e.carbsPerGramSnapshot ?? 0),
      f: g * (e.fatPerGramSnapshot ?? 0),
    };
  }

  type ItemLog = { name: string; amount: string; cal: number; p: number; c: number; f: number };
  type DayBucket = {
    date: string;
    isCheat: boolean;
    cal: number;
    p: number;
    c: number;
    f: number;
    water: number;
    byMeal: Record<Meal, ItemLog[]>;
  };

  const days: DayBucket[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      isCheat: cheatSet.has(iso),
      cal: 0,
      p: 0,
      c: 0,
      f: 0,
      water: 0,
      byMeal: { breakfast: [], lunch: [], dinner: [], snack: [] },
    });
  }
  const dayIndex: Record<string, number> = {};
  days.forEach((d, i) => (dayIndex[d.date] = i));

  for (const e of entries) {
    const iso = e.date.toISOString().slice(0, 10);
    const idx = dayIndex[iso];
    if (idx === undefined) continue;
    const t = entryTotals(e);
    days[idx].cal += t.cal;
    days[idx].p += t.p;
    days[idx].c += t.c;
    days[idx].f += t.f;
    const unitText = e.unitLabelSnapshot || "unit";
    const amount = e.entryMode === "perUnit" ? `${e.units} ${unitText}${(e.units ?? 0) > 1 ? "s" : ""}` : `${e.grams}g`;
    days[idx].byMeal[e.meal as Meal].push({
      name: e.foodNameSnapshot,
      amount,
      cal: t.cal,
      p: t.p,
      c: t.c,
      f: t.f,
    });
  }
  for (const w of waterEntries) {
    const iso = w.date.toISOString().slice(0, 10);
    const idx = dayIndex[iso];
    if (idx === undefined) continue;
    days[idx].water += w.ml;
  }

  const totals = days.reduce(
    (acc, d) => {
      acc.cal += d.cal;
      acc.p += d.p;
      acc.c += d.c;
      acc.f += d.f;
      acc.water += d.water;
      return acc;
    },
    { cal: 0, p: 0, c: 0, f: 0, water: 0 },
  );

  const daysWithLogs = days.filter((d) => d.cal > 0 || d.water > 0).length || 1;
  const avg = {
    cal: totals.cal / daysWithLogs,
    p: totals.p / daysWithLogs,
    c: totals.c / daysWithLogs,
    f: totals.f / daysWithLogs,
    water: totals.water / daysWithLogs,
  };

  res.json({
    startDate: start.toISOString().slice(0, 10),
    endDate: days[6].date,
    days,
    totals,
    avg,
    daysWithLogs,
    cheatDayCount: days.filter((d) => d.isCheat).length,
    goal,
  });
});

// ===========================================================
// WEIGHT JOURNEY
// ===========================================================

// Paged newest-first, not oldest-first as before: a bounded window of the *latest*
// weigh-ins is the useful one for the chart. The client re-sorts ascending to plot.
router.get("/weight", async (req, res) => {
  const page = parsePageParams(req.query);
  const filter = { deletedAt: null };
  const [entries, total] = await Promise.all([
    WeightEntry.find(filter).sort({ date: -1 }).skip(page.offset).limit(page.limit),
    WeightEntry.countDocuments(filter),
  ]);
  res.json(pageOf(entries, total, page));
});

router.post("/weight", async (req, res) => {
  const { date, weightKg, note } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (!isPositiveNumber(weightKg)) {
    return res.status(400).json({ error: "positive weightKg required" });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  const entry = await WeightEntry.findOneAndUpdate(
    { date: day, deletedAt: null },
    { weightKg, note: note ?? "" },
    { upsert: true, new: true },
  );
  res.json(entry);
});

router.patch("/weight/:id", async (req, res) => {
  const { weightKg, note, date } = req.body;

  if ("weightKg" in req.body && !isPositiveNumber(weightKg)) {
    return res.status(400).json({ error: "positive weightKg required" });
  }
  if ("note" in req.body && note !== null && note !== undefined && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }
  let day: Date | null = null;
  if ("date" in req.body) {
    day = parseDayUTC(date);
    if (!day) return res.status(400).json({ error: "valid date required" });
  }

  const entry = await WeightEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  if ("weightKg" in req.body) entry.weightKg = weightKg;
  if ("note" in req.body) entry.note = note ?? "";
  if (day) entry.date = day;

  await entry.save();
  res.json(entry);
});

router.delete("/weight/:id", async (req, res) => {
  const entry = await WeightEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });
  entry.deletedAt = new Date();
  await entry.save();
  res.json({ ok: true });
});

router.get("/weight-goal", async (_req, res) => {
  let goal = await WeightGoal.findOne();
  if (!goal) goal = await WeightGoal.create({});
  res.json(goal);
});

export default router;
