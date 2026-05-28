import { Router } from "express";
import { Wallet } from "../models/Wallet";
import { Bank, BANK_CURRENCIES } from "../models/Bank";
import { ExternalSource } from "../models/ExternalSource";
import { Expense, EXPENSE_CATEGORIES, EXPENSE_SOURCE_TYPES } from "../models/Expense";
import { MoneyMovement, MOVEMENT_TYPES, MovementType } from "../models/MoneyMovement";
import { Subscription, SUBSCRIPTION_SOURCE_TYPES } from "../models/Subscription";
import { WishlistItem, WISHLIST_PRIORITIES } from "../models/WishlistItem";
import { validateMovementShape } from "../lib/movement-validation";
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

// ===== BANKS =====

router.get("/banks", async (_req, res) => {
  const banks = await Bank.find({ archived: false }).sort({ createdAt: 1 });
  res.json(banks);
});

router.post("/banks", async (req, res) => {
  const { name, balance, currency } = req.body;
  if (!name || typeof balance !== "number" || !currency) {
    return res.status(400).json({ error: "name, balance, and currency required" });
  }
  if (!BANK_CURRENCIES.includes(currency as "EGP" | "USD")) {
    return res.status(400).json({ error: "invalid currency" });
  }
  const b = await Bank.create({ name: name.trim(), balance, currency: currency as "EGP" | "USD" });
  res.json(b);
});

router.patch("/banks/:id", async (req, res) => {
  const { name, balance, currency } = req.body;
  const b = await Bank.findById(req.params.id);
  if (!b || b.archived) return res.status(404).json({ error: "not found" });
  if (typeof name === "string") b.name = name.trim();
  if (typeof balance === "number") b.balance = balance;
  if (typeof currency === "string") {
    if (!BANK_CURRENCIES.includes(currency as "EGP" | "USD")) {
      return res.status(400).json({ error: "invalid currency" });
    }
    b.currency = currency as "EGP" | "USD";
  }
  await b.save();
  res.json(b);
});

router.delete("/banks/:id", async (req, res) => {
  const b = await Bank.findById(req.params.id);
  if (!b) return res.status(404).json({ error: "not found" });
  b.archived = true;
  await b.save();
  res.json({ ok: true });
});

// ===== EXTERNAL SOURCES =====

router.get("/external-sources", async (_req, res) => {
  const sources = await ExternalSource.find({ archived: false }).sort({ createdAt: 1 });
  res.json(sources);
});

router.post("/external-sources", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const s = await ExternalSource.create({ name: name.trim() });
  res.json(s);
});

router.patch("/external-sources/:id", async (req, res) => {
  const { name } = req.body;
  const s = await ExternalSource.findById(req.params.id);
  if (!s || s.archived) return res.status(404).json({ error: "not found" });
  if (typeof name === "string") s.name = name.trim();
  await s.save();
  res.json(s);
});

