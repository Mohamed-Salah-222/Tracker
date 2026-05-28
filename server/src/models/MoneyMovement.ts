import { Schema, model } from "mongoose";

export const MOVEMENT_TYPES = [
  "withdraw",
  "deposit",
  "transfer_bank",
  "transfer_wallet",
  "adjustment",
  "family_in",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_ACCOUNT_TYPES = ["wallet", "bank", "external"] as const;

const moneyMovementSchema = new Schema(
  {
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },

    fromType: { type: String, enum: MOVEMENT_ACCOUNT_TYPES, default: null },
    fromId: { type: Schema.Types.ObjectId, default: null },
    fromNameSnapshot: { type: String, default: null },
    fromCurrencySnapshot: { type: String, default: null },

    toType: { type: String, enum: MOVEMENT_ACCOUNT_TYPES, default: null },
    toId: { type: Schema.Types.ObjectId, default: null },
    toNameSnapshot: { type: String, default: null },
    toCurrencySnapshot: { type: String, default: null },

    amountFrom: { type: Number, required: true },
    amountTo: { type: Number, required: true },
    conversionRate: { type: Number, required: true, default: 1 },

    date: { type: Date, required: true, index: true },
    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const MoneyMovement = model("MoneyMovement", moneyMovementSchema);
