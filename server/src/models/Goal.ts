import { Schema, model } from "mongoose";

// Singleton-style: only one document expected, but flexible to extend later
const goalSchema = new Schema(
  {
    // Macro daily ceilings
    caloriesTarget: { type: Number, required: true, default: 2000 },
    proteinTarget: { type: Number, required: true, default: 160 },
    carbsTarget: { type: Number, required: true, default: 200 },
    fatTarget: { type: Number, required: true, default: 70 },

    // Water in ml
    waterMin: { type: Number, required: true, default: 2500 },
    waterTarget: { type: Number, required: true, default: 3000 },
    waterMax: { type: Number, required: true, default: 3500 },
  },
  { timestamps: true },
);

export const Goal = model("Goal", goalSchema);