router.delete("/external-sources/:id", async (req, res) => {
  const s = await ExternalSource.findById(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  s.archived = true;
  await s.save();
  res.json({ ok: true });
});

// ===== EXPENSES =====

router.get("/expenses", async (req, res) => {
  const { from, to, sourceId, sourceType, category, search } = req.query;
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
  if (sourceId) filter.sourceId = sourceId;
  if (sourceType) filter.sourceType = sourceType;
  if (category) filter.category = category;
  if (search) filter.name = { $regex: search as string, $options: "i" };

  const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
  res.json(expenses);
});

router.post("/expenses", async (req, res) => {
  const { name, amount, category, sourceType, sourceId, date } = req.body;
  if (!name || typeof amount !== "number" || amount <= 0 || !category || !sourceType || !sourceId || !date) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "invalid category" });
  }
  if (!EXPENSE_SOURCE_TYPES.includes(sourceType)) {
    return res.status(400).json({ error: "invalid sourceType" });
  }

  if (sourceType === "wallet") {
    const wallet = await Wallet.findById(sourceId);
    if (!wallet || wallet.archived) return res.status(404).json({ error: "wallet not found" });

    const session = await mongoose.startSession();
    try {
      let expense;
      await session.withTransaction(async () => {
        wallet.balance -= amount;
        await wallet.save({ session });
        const created = await Expense.create(
          [{ name: name.trim(), amount, category, sourceType, sourceId: wallet._id, sourceNameSnapshot: wallet.name, date: toDayUTC(date) }],
          { session },
        );
        expense = created[0];
      });
      return res.json(expense);
    } catch {
      return res.status(500).json({ error: "failed to create expense" });
    } finally {
      await session.endSession();
    }
  }

  if (sourceType === "bank") {
    const bank = await Bank.findById(sourceId);
    if (!bank || bank.archived) return res.status(404).json({ error: "bank not found" });

    const session = await mongoose.startSession();
    try {
      let expense;
      await session.withTransaction(async () => {
        bank.balance -= amount;
        await bank.save({ session });
        const created = await Expense.create(
          [{ name: name.trim(), amount, category, sourceType, sourceId: bank._id, sourceNameSnapshot: bank.name, date: toDayUTC(date) }],
          { session },
        );
        expense = created[0];
      });
      return res.json(expense);
    } catch {
      return res.status(500).json({ error: "failed to create expense" });
    } finally {
      await session.endSession();
    }
  }

  // external — no balance change
  const ext = await ExternalSource.findById(sourceId);
  if (!ext || ext.archived) return res.status(404).json({ error: "external source not found" });

  const expense = await Expense.create({
    name: name.trim(),
    amount,
    category,
    sourceType,
    sourceId: ext._id,
    sourceNameSnapshot: ext.name,
    date: toDayUTC(date),
  });
  return res.json(expense);
});

router.patch("/expenses/:id", async (req, res) => {
  const { name, amount, category, sourceType, sourceId, date } = req.body;
  const exp = await Expense.findById(req.params.id);
  if (!exp || exp.deletedAt) return res.status(404).json({ error: "not found" });

  const newSourceType: string = sourceType ?? exp.sourceType;
  const newSourceId: string = sourceId ?? exp.sourceId.toString();

  if (!EXPENSE_SOURCE_TYPES.includes(newSourceType as (typeof EXPENSE_SOURCE_TYPES)[number])) {
    return res.status(400).json({ error: "invalid sourceType" });
  }
  if (category && !EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "invalid category" });
  }

  const newAmount = typeof amount === "number" ? amount : exp.amount;
  if (newAmount <= 0) return res.status(400).json({ error: "invalid amount" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Refund old source if wallet or bank
      if (exp.sourceType === "wallet") {
        const oldWallet = await Wallet.findById(exp.sourceId).session(session);
        if (oldWallet) { oldWallet.balance += exp.amount; await oldWallet.save({ session }); }
      } else if (exp.sourceType === "bank") {
        const oldBank = await Bank.findById(exp.sourceId).session(session);
        if (oldBank) { oldBank.balance += exp.amount; await oldBank.save({ session }); }
      }

      // Deduct from new source if wallet or bank
      if (newSourceType === "wallet") {
        const newWallet = await Wallet.findById(newSourceId).session(session);
        if (!newWallet || newWallet.archived) throw new Error("wallet not found");
        newWallet.balance -= newAmount;
        await newWallet.save({ session });
        exp.sourceId = newWallet._id;
        exp.sourceNameSnapshot = newWallet.name;
      } else if (newSourceType === "bank") {
        const newBank = await Bank.findById(newSourceId).session(session);
        if (!newBank || newBank.archived) throw new Error("bank not found");
        newBank.balance -= newAmount;
        await newBank.save({ session });
        exp.sourceId = newBank._id;
        exp.sourceNameSnapshot = newBank.name;
      } else {
        const ext = await ExternalSource.findById(newSourceId).session(session);
        if (!ext || ext.archived) throw new Error("external source not found");
        exp.sourceId = ext._id;
        exp.sourceNameSnapshot = ext.name;
      }

      exp.sourceType = newSourceType as (typeof EXPENSE_SOURCE_TYPES)[number];
      if (typeof name === "string") exp.name = name.trim();
      if (typeof amount === "number") exp.amount = amount;
      if (category) exp.category = category;
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
      if (exp.sourceType === "wallet") {
        const wallet = await Wallet.findById(exp.sourceId).session(session);
        if (wallet) { wallet.balance += exp.amount; await wallet.save({ session }); }
      } else if (exp.sourceType === "bank") {
        const bank = await Bank.findById(exp.sourceId).session(session);
        if (bank) { bank.balance += exp.amount; await bank.save({ session }); }
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

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const count = expenses.length;
  const externalFundedTotal = expenses.filter((e) => e.sourceType === "external").reduce((s, e) => s + e.amount, 0);

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

  // By source
  const bySourceMap: Record<string, { sourceType: string; sourceNameSnapshot: string; amount: number; count: number }> = {};
  for (const e of expenses) {
    const k = e.sourceId.toString();
    if (!bySourceMap[k]) bySourceMap[k] = { sourceType: e.sourceType, sourceNameSnapshot: e.sourceNameSnapshot, amount: 0, count: 0 };
    bySourceMap[k].amount += e.amount;
    bySourceMap[k].count += 1;
  }
  const bySource = Object.entries(bySourceMap)
    .map(([sourceId, v]) => ({ sourceId, ...v }))
    .sort((a, b) => b.amount - a.amount);

  // By day (zero-filled)
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
      sourceType: e.sourceType,
      sourceNameSnapshot: e.sourceNameSnapshot,
      date: e.date,
    }));

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
    externalFundedTotal,
    byCategory,
    bySource,
    byDay,
    topExpenses,
  });
});

