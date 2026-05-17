import { Schema, model } from "mongoose";

const walletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    balance: { type: Number, required: true, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Wallet = model("Wallet", walletSchema);
