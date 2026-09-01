import { Schema, model } from "mongoose";

/**
 * A line on the to-buy list that is not a tracked food.
 *
 * Anything low in the kitchen is derived onto the list rather than copied into it,
 * so there is one source of truth for stock and nothing to go stale when a count
 * changes. This collection holds only the rest: dish soap, foil, coffee, a brand
 * you want to try once. Things with no macros, which is why they could never live
 * in the Foods library.
 */
const shoppingItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    /** Free text, deliberately not a number: "2 packs", "a big one", "500g". */
    qty: { type: String, default: "", trim: true, maxlength: 60 },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Unticking has to clear the timestamp too, or "bought today" stays true forever.
shoppingItemSchema.pre("save", function () {
  if (this.isModified("done")) this.doneAt = this.done ? new Date() : null;
});

shoppingItemSchema.index({ done: 1, createdAt: -1 });

export const ShoppingItem = model("ShoppingItem", shoppingItemSchema);
