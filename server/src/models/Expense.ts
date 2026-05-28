import { Schema, model } from "mongoose";

export const EXPENSE_CATEGORIES = ["food", "transport", "bills", "shopping", "entertainment", "health", "education", "other"] as const;
export const EXPENSE_SOURCE_TYPES = ["wallet", "bank", "external"] as const;

const expenseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    sourceType: { type: String, enum: EXPENSE_SOURCE_TYPES, required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    sourceNameSnapshot: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Expense = model("Expense", expenseSchema);
