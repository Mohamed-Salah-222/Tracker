import { Schema, model } from "mongoose";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export const ENTRY_MODES = ["perGram", "perUnit"] as const;

const calorieEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    foodId: { type: Schema.Types.ObjectId, ref: "Food", required: true },
    foodNameSnapshot: { type: String, required: true },
    meal: { type: String, enum: MEAL_SLOTS, required: true },
    entryMode: { type: String, enum: ENTRY_MODES, required: true },

    // perGram
    grams: { type: Number, default: null },
    caloriesPerGramSnapshot: { type: Number, default: 0 },
    proteinPerGramSnapshot: { type: Number, default: 0 },
    carbsPerGramSnapshot: { type: Number, default: 0 },
    fatPerGramSnapshot: { type: Number, default: 0 },

    // perUnit
    units: { type: Number, default: null },
    caloriesPerUnitSnapshot: { type: Number, default: 0 },
    proteinPerUnitSnapshot: { type: Number, default: 0 },
    carbsPerUnitSnapshot: { type: Number, default: 0 },
    fatPerUnitSnapshot: { type: Number, default: 0 },
    unitLabelSnapshot: { type: String, default: "" },

    // Track whether this entry caused a fridge deduction at log time
    fridgeDeductedAtLog: { type: Number, default: 0 },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CalorieEntry = model("CalorieEntry", calorieEntrySchema);
