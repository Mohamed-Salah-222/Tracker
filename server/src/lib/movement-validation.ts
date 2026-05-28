import { MovementType } from "../models/MoneyMovement";

type ValidationResult = { ok: true } | { ok: false; error: string };

interface MovementBody {
  fromType?: string | null;
  fromId?: string | null;
  toType?: string | null;
  toId?: string | null;
  amountFrom: number;
  amountTo: number;
  conversionRate: number;
  fromCurrency?: string | null;
  toCurrency?: string | null;
}

const FLOAT_TOLERANCE = 0.01;

function checkAmountConsistency(body: MovementBody, fromCurrency: string | null, toCurrency: string | null): ValidationResult {
  if (fromCurrency && toCurrency && fromCurrency !== toCurrency) {
    if (!body.conversionRate || body.conversionRate <= 0) {
      return { ok: false, error: "conversionRate required when currencies differ" };
    }
    if (Math.abs(body.amountTo - body.amountFrom * body.conversionRate) >= FLOAT_TOLERANCE) {
      return { ok: false, error: "amountTo must equal amountFrom * conversionRate" };
    }
  } else {
    if (Math.abs(body.amountTo - body.amountFrom) >= FLOAT_TOLERANCE) {
      return { ok: false, error: "amountTo must equal amountFrom when currencies match" };
    }
    if (Math.abs(body.conversionRate - 1) >= FLOAT_TOLERANCE) {
      return { ok: false, error: "conversionRate must be 1 when currencies match" };
    }
  }
  return { ok: true };
}

export function validateMovementShape(type: MovementType, body: MovementBody): ValidationResult {
  switch (type) {
    case "withdraw": {
      if (body.fromType !== "bank") return { ok: false, error: "withdraw: fromType must be bank" };
      if (body.toType !== "wallet") return { ok: false, error: "withdraw: toType must be wallet" };
      if (!body.fromId) return { ok: false, error: "withdraw: fromId required" };
      if (!body.toId) return { ok: false, error: "withdraw: toId required" };
      if (body.amountFrom <= 0) return { ok: false, error: "withdraw: amountFrom must be > 0" };
      if (body.amountTo <= 0) return { ok: false, error: "withdraw: amountTo must be > 0" };
      return checkAmountConsistency(body, body.fromCurrency ?? null, body.toCurrency ?? null);
    }

    case "deposit": {
      if (body.fromType !== "wallet") return { ok: false, error: "deposit: fromType must be wallet" };
      if (body.toType !== "bank") return { ok: false, error: "deposit: toType must be bank" };
      if (!body.fromId) return { ok: false, error: "deposit: fromId required" };
      if (!body.toId) return { ok: false, error: "deposit: toId required" };
      if (body.amountFrom <= 0) return { ok: false, error: "deposit: amountFrom must be > 0" };
      if (body.amountTo <= 0) return { ok: false, error: "deposit: amountTo must be > 0" };
      return checkAmountConsistency(body, body.fromCurrency ?? null, body.toCurrency ?? null);
    }

    case "transfer_bank": {
      if (body.fromType !== "bank") return { ok: false, error: "transfer_bank: fromType must be bank" };
      if (body.toType !== "bank") return { ok: false, error: "transfer_bank: toType must be bank" };
      if (!body.fromId) return { ok: false, error: "transfer_bank: fromId required" };
      if (!body.toId) return { ok: false, error: "transfer_bank: toId required" };
      if (body.fromId === body.toId) return { ok: false, error: "transfer_bank: fromId and toId must differ" };
      if (body.amountFrom <= 0) return { ok: false, error: "transfer_bank: amountFrom must be > 0" };
      if (body.amountTo <= 0) return { ok: false, error: "transfer_bank: amountTo must be > 0" };
      return checkAmountConsistency(body, body.fromCurrency ?? null, body.toCurrency ?? null);
    }

    case "transfer_wallet": {
      if (body.fromType !== "wallet") return { ok: false, error: "transfer_wallet: fromType must be wallet" };
      if (body.toType !== "wallet") return { ok: false, error: "transfer_wallet: toType must be wallet" };
      if (!body.fromId) return { ok: false, error: "transfer_wallet: fromId required" };
      if (!body.toId) return { ok: false, error: "transfer_wallet: toId required" };
      if (body.fromId === body.toId) return { ok: false, error: "transfer_wallet: fromId and toId must differ" };
      if (body.amountFrom <= 0) return { ok: false, error: "transfer_wallet: amountFrom must be > 0" };
      if (body.amountTo <= 0) return { ok: false, error: "transfer_wallet: amountTo must be > 0" };
      if (Math.abs(body.conversionRate - 1) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "transfer_wallet: conversionRate must be 1 (both wallets are EGP)" };
      }
      if (Math.abs(body.amountTo - body.amountFrom) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "transfer_wallet: amountTo must equal amountFrom" };
      }
      return { ok: true };
    }

    case "adjustment": {
      const hasFrom = body.fromType && body.fromId;
      const hasTo = body.toType && body.toId;
      if (hasFrom && hasTo) return { ok: false, error: "adjustment: only one side may be filled" };
      if (!hasFrom && !hasTo) return { ok: false, error: "adjustment: exactly one side must be filled" };
      if (body.amountFrom === 0) return { ok: false, error: "adjustment: amountFrom must be non-zero" };
      if (Math.abs(body.amountTo - body.amountFrom) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "adjustment: amountTo must equal amountFrom" };
      }
      if (Math.abs(body.conversionRate - 1) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "adjustment: conversionRate must be 1" };
      }
      const accountType = body.fromType || body.toType;
      if (accountType !== "wallet" && accountType !== "bank") {
        return { ok: false, error: "adjustment: account must be wallet or bank" };
      }
      return { ok: true };
    }

    case "family_in": {
      if (body.fromType !== "external") return { ok: false, error: "family_in: fromType must be external" };
      if (body.toType !== "wallet" && body.toType !== "bank") {
        return { ok: false, error: "family_in: toType must be wallet or bank" };
      }
      if (!body.fromId) return { ok: false, error: "family_in: fromId required" };
      if (!body.toId) return { ok: false, error: "family_in: toId required" };
      if (body.amountFrom <= 0) return { ok: false, error: "family_in: amountFrom must be > 0" };
      if (body.amountTo <= 0) return { ok: false, error: "family_in: amountTo must be > 0" };
      if (Math.abs(body.amountTo - body.amountFrom) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "family_in: amountTo must equal amountFrom" };
      }
      if (Math.abs(body.conversionRate - 1) >= FLOAT_TOLERANCE) {
        return { ok: false, error: "family_in: conversionRate must be 1" };
      }
      return { ok: true };
    }
  }
}
