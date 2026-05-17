import { Router } from "express";
import { Wallet } from "../models/Wallet";
import { Expense, EXPENSE_CATEGORIES } from "../models/Expense";
import { toDayUTC } from "../lib/dates";
import mongoose from "mongoose";

const router = Router();

// ===== WALLETS =====

router.get("/wallets", async (_req, res) => {
  const wallets = await Wallet.find({ archived: false }).sort({ createdAt: 1 });
  res.json(wallets);
});

router.post("/wallets", async (req, res) => {
  const { name, balance } = req.body;
  if (!name || typeof balance !== "number") {
    return res.status(400).json({ error: "name and balance required" });
  }
  const w = await Wallet.create({ name: name.trim(), balance });
  res.json(w);
});

router.patch("/wallets/:id", async (req, res) => {
  const { name, balance } = req.body;
  const w = await Wallet.findById(req.params.id);
  if (!w || w.archived) return res.status(404).json({ error: "not found" });
  if (typeof name === "string") w.name = name.trim();
  if (typeof balance === "number") w.balance = balance;
  await w.save();
  res.json(w);
});

router.delete("/wallets/:id", async (req, res) => {
  const w = await Wallet.findById(req.params.id);
  if (!w) return res.status(404).json({ error: "not found" });
  w.archived = true;
  await w.save();
  res.json({ ok: true });
});

// ===== EXPENSES =====

router.get("/expenses", async (req, res) => {
  const { from, to, walletId, category, search } = req.query;
  const filter: Record<string, unknown> = { deletedAt: null };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = toDayUTC(from as string);
    if (to) {
      const end = toDayUTC(to as string);
      end.setUTCDate(end.getUTCDate() + 1);
      dateFilter.$lt = end;
    }
    filter.date = dateFilter;
  }
  if (walletId) filter.walletId = walletId;
  if (category) filter.category = category;
  if (search) filter.name = { $regex: search as string, $options: "i" };

  const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
  res.json(expenses);
});

router.post("/expenses", async (req, res) => {
  const { name, amount, category, walletId, date } = req.body;
  if (!name || typeof amount !== "number" || amount <= 0 || !category || !walletId || !date) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "invalid category" });
  }

  const wallet = await Wallet.findById(walletId);
  if (!wallet || wallet.archived) return res.status(404).json({ error: "wallet not found" });

  const session = await mongoose.startSession();
  try {
    let expense;
    await session.withTransaction(async () => {
      wallet.balance -= amount;
      await wallet.save({ session });

      const created = await Expense.create(
        [
          {
            name: name.trim(),
            amount,
            category,
            walletId: wallet._id,
            walletNameSnapshot: wallet.name,
            date: toDayUTC(date),
          },
        ],
        { session },
      );
      expense = created[0];
    });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: "failed to create expense" });
  } finally {
    await session.endSession();
  }
});

router.patch("/expenses/:id", async (req, res) => {
  const { name, amount, category, walletId, date } = req.body;
  const exp = await Expense.findById(req.params.id);
  if (!exp || exp.deletedAt) return res.status(404).json({ error: "not found" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reverse old amount on old wallet
      const oldWallet = await Wallet.findById(exp.walletId).session(session);
      if (oldWallet) {
        oldWallet.balance += exp.amount;
        await oldWallet.save({ session });
      }

      // Determine new wallet
      const newWalletId = walletId ?? exp.walletId.toString();
      const newWallet = await Wallet.findById(newWalletId).session(session);
      if (!newWallet || newWallet.archived) throw new Error("wallet not found");

      const newAmount = typeof amount === "number" ? amount : exp.amount;
      if (newAmount <= 0) throw new Error("invalid amount");

      // Apply new amount on new wallet
      newWallet.balance -= newAmount;
      await newWallet.save({ session });

      // Update expense fields
      if (typeof name === "string") exp.name = name.trim();
      if (typeof amount === "number") exp.amount = amount;
      if (category) {
        if (!EXPENSE_CATEGORIES.includes(category)) throw new Error("invalid category");
        exp.category = category;
      }
      exp.walletId = newWallet._id;
      exp.walletNameSnapshot = newWallet.name;
      if (date) exp.date = toDayUTC(date);

      await exp.save({ session });
    });
    res.json(exp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    res.status(400).json({ error: msg });
  } finally {
    await session.endSession();
  }
});

router.delete("/expenses/:id", async (req, res) => {
  const exp = await Expense.findById(req.params.id);
  if (!exp || exp.deletedAt) return res.status(404).json({ error: "not found" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const wallet = await Wallet.findById(exp.walletId).session(session);
      if (wallet) {
        wallet.balance += exp.amount;
        await wallet.save({ session });
      }
      exp.deletedAt = new Date();
      await exp.save({ session });
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed" });
  } finally {
    await session.endSession();
  }
});

router.get("/categories", (_req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

router.get("/summary", async (req, res) => {
  const fromStr = req.query.from as string;
  const toStr = req.query.to as string;
  if (!fromStr || !toStr) return res.status(400).json({ error: "from and to required" });

  const from = toDayUTC(fromStr);
  const toEnd = toDayUTC(toStr);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const expenses = await Expense.find({
    date: { $gte: from, $lt: toEnd },
    deletedAt: null,
  }).sort({ date: 1, createdAt: 1 });

  // ---- Aggregates ----
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const count = expenses.length;

  // By category
  const byCategoryMap: Record<string, { amount: number; count: number }> = {};
  for (const e of expenses) {
    const k = e.category;
    if (!byCategoryMap[k]) byCategoryMap[k] = { amount: 0, count: 0 };
    byCategoryMap[k].amount += e.amount;
    byCategoryMap[k].count += 1;
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // By day (returns every day in range, zero-fill)
  const byDayMap: Record<string, number> = {};
  for (const e of expenses) {
    const k = e.date.toISOString().slice(0, 10);
    byDayMap[k] = (byDayMap[k] || 0) + e.amount;
  }
  const byDay: { date: string; amount: number }[] = [];
  const cursor = new Date(from);
  const end = new Date(toEnd);
  while (cursor < end) {
    const k = cursor.toISOString().slice(0, 10);
    byDay.push({ date: k, amount: byDayMap[k] || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Top 5 expenses by amount
  const topExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((e) => ({
      _id: e._id,
      name: e.name,
      amount: e.amount,
      category: e.category,
      walletNameSnapshot: e.walletNameSnapshot,
      date: e.date,
    }));

  // Working days (days with at least one expense)
  const daysWithExpenses = Object.keys(byDayMap).length;
  const daysInRange = byDay.length;
  const avgPerDay = daysInRange > 0 ? total / daysInRange : 0;
  const avgPerActiveDay = daysWithExpenses > 0 ? total / daysWithExpenses : 0;

  res.json({
    total,
    count,
    avgPerDay,
    avgPerActiveDay,
    daysWithExpenses,
    daysInRange,
    byCategory,
    byDay,
    topExpenses,
  });
});

export default router;
