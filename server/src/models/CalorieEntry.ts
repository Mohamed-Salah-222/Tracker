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

// Same rule as Food: entryMode picks which half of the snapshot is authoritative,
// and the other half stays blank. An entry carrying both grams and units would
// have two different valid-looking calorie totals depending on which branch of
// entryTotals() read it, so the amount for the inactive mode must be null.
calorieEntrySchema.pre("validate", function () {
  if (this.entryMode === "perGram") {
    if (!(typeof this.grams === "number" && Number.isFinite(this.grams) && this.grams > 0)) {
      this.invalidate("grams", "grams > 0 is required when entryMode is perGram", this.grams);
    }
    if (this.units !== null && this.units !== undefined) {
      this.invalidate("units", "units must be null when entryMode is perGram", this.units);
    }
    for (const path of ["caloriesPerUnitSnapshot", "proteinPerUnitSnapshot", "carbsPerUnitSnapshot", "fatPerUnitSnapshot"] as const) {
      if (this.get(path)) {
        this.invalidate(path, `${path} must be 0 when entryMode is perGram`, this.get(path));
      }
    }
    if (this.unitLabelSnapshot) {
      this.invalidate("unitLabelSnapshot", "unitLabelSnapshot must be empty when entryMode is perGram", this.unitLabelSnapshot);
    }
  } else if (this.entryMode === "perUnit") {
    if (!(typeof this.units === "number" && Number.isFinite(this.units) && this.units > 0)) {
      this.invalidate("units", "units > 0 is required when entryMode is perUnit", this.units);
    }
    if (this.grams !== null && this.grams !== undefined) {
      this.invalidate("grams", "grams must be null when entryMode is perUnit", this.grams);
    }
    for (const path of ["caloriesPerGramSnapshot", "proteinPerGramSnapshot", "carbsPerGramSnapshot", "fatPerGramSnapshot"] as const) {
      if (this.get(path)) {
        this.invalidate(path, `${path} must be 0 when entryMode is perUnit`, this.get(path));
      }
    }
  }
});

export const CalorieEntry = model("CalorieEntry", calorieEntrySchema);