// ===== MONEY MOVEMENTS =====

// Reverse the balance effects of an existing movement (used by PATCH and DELETE).
// Loads accounts without archived check so reversal always succeeds.
async function reverseMovementBalances(
  mov: { type: string; fromType?: unknown; fromId?: unknown; toType?: unknown; toId?: unknown; amountFrom: number; amountTo: number },
  session: mongoose.ClientSession,
): Promise<void> {
  const { type, fromType, fromId, toType, toId, amountFrom, amountTo } = mov;

  if (type === "adjustment") {
    if (fromType === "wallet" && fromId) {
      const acc = await Wallet.findById(fromId).session(session);
      if (acc) { acc.balance -= amountFrom; await acc.save({ session }); }
    } else if (fromType === "bank" && fromId) {
      const acc = await Bank.findById(fromId).session(session);
      if (acc) { acc.balance -= amountFrom; await acc.save({ session }); }
    }
  } else if (type === "family_in") {
    if (toType === "wallet" && toId) {
      const acc = await Wallet.findById(toId).session(session);
      if (acc) { acc.balance -= amountTo; await acc.save({ session }); }
    } else if (toType === "bank" && toId) {
      const acc = await Bank.findById(toId).session(session);
      if (acc) { acc.balance -= amountTo; await acc.save({ session }); }
    }
  } else {
    // withdraw, deposit, transfer_bank, transfer_wallet: reverse is from+=amountFrom, to-=amountTo
    if (fromType === "wallet" && fromId) {
      const acc = await Wallet.findById(fromId).session(session);
      if (acc) { acc.balance += amountFrom; await acc.save({ session }); }
    } else if (fromType === "bank" && fromId) {
      const acc = await Bank.findById(fromId).session(session);
      if (acc) { acc.balance += amountFrom; await acc.save({ session }); }
    }
    if (toType === "wallet" && toId) {
      const acc = await Wallet.findById(toId).session(session);
      if (acc) { acc.balance -= amountTo; await acc.save({ session }); }
    } else if (toType === "bank" && toId) {
      const acc = await Bank.findById(toId).session(session);
      if (acc) { acc.balance -= amountTo; await acc.save({ session }); }
    }
  }
}

