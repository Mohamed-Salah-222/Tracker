import { Schema, model } from "mongoose";
import { BANK_CURRENCIES } from "./Bank";

const walletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    balance: { type: Number, required: true, default: 0 },
    // Movement/transfer logic reads this instead of assuming EGP, so a
    // cross-currency transfer cannot silently skip conversion.
    currency: { type: String, enum: BANK_CURRENCIES, required: true, default: "EGP" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Wallet = model("Wallet", walletSchema);
