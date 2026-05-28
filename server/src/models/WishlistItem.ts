import { Schema, model } from "mongoose";

export const WISHLIST_PRIORITIES = ["high", "medium", "low"] as const;

const wishlistItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    bought: { type: Boolean, default: false },
    dateBought: { type: Date, default: null },
    link: { type: String, default: "" },
    priority: { type: String, enum: WISHLIST_PRIORITIES, default: "medium" },
    notes: { type: String, default: "" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const WishlistItem = model("WishlistItem", wishlistItemSchema);
