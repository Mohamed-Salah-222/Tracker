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
    unitLabel: { type: String, default: "" }, // e.g. "piece", "bar", "scoop". Display only

    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// entryMode decides which half of this document is real; the other half is dead
// weight that every consumer ignores. Letting both halves carry values means a
// food whose mode is later flipped would silently start reporting stale macros
// from its old mode, so the inactive half must stay blank.
foodSchema.pre("validate", function () {
  if (this.entryMode === "perGram") {
    for (const path of ["caloriesPerUnit", "proteinPerUnit", "carbsPerUnit", "fatPerUnit"] as const) {
      if (this.get(path)) {
        this.invalidate(path, `${path} must be 0 when entryMode is perGram`, this.get(path));
      }
    }
    if (this.unitLabel) {
      this.invalidate("unitLabel", "unitLabel must be empty when entryMode is perGram", this.unitLabel);
    }
  } else if (this.entryMode === "perUnit") {
    for (const path of ["caloriesPerGram", "proteinPerGram", "carbsPerGram", "fatPerGram"] as const) {
      if (this.get(path)) {
        this.invalidate(path, `${path} must be 0 when entryMode is perUnit`, this.get(path));
      }
    }
    if (this.defaultServingGrams !== null && this.defaultServingGrams !== undefined) {
      this.invalidate("defaultServingGrams", "defaultServingGrams must be null when entryMode is perUnit", this.defaultServingGrams);
    }
  }
});

export const Food = model("Food", foodSchema);