// Resolve accounts, validate the movement shape, apply balance effects.
// Throws an error with .httpStatus attached on any failure.
// Returns snapshot fields to store on the MoneyMovement document.
async function applyMovementEffect(
  fields: {
    type: MovementType;
    fromType: string | null;
    fromId: string | null;
    toType: string | null;
    toId: string | null;
    amountFrom: number;
    amountTo: number;
    conversionRate: number;
  },
  session: mongoose.ClientSession,
): Promise<{ fromName: string | null; fromCurrency: string | null; toName: string | null; toCurrency: string | null }> {
  const { type, fromType, fromId, toType, toId, amountFrom, amountTo, conversionRate } = fields;

  let fromName: string | null = null;
  let fromCurrency: string | null = null;
  let toName: string | null = null;
  let toCurrency: string | null = null;

  // Variables for accounts that need balance updates (any: mongoose's generic findById return is too broad)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fromWallet: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fromBank: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toWallet: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toBank: any = null;

  // -- Resolve from-side --
  if (fromType === "wallet" && fromId) {
    fromWallet = await Wallet.findById(fromId).session(session);
    if (!fromWallet || fromWallet.archived) throw Object.assign(new Error("from wallet not found or archived"), { httpStatus: 404 });
    fromName = fromWallet.name;
    fromCurrency = "EGP";
  } else if (fromType === "bank" && fromId) {
    fromBank = await Bank.findById(fromId).session(session);
    if (!fromBank || fromBank.archived) throw Object.assign(new Error("from bank not found or archived"), { httpStatus: 404 });
    fromName = fromBank.name;
    fromCurrency = fromBank.currency;
  } else if (fromType === "external" && fromId) {
    const ext = await ExternalSource.findById(fromId).session(session);
    if (!ext || ext.archived) throw Object.assign(new Error("external source not found or archived"), { httpStatus: 404 });
    fromName = ext.name;
    fromCurrency = null;
  }

  // -- Resolve to-side --
  if (toType === "wallet" && toId) {
    toWallet = await Wallet.findById(toId).session(session);
    if (!toWallet || toWallet.archived) throw Object.assign(new Error("to wallet not found or archived"), { httpStatus: 404 });
    toName = toWallet.name;
    toCurrency = "EGP";
  } else if (toType === "bank" && toId) {
    toBank = await Bank.findById(toId).session(session);
    if (!toBank || toBank.archived) throw Object.assign(new Error("to bank not found or archived"), { httpStatus: 404 });
    toName = toBank.name;
    toCurrency = toBank.currency;
  }

  // -- Validate shape (with real currencies now known) --
  const validation = validateMovementShape(type, {
    fromType, fromId, toType, toId, amountFrom, amountTo, conversionRate,
    fromCurrency, toCurrency,
  });
  if (!validation.ok) throw Object.assign(new Error(validation.error), { httpStatus: 400 });

  // -- Apply balance effects --
  if (type === "adjustment") {
    const account = fromWallet ?? fromBank;
    if (!account) throw Object.assign(new Error("adjustment account not found"), { httpStatus: 404 });
    account.balance += amountFrom;
    await account.save({ session });
  } else if (type === "family_in") {
    const account = toWallet ?? toBank;
    if (!account) throw Object.assign(new Error("to account not found"), { httpStatus: 404 });
    account.balance += amountTo;
    await account.save({ session });
  } else {
    // withdraw, deposit, transfer_bank, transfer_wallet
    const fromAcc = fromWallet ?? fromBank;
    const toAcc = toWallet ?? toBank;
    if (!fromAcc) throw Object.assign(new Error("from account not found"), { httpStatus: 404 });
    if (!toAcc) throw Object.assign(new Error("to account not found"), { httpStatus: 404 });
    fromAcc.balance -= amountFrom;
    toAcc.balance += amountTo;
    await fromAcc.save({ session });
    await toAcc.save({ session });
  }

  return { fromName, fromCurrency, toName, toCurrency };
}

