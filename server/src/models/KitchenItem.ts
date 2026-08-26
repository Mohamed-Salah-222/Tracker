import { Schema, model } from "mongoose";

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
    count: { type: Number, required: true, min: 0, default: 0 },

    /**
     * Restock line for this item. "Low" means count <= lowThreshold while still
     * above zero. A single global rule could not work: running out of eggs and
     * running out of olive oil happen at very different counts.
     */
    lowThreshold: { type: Number, required: true, min: 0, default: 1 },

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

export const KitchenItem = model("KitchenItem", kitchenItemSchema);
