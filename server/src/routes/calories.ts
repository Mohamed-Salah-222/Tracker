import { Router } from "express";
import type { Types } from "mongoose";
import { CalorieEntry, MEAL_SLOTS } from "../models/CalorieEntry";
import { Food } from "../models/Food";
// NOTE: the CalorieEntry field stays `fridgeDeductedAtLog`; it holds live data on
// existing entries, so only the model reference was renamed, not the stored field.
import { KitchenItem } from "../models/KitchenItem";
import { CheatDay } from "../models/CheatDay";
import { WaterEntry } from "../models/WaterEntry";
import { Goal } from "../models/Goal";
import { TrackerGoals, loadTrackerGoals, mergeLegacyGoal } from "../models/TrackerGoals";
import { applyMeasurements, shapeEntry } from "../lib/body-log";
import { WeightEntry } from "../models/WeightEntry";
import { WeightGoal } from "../models/WeightGoal";
import { isNonNegativeNumber, isObjectId, isPositiveNumber, objectIdParam, parseDayUTC } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";
import { deductFromKitchen, logFood, type FoodDoc } from "../lib/log-food";

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

  const amount = food.entryMode === "perUnit" ? units : grams;
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ error: food.entryMode === "perUnit" ? "units > 0 required" : "grams > 0 required" });
  }

  const { entry, shortfall } = await logFood(day, food as unknown as FoodDoc, meal as Parameters<typeof logFood>[2], amount);
  res.json(shortfall > 0 ? { ...entry.toObject(), kitchenShortfall: shortfall } : entry);
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
  const fields = ["caloriesTarget", "caloriesMin", "proteinTarget", "carbsTarget", "fatTarget", "waterMin", "waterTarget", "waterMax"] as const;
  for (const f of fields) {
    if (req.body[f] !== undefined && !isNonNegativeNumber(req.body[f])) {
      return res.status(400).json({ error: `${f} must be a non-negative number` });
    }
  }

  await mergeLegacyGoal(await Goal.findOne());
  const doc = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));

  // The page speaks in waterMin/waterTarget/waterMax; the store names them by unit.
  const map: Record<string, string> = { caloriesMin: "caloriesMinTarget", waterMin: "waterMinMl", waterTarget: "waterTargetMl", waterMax: "waterMaxMl" };
  for (const f of fields) {
    if (req.body[f] === undefined) continue;
    doc.set(map[f] ?? f, req.body[f]);
  }
  try {
    await doc.save();
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "invalid targets" });
  }
  res.json(await goalPayload());
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

  // Sending grams for a per-unit entry used to answer 200 having changed nothing.
  const wrongMode = entry.entryMode === "perUnit" ? grams : units;
  if (wrongMode !== undefined) {
    return res.status(400).json({ error: entry.entryMode === "perUnit" ? "this entry is counted in units, not grams" : "this entry is counted in grams, not units" });
  }

  const amountChanged = entry.entryMode === "perUnit" ? units : grams;
  if (amountChanged !== undefined) {
    const oldAmount = (entry.entryMode === "perUnit" ? entry.units : entry.grams) ?? 0;
    if (entry.entryMode === "perUnit") entry.units = amountChanged;
    else entry.grams = amountChanged;

    // Eating more takes more off the shelf; eating less puts some back.
    if ((entry.fridgeDeductedAtLog ?? 0) > 0) {
      const delta = amountChanged - oldAmount;
      if (delta !== 0) {
        const item = await KitchenItem.findOne({ foodId: entry.foodId });
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

  await entry.save();
  res.json(entry);
});

router.delete("/:id", async (req, res) => {
  const entry = await CalorieEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });
  entry.deletedAt = new Date();
  await entry.save();

  if ((entry.fridgeDeductedAtLog ?? 0) > 0) {
    const item = await KitchenItem.findOne({ foodId: entry.foodId });
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

/**
 * Put a deleted entry back.
 *
 * Deletes were already soft, so the row never went anywhere; nothing exposed a way
 * to reach it. A mis-tap on the bin was permanent for no reason.
 */
router.post("/:id/restore", async (req, res) => {
  const entry = await CalorieEntry.findById(req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  if (!entry.deletedAt) return res.json(entry);

  // Take the food back off the shelf, the way logging it the first time did.
  if ((entry.fridgeDeductedAtLog ?? 0) > 0) {
    const item = await KitchenItem.findOne({ foodId: entry.foodId });
    if (item) {
      const back = Math.min(entry.fridgeDeductedAtLog ?? 0, item.count);
      item.count -= back;
      entry.fridgeDeductedAtLog = back;
      await item.save();
    } else {
      entry.fridgeDeductedAtLog = 0;
    }
  }
  entry.deletedAt = null;
  await entry.save();
  res.json(entry);
});

/**
 * Copy a day, or one meal of it, onto another day. Eating the same breakfast four
 * days a week meant retyping it four times.
 *
 * Entries are re-logged rather than cloned, so each takes a fresh snapshot of the
 * food as it is now and takes its own bite out of the kitchen.
 */
router.post("/copy", async (req, res) => {
  const from = parseDayUTC(req.body?.from);
  const to = parseDayUTC(req.body?.to);
  if (!from || !to) return res.status(400).json({ error: "valid from and to dates required" });
  if (from.getTime() === to.getTime()) return res.status(400).json({ error: "pick a different day to copy onto" });

  const meal = req.body?.meal;
  if (meal !== undefined && (typeof meal !== "string" || !isValidMeal(meal))) {
    return res.status(400).json({ error: "invalid meal" });
  }

  const filter: Record<string, unknown> = { date: from, deletedAt: null };
  if (meal) filter.meal = meal;
  const source = await CalorieEntry.find(filter).sort({ createdAt: 1 });
  if (source.length === 0) return res.status(400).json({ error: meal ? "nothing logged for that meal" : "nothing logged that day" });

  const foods = await Food.find({ _id: { $in: source.map((e) => e.foodId) }, archived: false });
  const byId = new Map(foods.map((f) => [String(f._id), f as unknown as FoodDoc]));

  let copied = 0;
  let skipped = 0;
  const shortfalls: { name: string; amount: number; unit: "g" | "unit" }[] = [];
  for (const e of source) {
    const food = byId.get(String(e.foodId));
    if (!food) {
      skipped++;
      continue;
    }
    const amount = (e.entryMode === "perUnit" ? e.units : e.grams) ?? 0;
    if (amount <= 0) {
      skipped++;
      continue;
    }
    const { shortfall } = await logFood(to, food, e.meal, amount);
    copied++;
    if (shortfall > 0) shortfalls.push({ name: food.name, amount: shortfall, unit: food.entryMode === "perGram" ? "g" : "unit" });
  }

  if (copied === 0) return res.status(400).json({ error: "none of those foods still exist" });
  res.json({ copied, skipped, shortfalls });
});

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

/** One glass, bottle or jug. Anything past this is a slipped decimal point. */
const MAX_WATER_PER_LOG_ML = 5000;

router.post("/water", async (req, res) => {
  const { date, ml } = req.body;
  const day = parseDayUTC(date);
  if (!day || !isPositiveNumber(ml)) {
    return res.status(400).json({ error: "valid date and positive ml required" });
  }
  if (ml > MAX_WATER_PER_LOG_ML) {
    return res.status(400).json({ error: `${MAX_WATER_PER_LOG_ML}ml is the most one entry can hold; add another if you really drank more` });
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

/**
 * The page's view of the targets. They live in TrackerGoals now, the same document
 * the dashboard reads, so the two cannot report different numbers at each other.
 */
async function goalPayload() {
  await mergeLegacyGoal(await Goal.findOne());
  const g = await loadTrackerGoals();
  return {
    caloriesTarget: g.caloriesTarget,
    caloriesMin: g.caloriesMinTarget,
    proteinTarget: g.proteinTarget,
    carbsTarget: g.carbsTarget,
    fatTarget: g.fatTarget,
    waterMin: g.waterMinMl,
    waterTarget: g.waterTargetMl,
    waterMax: g.waterMaxMl,
  };
}

router.get("/goal", async (_req, res) => {
  res.json(await goalPayload());
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

  const [entries, cheatDays, waterEntries, goal] = await Promise.all([CalorieEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1 }), CheatDay.find({ date: { $gte: start, $lt: end } }), WaterEntry.find({ date: { $gte: start, $lt: end }, deletedAt: null }).sort({ date: 1 }), goalPayload()]);

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

  // Aggregate weekly stats, EXCLUDING cheat days
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

  // Best/worst day (tracked only, by calorie adherence: closest to target without going over is "best")
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
    goalPayload(),
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
  res.json(pageOf(entries.map(shapeEntry), total, page));
});

/**
 * The same collection the body log writes, so this goes through the same code.
 *
 * It used to take a weight and a note and drop everything else on the floor, which
 * is why four body-composition fields sat on the model for months with no way to
 * fill them in.
 */
router.post("/weight", async (req, res) => {
  const day = parseDayUTC(req.body?.date);
  if (!day) return res.status(400).json({ error: "valid date required" });

  const existing = await WeightEntry.findOne({ date: day, deletedAt: null });
  const doc = existing ?? new WeightEntry({ date: day });
  const applied = applyMeasurements(doc, req.body ?? {}, { requireWeight: !existing });
  if (!applied.ok) return res.status(400).json({ error: applied.error });

  await doc.save();
  res.json(shapeEntry(doc));
});

router.patch("/weight/:id", async (req, res) => {
  const entry = await WeightEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  if ("date" in req.body) {
    const day = parseDayUTC(req.body.date);
    if (!day) return res.status(400).json({ error: "valid date required" });
    entry.date = day;
  }
  const applied = applyMeasurements(entry, req.body ?? {}, { requireWeight: false });
  if (!applied.ok) return res.status(400).json({ error: applied.error });

  await entry.save();
  res.json(shapeEntry(entry));
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