router.get("/movements", async (req, res) => {
  const { type, from, to, accountType, accountId } = req.query;
  const filter: Record<string, unknown> = { deletedAt: null };

  if (type) filter.type = type;
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
  if (accountId && accountType) {
    filter.$or = [
      { fromId: accountId, fromType: accountType },
      { toId: accountId, toType: accountType },
    ];
  } else if (accountId) {
    filter.$or = [{ fromId: accountId }, { toId: accountId }];
  } else if (accountType) {
    filter.$or = [{ fromType: accountType }, { toType: accountType }];
  }

  const movements = await MoneyMovement.find(filter).sort({ date: -1, createdAt: -1 });
  res.json(movements);
});

router.post("/movements", async (req, res) => {
  const { type, fromType, fromId, toType, toId, amountFrom, amountTo, conversionRate, date, note } = req.body;

  if (!MOVEMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: "invalid movement type" });
  }
  if (typeof amountFrom !== "number" || typeof amountTo !== "number" || typeof conversionRate !== "number") {
    return res.status(400).json({ error: "amountFrom, amountTo, conversionRate must be numbers" });
  }
  if (!date) return res.status(400).json({ error: "date required" });

  const session = await mongoose.startSession();
  try {
    let movement;
    await session.withTransaction(async () => {
      const snapshots = await applyMovementEffect(
        { type: type as MovementType, fromType: fromType ?? null, fromId: fromId ?? null, toType: toType ?? null, toId: toId ?? null, amountFrom, amountTo, conversionRate },
        session,
      );
      const created = await MoneyMovement.create([{
        type,
        fromType: fromType ?? null,
        fromId: fromId ?? null,
        fromNameSnapshot: snapshots.fromName,
        fromCurrencySnapshot: snapshots.fromCurrency,
        toType: toType ?? null,
        toId: toId ?? null,
        toNameSnapshot: snapshots.toName,
        toCurrencySnapshot: snapshots.toCurrency,
        amountFrom,
        amountTo,
        conversionRate,
        date: toDayUTC(date),
        note: note ?? "",
      }], { session });
      movement = created[0];
    });
    return res.json(movement);
  } catch (err) {
    const status = (err as any).httpStatus ?? 500;
    const msg = err instanceof Error ? err.message : "failed to create movement";
    return res.status(status).json({ error: msg });
  } finally {
    await session.endSession();
  }
});

router.patch("/movements/:id", async (req, res) => {
  const mov = await MoneyMovement.findById(req.params.id);
  if (!mov || mov.deletedAt) return res.status(404).json({ error: "not found" });

  const b = req.body;
  const newType: MovementType = ("type" in b ? b.type : mov.type) as MovementType;
  const newFromType: string | null = "fromType" in b ? (b.fromType ?? null) : (mov.fromType ?? null);
  const newFromId: string | null = "fromId" in b ? (b.fromId ?? null) : (mov.fromId?.toString() ?? null);
  const newToType: string | null = "toType" in b ? (b.toType ?? null) : (mov.toType ?? null);
  const newToId: string | null = "toId" in b ? (b.toId ?? null) : (mov.toId?.toString() ?? null);
  const newAmountFrom = typeof b.amountFrom === "number" ? b.amountFrom : mov.amountFrom;
  const newAmountTo = typeof b.amountTo === "number" ? b.amountTo : mov.amountTo;
  const newConversionRate = typeof b.conversionRate === "number" ? b.conversionRate : mov.conversionRate;

  if (!MOVEMENT_TYPES.includes(newType)) {
    return res.status(400).json({ error: "invalid movement type" });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Step a: reverse OLD balance effects
      await reverseMovementBalances(mov, session);

      // Steps b-c: resolve new accounts, validate, apply new balance effects
      const snapshots = await applyMovementEffect(
        { type: newType, fromType: newFromType, fromId: newFromId, toType: newToType, toId: newToId, amountFrom: newAmountFrom, amountTo: newAmountTo, conversionRate: newConversionRate },
        session,
      );

      // Step d: update snapshot fields on the movement doc
      mov.type = newType;
      (mov as any).fromType = newFromType;
      (mov as any).fromId = newFromId;
      mov.fromNameSnapshot = snapshots.fromName;
      mov.fromCurrencySnapshot = snapshots.fromCurrency;
      (mov as any).toType = newToType;
      (mov as any).toId = newToId;
      mov.toNameSnapshot = snapshots.toName;
      mov.toCurrencySnapshot = snapshots.toCurrency;
      mov.amountFrom = newAmountFrom;
      mov.amountTo = newAmountTo;
      mov.conversionRate = newConversionRate;
      if (b.date) mov.date = toDayUTC(b.date);
      if ("note" in b) mov.note = b.note ?? "";
      await mov.save({ session });
    });
    res.json(mov);
  } catch (err) {
    const status = (err as any).httpStatus ?? 400;
    const msg = err instanceof Error ? err.message : "failed to update movement";
    res.status(status).json({ error: msg });
  } finally {
    await session.endSession();
  }
});

