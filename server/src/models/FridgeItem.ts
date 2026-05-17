import { Schema, model } from "mongoose";

const fridgeItemSchema = new Schema(
  {
    foodId: {
      type: Schema.Types.ObjectId,
      ref: "Food",
      required: true,
      unique: true,
    },
    foodNameSnapshot: { type: String, required: true },
    count: { type: Number, required: true, min: 0, default: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const FridgeItem = model("FridgeItem", fridgeItemSchema);
