import { Router } from "express";
import { IncomeEntry } from "../models/IncomeEntry";
import { Expense } from "../models/Expense";
import { Wallet } from "../models/Wallet";
import { Bank } from "../models/Bank";
import { Task } from "../models/Task";
import { CalorieEntry } from "../models/CalorieEntry";
import { FridgeItem } from "../models/FridgeItem";
import { WaterEntry } from "../models/WaterEntry";
import { CheatDay } from "../models/CheatDay";
import { Goal } from "../models/Goal";
import { WorkoutSession } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { Subscription } from "../models/Subscription";
import { WeightEntry } from "../models/WeightEntry";
import { WeightGoal } from "../models/WeightGoal";
import { WishlistItem } from "../models/WishlistItem";
import { CareerTopic } from "../models/CareerTopic";
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

const WORKOUT_UPPER_SET_COUNT = 8 * 3; // training sets
const WORKOUT_LOWER_SET_COUNT = 5 * 3; // training sets
const WORKOUT_ROTATION = ["upperA", "lowerA", "upperB", "lowerB"] as const;
type DashboardWorkoutType = (typeof WORKOUT_ROTATION)[number];

// Mirrors client/src/lib/career-curriculum.ts TOTAL_TOPICS.
const TOTAL_CAREER_TOPICS = 177;

type DashboardSubscriptions = {
  monthlyTotal: number;
  count: number;
  next: {
    name: string;
    price: number;
    billingDay: number;
    daysUntil: number;
    sourceNameSnapshot: string;
  } | null;
};

type DashboardWeight = {
  current: number | null;
  target: number;
  earliest: { date: string; weightKg: number } | null;
  lostSinceStart: number;
  remainingToTarget: number;
  sparkline: { date: string; value: number }[];
};

type DashboardWishlist = {
  totalToBuy: number;
  countLeft: number;
  topPriority: Awaited<ReturnType<typeof WishlistItem.find>>;
};

