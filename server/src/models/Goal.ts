import { Schema, model } from "mongoose";

// Singleton-style: only one document expected, but flexible to extend later
const goalSchema = new Schema(
  {
    // Calorie limits
    caloriesTarget: { type: Number, required: true, default: 2000 },
    caloriesBuffer: { type: Number, required: true, default: 100 }, // 2000-2100 is "warning", 2100+ is "over"

    // Protein range (inclusive)
    proteinMin: { type: Number, required: true, default: 160 },
    proteinMax: { type: Number, required: true, default: 180 },

    // Water in ml
    waterMin: { type: Number, required: true, default: 2500 },
    waterTarget: { type: Number, required: true, default: 3000 },
    waterMax: { type: Number, required: true, default: 3500 },
  },
  { timestamps: true },
);

export const Goal = model("Goal", goalSchema);
