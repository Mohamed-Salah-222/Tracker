import { Schema, model } from "mongoose";

export const FOOD_CATEGORIES = ["protein", "carbs", "fats", "vegetables", "snacks", "drinks", "prepared", "other"] as const;
export const ENTRY_MODES = ["perGram", "perUnit"] as const;

const foodSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: FOOD_CATEGORIES, required: true },
    entryMode: { type: String, enum: ENTRY_MODES, required: true },
    trackInFridge: { type: Boolean, required: true, default: false },

    // perGram fields
    caloriesPerGram: { type: Number, required: true, min: 0, default: 0 },
    proteinPerGram: { type: Number, required: true, min: 0, default: 0 },
    carbsPerGram: { type: Number, required: true, min: 0, default: 0 },
    fatPerGram: { type: Number, required: true, min: 0, default: 0 },
    defaultServingGrams: { type: Number, default: null, min: 0 },

    // perUnit fields
    caloriesPerUnit: { type: Number, required: true, min: 0, default: 0 },
    proteinPerUnit: { type: Number, required: true, min: 0, default: 0 },
    carbsPerUnit: { type: Number, required: true, min: 0, default: 0 },
    fatPerUnit: { type: Number, required: true, min: 0, default: 0 },
    unitLabel: { type: String, default: "" }, // e.g. "piece", "bar", "scoop" — display only

    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Food = model("Food", foodSchema);