type DashboardCareer = {
  doneCount: number;
  totalTopics: number;
  percent: number;
  recentlyCompleted: number;
};

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
  const banks = await Bank.find({ archived: false }).sort({ createdAt: 1 });
  const walletsTotal = wallets.reduce((s, w) => s + w.balance, 0);
  const egpBanksTotal = banks.filter((b) => b.currency === "EGP").reduce((s, b) => s + b.balance, 0);
  const totalEgp = walletsTotal + egpBanksTotal;
  const totalUsd = banks.filter((b) => b.currency === "USD").reduce((s, b) => s + b.balance, 0);
  const walletTotal = totalEgp;

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
  const externalFundedToday = expenseRecent
    .filter((e) => e.sourceType === "external" && e.date.toISOString().slice(0, 10) === todayISO)
    .reduce((s, e) => s + e.amount, 0);

  const expenseMonth = await Expense.find({
    date: { $gte: monthStart, $lt: monthEnd },
    deletedAt: null,
  });
  const spentMonth = expenseMonth.reduce((s, e) => s + e.amount, 0);

  const recentExpenses = await Expense.find({ deletedAt: null }).sort({ date: -1, createdAt: -1 }).limit(5);

  // ===== Subscriptions =====
  const subscriptionDocs = await Subscription.find({ archived: false }).sort({ billingDay: 1, name: 1 });
  const subscriptionMonthlyTotal = subscriptionDocs.reduce((s, sub) => s + sub.price, 0);
  const todayDay = today.getUTCDate();
  let nextSubscription: DashboardSubscriptions["next"] = null;
  for (const sub of subscriptionDocs) {
    const daysUntil = sub.billingDay >= todayDay ? sub.billingDay - todayDay : 31 - todayDay + sub.billingDay;
    if (
      !nextSubscription ||
      daysUntil < nextSubscription.daysUntil ||
      (daysUntil === nextSubscription.daysUntil && sub.price > nextSubscription.price)
    ) {
      nextSubscription = {
        name: sub.name,
        price: sub.price,
        billingDay: sub.billingDay,
        daysUntil,
        sourceNameSnapshot: sub.sourceNameSnapshot,
      };
    }
  }
  const subscriptions: DashboardSubscriptions = {
    monthlyTotal: subscriptionMonthlyTotal,
    count: subscriptionDocs.length,
    next: nextSubscription,
  };

  // ===== Weight =====
  const weightEntries = await WeightEntry.find({ deletedAt: null }).sort({ date: 1 });
  let weightGoal = await WeightGoal.findOne();
  if (!weightGoal) weightGoal = await WeightGoal.create({});

  const firstWeight = weightEntries[0] ?? null;
  const latestWeight = weightEntries[weightEntries.length - 1] ?? null;
  const currentWeight = latestWeight?.weightKg ?? null;
  const targetWeight = weightGoal.targetKg;
  const weight: DashboardWeight = {
    current: currentWeight,
    target: targetWeight,
    earliest: firstWeight
      ? {
          date: firstWeight.date.toISOString().slice(0, 10),
          weightKg: firstWeight.weightKg,
        }
      : null,
    lostSinceStart: firstWeight && latestWeight && weightEntries.length >= 2 ? firstWeight.weightKg - latestWeight.weightKg : 0,
    remainingToTarget: currentWeight !== null && currentWeight > targetWeight ? currentWeight - targetWeight : 0,
    sparkline: weightEntries.slice(-30).map((entry) => ({
      date: entry.date.toISOString().slice(0, 10),
      value: entry.weightKg,
    })),
  };

  // ===== Wishlist =====
  const wishlistItems = await WishlistItem.find({ archived: false });
  const unboughtWishlist = wishlistItems.filter((item) => !item.bought);
  const wishlistPriorityRank = { high: 0, medium: 1, low: 2 } as const;
  const wishlist: DashboardWishlist = {
    totalToBuy: unboughtWishlist.reduce((s, item) => s + item.price, 0),
    countLeft: unboughtWishlist.length,
    topPriority: [...unboughtWishlist]
      .sort((a, b) => {
        const priorityDiff = wishlistPriorityRank[a.priority] - wishlistPriorityRank[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, 3),
  };

  // ===== Career =====
  const careerTopics = await CareerTopic.find();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const doneCount = careerTopics.filter((topic) => topic.done).length;
  const career: DashboardCareer = {
    doneCount,
    totalTopics: TOTAL_CAREER_TOPICS,
    percent: Math.round((doneCount / TOTAL_CAREER_TOPICS) * 100),
    recentlyCompleted: careerTopics.filter((topic) => topic.completedAt && topic.completedAt >= sevenDaysAgo).length,
  };

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
  let workoutSuggested: DashboardWorkoutType = "upperA";

  if (workoutSession) {
    if (workoutSession.type === "upperA" || workoutSession.type === "upperB") workoutSetsTotal = WORKOUT_UPPER_SET_COUNT;
    else if (workoutSession.type === "lowerA" || workoutSession.type === "lowerB") workoutSetsTotal = WORKOUT_LOWER_SET_COUNT;

    if (workoutSession.type !== "rest") {
      const sets = await SetLog.find({ sessionId: workoutSession._id, done: true });
      workoutSetsDone = sets.length;
    }
  } else {
    const lastWorkout = await WorkoutSession.findOne({ type: { $in: WORKOUT_ROTATION } }).sort({ date: -1 });
    if (lastWorkout) {
      const idx = WORKOUT_ROTATION.indexOf(lastWorkout.type as DashboardWorkoutType);
      if (idx !== -1) workoutSuggested = WORKOUT_ROTATION[(idx + 1) % WORKOUT_ROTATION.length];
    }
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
      totalEgp,
      totalUsd,
      spentToday,
      spentMonth,
      externalFundedToday: externalFundedToday ?? 0,
      wallets,
      banks,
      recentExpenses,
      sparkline: spendSparkline,
    },
    subscriptions,
    weight,
    wishlist,
    career,
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
      proteinTarget: goal.proteinTarget,
      carbsTarget: goal.carbsTarget,
      fatTarget: goal.fatTarget,
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