router.delete("/movements/:id", async (req, res) => {
  const mov = await MoneyMovement.findById(req.params.id);
  if (!mov || mov.deletedAt) return res.status(404).json({ error: "not found" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reverseMovementBalances(mov, session);
      mov.deletedAt = new Date();
      await mov.save({ session });
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed to delete movement" });
  } finally {
    await session.endSession();
  }
});

// ===== SUBSCRIPTIONS =====

type SubscriptionSourceType = (typeof SUBSCRIPTION_SOURCE_TYPES)[number];

async function resolveSubscriptionSource(sourceType: SubscriptionSourceType, sourceId: string) {
  if (sourceType === "wallet") {
    const wallet = await Wallet.findById(sourceId);
    if (!wallet || wallet.archived) return null;
    return { sourceId: wallet._id, sourceNameSnapshot: wallet.name };
  }

  if (sourceType === "bank") {
    const bank = await Bank.findById(sourceId);
    if (!bank || bank.archived) return null;
    return { sourceId: bank._id, sourceNameSnapshot: bank.name };
  }

  const ext = await ExternalSource.findById(sourceId);
  if (!ext || ext.archived) return null;
  return { sourceId: ext._id, sourceNameSnapshot: ext.name };
}

router.get("/subscriptions", async (_req, res) => {
  const subscriptions = await Subscription.find({ archived: false }).sort({ billingDay: 1, name: 1 });
  res.json(subscriptions);
});

router.post("/subscriptions", async (req, res) => {
  const { name, price, sourceType, sourceId, billingDay } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name required" });
  }
  if (typeof price !== "number" || price < 0) {
    return res.status(400).json({ error: "invalid price" });
  }
  if (!SUBSCRIPTION_SOURCE_TYPES.includes(sourceType)) {
    return res.status(400).json({ error: "invalid sourceType" });
  }
  if (!sourceId) {
    return res.status(400).json({ error: "sourceId required" });
  }
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
    return res.status(400).json({ error: "invalid billingDay" });
  }

  const source = await resolveSubscriptionSource(sourceType, sourceId);
  if (!source) return res.status(404).json({ error: `${sourceType} not found` });

  const subscription = await Subscription.create({
    name: name.trim(),
    price,
    sourceType,
    sourceId: source.sourceId,
    sourceNameSnapshot: source.sourceNameSnapshot,
    billingDay,
  });
  res.json(subscription);
});

