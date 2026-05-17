import { Schema, model } from "mongoose";

export const EXPENSE_CATEGORIES = ["food", "transport", "bills", "shopping", "entertainment", "health", "education", "other"] as const;

const expenseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    walletNameSnapshot: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Expense = model("Expense", expenseSchema);
