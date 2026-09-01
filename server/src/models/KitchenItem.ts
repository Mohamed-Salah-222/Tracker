import { Schema, model } from "mongoose";

/** How an item is counted. Per-unit foods hold pieces; per-gram foods hold grams. */
export const KITCHEN_UNITS = ["unit", "g"] as const;
export type KitchenUnit = (typeof KITCHEN_UNITS)[number];

/**
 * A food you keep at home and want to be reminded to restock.
 *
 * Formerly "FridgeItem". The collection is renamed along with it; it held no
 * documents at the time of the rename, so nothing needed migrating.
 */
const kitchenItemSchema = new Schema(
  {
    foodId: {
      type: Schema.Types.ObjectId,
      ref: "Food",
      required: true,
      unique: true,
    },
    foodNameSnapshot: { type: String, required: true },

    /**
     * Pieces for a per-unit food, grams for a per-gram one. Tracking used to be
     * refused for per-gram foods, which shut out everything sold by weight: rice,
     * oats, chicken, oil. That was most of a kitchen.
     */
    count: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, enum: KITCHEN_UNITS, required: true, default: "unit" },
    /** "piece", "bar", "scoop". Blank for grams, which name themselves. */
    unitLabelSnapshot: { type: String, default: "" },

    /**
     * Restock line for this item. "Low" means count <= lowThreshold while still
     * above zero. A single global rule could not work: running out of eggs and
     * running out of olive oil happen at very different counts.
     */
    lowThreshold: { type: Number, required: true, min: 0, default: 1 },

    /**
     * What one shopping trip puts back. Marking an item bought sets the count to
     * this in a single tap, instead of pressing + twelve times for a dozen eggs.
     */
    restockTo: { type: Number, required: true, min: 0, default: 2 },

    /** How much one tap of +/- moves. A gram item stepping by 1 would be useless. */
    stepSize: { type: Number, required: true, min: 0.01, default: 1 },

    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export type KitchenStatus = "out" | "low" | "ok";

export function kitchenStatus(count: number, lowThreshold: number): KitchenStatus {
  if (count <= 0) return "out";
  if (count <= lowThreshold) return "low";
  return "ok";
}

/** Sensible starting values for a newly tracked food, by how it is measured. */
export function defaultsForUnit(unit: KitchenUnit): { lowThreshold: number; restockTo: number; stepSize: number } {
  return unit === "g" ? { lowThreshold: 200, restockTo: 1000, stepSize: 50 } : { lowThreshold: 1, restockTo: 2, stepSize: 1 };
}

/** Rounded the way the unit is actually spoken: 1.5 pieces is nonsense, 250g is not. */
export function formatAmount(count: number, unit: KitchenUnit, unitLabel = ""): string {
  if (unit === "g") return `${Math.round(count)}g`;
  const n = Number.isInteger(count) ? count : Math.round(count * 10) / 10;
  if (!unitLabel) return String(n);
  return `${n} ${unitLabel}${n === 1 ? "" : "s"}`;
}

export const KitchenItem = model("KitchenItem", kitchenItemSchema);
