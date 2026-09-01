import { Schema, model } from "mongoose";

/**
 * A named set of foods logged in one go: "my usual breakfast" as 2 eggs, a slice of
 * toast and 10g of oil.
 *
 * Called a recipe rather than a meal because "meal" already means the slot an entry
 * lands in (breakfast, lunch, dinner, snack), and the two would read as the same
 * word for different things all over the calorie code.
 *
 * Ingredients hold a reference and an amount, not a copy of the macros. Editing a
 * food should change what its recipes are worth, since the recipe is a plan for
 * what to eat rather than a record of what was eaten. The entries it creates take
 * their own snapshots at that point, which is where history belongs.
 */
const recipeItemSchema = new Schema(
  {
    foodId: { type: Schema.Types.ObjectId, ref: "Food", required: true },
    /** Pieces for a per-unit food, grams for a per-gram one. */
    amount: { type: Number, required: true, min: 0.0001 },
  },
  { _id: false },
);

const recipeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    items: {
      type: [recipeItemSchema],
      required: true,
      validate: [(v: unknown[]) => v.length > 0, "a recipe needs at least one food"],
    },
    /** Which slot it usually goes in, so logging it is one tap rather than two. */
    defaultMeal: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], default: "breakfast" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// The same food twice in one recipe is always a mistake; the amounts should be added
// together instead, and two rows would log two separate entries for it.
recipeSchema.pre("validate", function () {
  const seen = new Set<string>();
  for (const item of this.items ?? []) {
    const key = String(item.foodId);
    if (seen.has(key)) {
      this.invalidate("items", "the same food is listed twice; combine the amounts instead");
      return;
    }
    seen.add(key);
  }
});

export const Recipe = model("Recipe", recipeSchema);
