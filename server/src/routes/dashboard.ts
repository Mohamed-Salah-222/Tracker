import { Router } from "express";
import { IncomeEntry } from "../models/IncomeEntry";
import { Expense } from "../models/Expense";
import { Wallet } from "../models/Wallet";
import { Task } from "../models/Task";
import { CalorieEntry } from "../models/CalorieEntry";
import { FridgeItem } from "../models/FridgeItem";
import { WaterEntry } from "../models/WaterEntry";
import { CheatDay } from "../models/CheatDay";
import { Goal } from "../models/Goal";
import { WorkoutSession } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { toDayUTC, monthRange } from "../lib/dates";

const router = Router();

function last7DaysISO(): string[] {
  const out: string[] = [];
  const today = toDayUTC(new Date().toISOString().slice(0, 10));
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Hardcoded workout exercise counts (mirror of frontend constants)
const WORKOUT_A_SET_COUNT = 4 + 4 + 3 + 3 + 3 + 3 + 3; // 23 sets
const WORKOUT_B_SET_COUNT = 4 + 3 + 3 + 3 + 3; // 16 sets

router.get("/", async (_req, res) => {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const today = toDayUTC(todayISO);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const days = last7DaysISO();
  const sevenAgo = toDayUTC(days[0]);

  const { start: monthStart, end: monthEnd } = monthRange(now.getFullYear(), now.getMonth() + 1);

  // ===== Income =====
  const incomeEntries = await IncomeEntry.find({
    date: { $gte: monthStart, $lt: monthEnd },
    deletedAt: null,
  });
  const incomeMonthTotal = incomeEntries.reduce((s, e) => s + e.amount, 0);

  const incomeRecent = await IncomeEntry.find({
    date: { $gte: sevenAgo, $lt: tomorrow },
    deletedAt: null,
  });
  const incomeByDay: Record<string, number> = {};
  for (const d of days) incomeByDay[d] = 0;
  for (const e of incomeRecent) {
    const k = e.date.toISOString().slice(0, 10);
    if (k in incomeByDay) incomeByDay[k] += e.amount;
  }
  const incomeSparkline = days.map((d) => ({ date: d, value: incomeByDay[d] }));
  const incomeToday = incomeByDay[todayISO] ?? 0;

  // ===== Wallets / Payments =====
  const wallets = await Wallet.find({ archived: false }).sort({ createdAt: 1 });
  const walletTotal = wallets.reduce((s, w) => s + w.balance, 0);

  const expenseRecent = await Expense.find({
    date: { $gte: sevenAgo, $lt: tomorrow },
    deletedAt: null,
  });
  const spendByDay: Record<string, number> = {};
  for (const d of days) spendByDay[d] = 0;
  for (const e of expenseRecent) {
    const k = e.date.toISOString().slice(0, 10);
    if (k in spendByDay) spendByDay[k] += e.amount;
  }
  const spendSparkline = days.map((d) => ({ date: d, value: spendByDay[d] }));
  const spentToday = spendByDay[todayISO] ?? 0;

  const expenseMonth = await Expense.find({
    date: { $gte: monthStart, $lt: monthEnd },
    deletedAt: null,
  });
  const spentMonth = expenseMonth.reduce((s, e) => s + e.amount, 0);

  const recentExpenses = await Expense.find({ deletedAt: null }).sort({ date: -1, createdAt: -1 }).limit(5);

  // ===== Tasks =====
  const todayTasks = await Task.find({ date: today }).sort({ createdAt: 1 });
  const todayDone = todayTasks.filter((t) => t.done).length;

  const sevenAhead = new Date(today);
  sevenAhead.setUTCDate(sevenAhead.getUTCDate() + 7);
  const upcoming = await Task.find({
    date: { $gt: today, $lt: sevenAhead },
  }).sort({ date: 1 });

  // ===== Calories =====
  const todayEntries = await CalorieEntry.find({ date: today, deletedAt: null });
  let calToday = 0,
    pToday = 0,
    cToday = 0,
    fToday = 0;
  for (const e of todayEntries) {
    if (e.entryMode === "perUnit" && e.units) {
      calToday += e.units * e.caloriesPerUnitSnapshot;
      pToday += e.units * e.proteinPerUnitSnapshot;
      cToday += e.units * e.carbsPerUnitSnapshot;
      fToday += e.units * e.fatPerUnitSnapshot;
    } else if (e.grams) {
      calToday += e.grams * e.caloriesPerGramSnapshot;
      pToday += e.grams * e.proteinPerGramSnapshot;
      cToday += e.grams * e.carbsPerGramSnapshot;
      fToday += e.grams * e.fatPerGramSnapshot;
    }
  }

  const caloriesRecent = await CalorieEntry.find({
    date: { $gte: sevenAgo, $lt: tomorrow },
    deletedAt: null,
  });
  const calByDay: Record<string, number> = {};
  for (const d of days) calByDay[d] = 0;
  for (const e of caloriesRecent) {
    const k = e.date.toISOString().slice(0, 10);
    if (!(k in calByDay)) continue;
    if (e.entryMode === "perUnit" && e.units) {
      calByDay[k] += e.units * e.caloriesPerUnitSnapshot;
    } else if (e.grams) {
      calByDay[k] += e.grams * e.caloriesPerGramSnapshot;
    }
  }
  const caloriesSparkline = days.map((d) => ({ date: d, value: calByDay[d] }));

  // ===== Water =====
  const todayWater = await WaterEntry.find({ date: today, deletedAt: null });
  const waterTodayMl = todayWater.reduce((s, w) => s + w.ml, 0);

  // ===== Cheat day status for today =====
  const cheatToday = await CheatDay.findOne({ date: today });

  // ===== Goal =====
  let goal = await Goal.findOne();
  if (!goal) goal = await Goal.create({});

  // ===== Fridge =====
  const fridgeItems = await FridgeItem.find().sort({ count: 1, foodNameSnapshot: 1 });
  const fridgeTotal = fridgeItems.reduce((s, i) => s + i.count, 0);
  const fridgeEmpty = fridgeItems.filter((i) => i.count === 0).length;

  // ===== Workout (today's session + suggestion) =====
  const workoutSession = await WorkoutSession.findOne({ date: today });
  let workoutSetsDone = 0;
  let workoutSetsTotal = 0;
  let workoutSuggested: "A" | "B" = "A";

  if (workoutSession) {
    if (workoutSession.type === "A") workoutSetsTotal = WORKOUT_A_SET_COUNT;
    else if (workoutSession.type === "B") workoutSetsTotal = WORKOUT_B_SET_COUNT;

    if (workoutSession.type !== "rest") {
      const sets = await SetLog.find({ sessionId: workoutSession._id, done: true });
      workoutSetsDone = sets.length;
    }
  } else {
    // No session yet — compute suggestion
    const lastAB = await WorkoutSession.findOne({ type: { $in: ["A", "B"] } }).sort({ date: -1 });
    if (lastAB) workoutSuggested = lastAB.type === "A" ? "B" : "A";
  }

  // Workout streak: count consecutive days going back where there's any session
  const recentSessions = await WorkoutSession.find().sort({ date: -1 }).limit(14);
  let streak = 0;
  if (recentSessions.length > 0) {
    const cursor = new Date(today);
    for (const s of recentSessions) {
      const sIso = s.date.toISOString().slice(0, 10);
      const cIso = cursor.toISOString().slice(0, 10);
      if (sIso === cIso) {
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else if (sIso > cIso) {
        continue;
      } else {
        break;
      }
    }
  }

  res.json({
    today: todayISO,
    income: {
      monthTotal: incomeMonthTotal,
      todayAmount: incomeToday,
      sparkline: incomeSparkline,
    },
    payments: {
      walletTotal,
      spentToday,
      spentMonth,
      wallets,
      recentExpenses,
      sparkline: spendSparkline,
    },
    tasksToday: {
      list: todayTasks,
      done: todayDone,
      total: todayTasks.length,
    },
    tasksUpcoming: {
      list: upcoming,
    },
    calories: {
      todayCal: calToday,
      todayProtein: pToday,
      todayCarbs: cToday,
      todayFat: fToday,
      waterTodayMl,
      isCheat: !!cheatToday,
      sparkline: caloriesSparkline,
    },
    goal: {
      caloriesTarget: goal.caloriesTarget,
      caloriesBuffer: goal.caloriesBuffer,
      proteinMin: goal.proteinMin,
      proteinMax: goal.proteinMax,
      waterMin: goal.waterMin,
      waterTarget: goal.waterTarget,
      waterMax: goal.waterMax,
    },
    fridge: {
      items: fridgeItems,
      total: fridgeTotal,
      emptyCount: fridgeEmpty,
    },
    workout: {
      session: workoutSession,
      suggested: workoutSession ? null : workoutSuggested,
      setsDone: workoutSetsDone,
      setsTotal: workoutSetsTotal,
      streak,
    },
  });
});

export default router;
