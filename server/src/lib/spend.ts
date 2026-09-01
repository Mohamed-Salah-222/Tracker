import mongoose from "mongoose";
import { EXPENSE_CATEGORIES, Expense } from "../models/Expense";
import { Wallet } from "../models/Wallet";
import { Bank } from "../models/Bank";
import { ExternalSource } from "../models/ExternalSource";

export type SourceType = "wallet" | "bank" | "external";
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type SpendInput = {
  name: string;
  amount: number;
  category: ExpenseCategory;
  sourceType: SourceType;
  sourceId: string | mongoose.Types.ObjectId;
  date: Date;
};

export type SpendResult = { ok: true; expense: InstanceType<typeof Expense> } | { ok: false; status: number; error: string };

/**
 * Record money going out, and take it off the account it came from.
 *
 * One writer, because there are now two callers: adding an expense by hand and
 * settling a subscription. Two copies of a balance update is how an account quietly
 * ends up wrong, and the balance change has to be in the same transaction as the row
 * that explains it.
 *
 * An external source has no balance to move, so it only gets the record.
 */
export async function recordExpense(input: SpendInput): Promise<SpendResult> {
  const { name, amount, category, sourceType, sourceId, date } = input;

  if (sourceType === "external") {
    const ext = await ExternalSource.findById(sourceId);
    if (!ext || ext.archived) return { ok: false, status: 404, error: "external source not found" };
    const expense = await Expense.create({ name, amount, category, sourceType, sourceId: ext._id, sourceNameSnapshot: ext.name, date });
    return { ok: true, expense };
  }

  const account = sourceType === "wallet" ? await Wallet.findById(sourceId) : await Bank.findById(sourceId);
  if (!account || account.archived) return { ok: false, status: 404, error: `${sourceType} not found` };

  const session = await mongoose.startSession();
  try {
    let expense: InstanceType<typeof Expense> | undefined;
    await session.withTransaction(async () => {
      account.balance -= amount;
      await account.save({ session });
      const created = await Expense.create([{ name, amount, category, sourceType, sourceId: account._id, sourceNameSnapshot: account.name, date }], { session });
      expense = created[0];
    });
    if (!expense) return { ok: false, status: 500, error: "failed to create expense" };
    return { ok: true, expense };
  } catch {
    return { ok: false, status: 500, error: "failed to create expense" };
  } finally {
    await session.endSession();
  }
}
