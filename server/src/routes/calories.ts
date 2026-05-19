import { Router } from "express";
import { CalorieEntry, MEAL_SLOTS } from "../models/CalorieEntry";
import { Food } from "../models/Food";
import { FridgeItem } from "../models/FridgeItem";
import { CheatDay } from "../models/CheatDay";
import { WaterEntry } from "../models/WaterEntry";
import { Goal } from "../models/Goal";
import { toDayUTC } from "../lib/dates";

const router = Router();

type Meal = (typeof MEAL_SLOTS)[number];
function isValidMeal(m: string): m is Meal {
  return (MEAL_SLOTS as readonly string[]).includes(m);
}

// ===========================================================
// EXISTING ROUTES (preserved)
// ===========================================================

router.get("/day", async (req, res) => {
  const dateStr = req.query.date as string;
  if (!dateStr) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(dateStr);
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
  if (!date || !foodId || !meal) return res.status(400).json({ error: "missing fields" });
  if (!isValidMeal(meal)) return res.status(400).json({ error: "invalid meal" });

  const food = await Food.findById(foodId);
  if (!food || food.archived) return res.status(404).json({ error: "food not found" });

  const day = toDayUTC(date);

  if (food.entryMode === "perUnit") {
    const n = typeof units === "number" ? units : null;
    if (!n || n <= 0) return res.status(400).json({ error: "units > 0 required" });

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
    const g = typeof grams === "number" ? grams : null;
    if (!g || g <= 0) return res.status(400).json({ error: "grams > 0 required" });
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

router.patch("/:id", async (req, res) => {
  const entry = await CalorieEntry.findById(req.params.id);
  if (!entry || entry.deletedAt) return res.status(404).json({ error: "not found" });

  const { grams, units, meal } = req.body;

  if (meal) {
    if (!isValidMeal(meal)) return res.status(400).json({ error: "invalid meal" });
    entry.set("meal", meal);
  }

  if (entry.entryMode === "perUnit") {
    if (typeof units === "number") {
      if (units <= 0) return res.status(400).json({ error: "units > 0 required" });
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
  } else {
    if (typeof grams === "number") {
      if (grams <= 0) return res.status(400).json({ error: "grams > 0 required" });
      entry.grams = grams;
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
  const dateStr = req.query.date as string;
  if (!dateStr) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(dateStr);
  const cd = await CheatDay.findOne({ date: day });
  res.json(cd);
});

router.put("/cheat-day", async (req, res) => {
  const { date, on, note } = req.body;
  if (!date) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(date);

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
  const dateStr = req.query.date as string;
  if (!dateStr) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(dateStr);
  const entries = await WaterEntry.find({ date: day, deletedAt: null }).sort({ createdAt: 1 });
  res.json(entries);
});

router.post("/water", async (req, res) => {
  const { date, ml } = req.body;
  if (!date || typeof ml !== "number" || ml <= 0) {
    return res.status(400).json({ error: "date and positive ml required" });
  }
  const entry = await WaterEntry.create({ date: toDayUTC(date), ml });
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

router.patch("/goal", async (req, res) => {
  let goal = await Goal.findOne();
  if (!goal) goal = await Goal.create({});

  const fields = ["caloriesTarget", "caloriesBuffer", "proteinMin", "proteinMax", "waterMin", "waterTarget", "waterMax"] as const;
  for (const f of fields) {
    if (typeof req.body[f] === "number" && req.body[f] >= 0) {
      goal.set(f, req.body[f]);
    }
  }
  await goal.save();
  res.json(goal);
});

// ===========================================================
// WEEK SUMMARY
// ===========================================================

router.get("/week-summary", async (req, res) => {
  const startStr = req.query.startDate as string;
  if (!startStr) return res.status(400).json({ error: "startDate required" });

  const start = toDayUTC(startStr);
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
  let waterGoalDays = 0;
  if (goal) {
    for (const d of tracked) {
      if (d.cal > 0 && d.cal <= goal.caloriesTarget + goal.caloriesBuffer) calorieGoalDays++;
      if (d.p >= goal.proteinMin) proteinGoalDays++;
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
      waterGoalDays,
      totalTrackedDays: trackedCount,
    },
    goal,
  });
});

export default router;