router.patch("/subscriptions/:id", async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription || subscription.archived) return res.status(404).json({ error: "not found" });

  const { name, price, sourceType, sourceId, billingDay } = req.body;

  if ("name" in req.body) {
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" });
    subscription.name = name.trim();
  }

  if ("price" in req.body) {
    if (typeof price !== "number" || price < 0) return res.status(400).json({ error: "invalid price" });
    subscription.price = price;
  }

  const sourceTypeProvided = "sourceType" in req.body;
  const sourceIdProvided = "sourceId" in req.body;
  if (sourceTypeProvided !== sourceIdProvided) {
    return res.status(400).json({ error: "sourceType and sourceId must be provided together" });
  }
  if (sourceTypeProvided && sourceIdProvided) {
    if (!SUBSCRIPTION_SOURCE_TYPES.includes(sourceType)) {
      return res.status(400).json({ error: "invalid sourceType" });
    }
    if (!sourceId) return res.status(400).json({ error: "sourceId required" });
    const source = await resolveSubscriptionSource(sourceType, sourceId);
    if (!source) return res.status(404).json({ error: `${sourceType} not found` });
    subscription.sourceType = sourceType;
    subscription.sourceId = source.sourceId;
    subscription.sourceNameSnapshot = source.sourceNameSnapshot;
  }

  if ("billingDay" in req.body) {
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
      return res.status(400).json({ error: "invalid billingDay" });
    }
    subscription.billingDay = billingDay;
  }

  await subscription.save();
  res.json(subscription);
});

router.delete("/subscriptions/:id", async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription || subscription.archived) return res.status(404).json({ error: "not found" });
  subscription.archived = true;
  await subscription.save();
  res.json({ ok: true });
});

// ===== WISHLIST =====

type WishlistPriority = (typeof WISHLIST_PRIORITIES)[number];
const wishlistPriorityRank: Record<WishlistPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function todayUTC() {
  return toDayUTC(new Date().toISOString().slice(0, 10));
}

router.get("/wishlist", async (_req, res) => {
  const items = await WishlistItem.find({ archived: false });
  items.sort((a, b) => {
    if (a.bought !== b.bought) return a.bought ? 1 : -1;
    const priorityDiff = wishlistPriorityRank[a.priority as WishlistPriority] - wishlistPriorityRank[b.priority as WishlistPriority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  res.json(items);
});

router.post("/wishlist", async (req, res) => {
  const { name, price, link, priority, notes } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name required" });
  }
  if (typeof price !== "number" || price < 0) {
    return res.status(400).json({ error: "invalid price" });
  }
  const nextPriority = priority ?? "medium";
  if (!WISHLIST_PRIORITIES.includes(nextPriority)) {
    return res.status(400).json({ error: "invalid priority" });
  }

  const item = await WishlistItem.create({
    name: name.trim(),
    price,
    bought: false,
    dateBought: null,
    link: typeof link === "string" ? link.trim() : "",
    priority: nextPriority,
    notes: typeof notes === "string" ? notes.trim() : "",
  });
  res.json(item);
});

router.patch("/wishlist/:id", async (req, res) => {
  const item = await WishlistItem.findById(req.params.id);
  if (!item || item.archived) return res.status(404).json({ error: "not found" });

  const { name, price, link, priority, notes, bought } = req.body;

  if ("name" in req.body) {
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" });
    item.name = name.trim();
  }
  if ("price" in req.body) {
    if (typeof price !== "number" || price < 0) return res.status(400).json({ error: "invalid price" });
    item.price = price;
  }
  if ("priority" in req.body) {
    if (!WISHLIST_PRIORITIES.includes(priority)) return res.status(400).json({ error: "invalid priority" });
    item.priority = priority;
  }
  if ("link" in req.body) item.link = typeof link === "string" ? link.trim() : "";
  if ("notes" in req.body) item.notes = typeof notes === "string" ? notes.trim() : "";
  if ("bought" in req.body) {
    if (typeof bought !== "boolean") return res.status(400).json({ error: "invalid bought" });
    if (!item.bought && bought) {
      item.dateBought = todayUTC();
    } else if (item.bought && !bought) {
      item.dateBought = null;
    }
    item.bought = bought;
  }

  await item.save();
  res.json(item);
});

router.delete("/wishlist/:id", async (req, res) => {
  const item = await WishlistItem.findById(req.params.id);
  if (!item || item.archived) return res.status(404).json({ error: "not found" });
  item.archived = true;
  await item.save();
  res.json({ ok: true });
});

export default router;
