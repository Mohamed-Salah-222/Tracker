import { Schema, model } from "mongoose";

export const BANK_CURRENCIES = ["EGP", "USD"] as const;

const bankSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, enum: BANK_CURRENCIES, required: true, default: "EGP" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Bank = model("Bank", bankSchema);
