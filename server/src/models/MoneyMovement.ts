import { Schema, model, type ClientSession } from "mongoose";
import { validateMovementShape } from "../lib/movement-validation";
import { Wallet } from "./Wallet";
import { Bank } from "./Bank";
import { ExternalSource } from "./ExternalSource";

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

const finiteNumber = {
  validator: (v: number) => Number.isFinite(v),
  message: "{PATH} must be a finite number",
};

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

    amountFrom: { type: Number, required: true, validate: finiteNumber },
    amountTo: { type: Number, required: true, validate: finiteNumber },
    conversionRate: {
      type: Number,
      required: true,
      default: 1,
      validate: {
        validator: (v: number) => Number.isFinite(v) && v > 0,
        message: "conversionRate must be a finite number greater than 0",
      },
    },

    date: { type: Date, required: true, index: true },
    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Look up a referenced account, honouring an in-progress transaction so an
// account created in the same transaction as its opening adjustment is visible.
async function resolveAccount(
  accountType: string | null | undefined,
  accountId: unknown,
  session: ClientSession | null,
): Promise<{ exists: boolean; currency: string | null }> {
  if (!accountType || !accountId) return { exists: false, currency: null };

  if (accountType === "wallet") {
    const doc = await Wallet.findById(accountId).select("currency").session(session).lean();
    return { exists: !!doc, currency: doc?.currency ?? null };
  }
  if (accountType === "bank") {
    const doc = await Bank.findById(accountId).select("currency").session(session).lean();
    return { exists: !!doc, currency: doc?.currency ?? null };
  }
  if (accountType === "external") {
    const doc = await ExternalSource.findById(accountId).select("_id").session(session).lean();
    return { exists: !!doc, currency: null };
  }
  return { exists: false, currency: null };
}

// Schema-level enforcement so no future route, script, or migration can write a
// movement that breaks the ledger. Duplicates the route's checks on purpose:
// the route exists for good HTTP errors, this exists as the backstop.
moneyMovementSchema.pre("validate", async function () {
  const session = this.$session() ?? null;

  const fromType = this.fromType ?? null;
  const toType = this.toType ?? null;

  const [from, to] = await Promise.all([
    resolveAccount(fromType, this.fromId, session),
    resolveAccount(toType, this.toId, session),
  ]);

  // Referenced accounts must actually exist.
  if (this.fromId && !from.exists) {
    this.invalidate("fromId", `fromId does not reference an existing ${fromType ?? "account"}`, this.fromId);
  }
  if (this.toId && !to.exists) {
    this.invalidate("toId", `toId does not reference an existing ${toType ?? "account"}`, this.toId);
  }
  // An account id without its type (or vice versa) leaves a dangling reference.
  if (this.fromId && !fromType) this.invalidate("fromType", "fromType is required when fromId is set", fromType);
  if (this.toId && !toType) this.invalidate("toType", "toType is required when toId is set", toType);

  if (!Number.isFinite(this.amountFrom) || !Number.isFinite(this.amountTo) || !Number.isFinite(this.conversionRate)) {
    return; // field validators already reported this; shape checks would be meaningless
  }

  // Positive amounts, matching conversions, and per-type from/to shape.
  const shape = validateMovementShape(this.type as MovementType, {
    fromType,
    fromId: this.fromId ? String(this.fromId) : null,
    toType,
    toId: this.toId ? String(this.toId) : null,
    amountFrom: this.amountFrom,
    amountTo: this.amountTo,
    conversionRate: this.conversionRate,
    fromCurrency: from.currency,
    toCurrency: to.currency,
  });
  if (!shape.ok) {
    this.invalidate("type", shape.error, this.type);
  }
});

export const MoneyMovement = model("MoneyMovement", moneyMovementSchema);
