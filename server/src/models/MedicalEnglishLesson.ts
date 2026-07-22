import { Schema, model } from "mongoose";

const termCardSchema = new Schema(
  {
    word: { type: String, default: "", trim: true },
    arabicMeaning: { type: String, default: "", trim: true },
    explanation: { type: String, default: "", trim: true },
    patientPhrases: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const comparisonPairSchema = new Schema(
  {
    first: { type: termCardSchema, default: () => ({}) },
    second: { type: termCardSchema, default: () => ({}) },
    difference: { type: String, default: "", trim: true },
    clarify: { type: String, default: "", trim: true },
    warning: { type: String, default: "", trim: true },
  },
  { _id: true },
);

const medicalEnglishLessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, default: "General", trim: true, index: true },
    description: { type: String, default: "", trim: true },
    pairs: { type: [comparisonPairSchema], default: [] },
    status: { type: String, enum: ["draft", "polished", "course-ready"], default: "draft", index: true },
    reviewCount: { type: Number, default: 0, min: 0 },
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

medicalEnglishLessonSchema.index({
  title: "text",
  category: "text",
  description: "text",
  "pairs.first.word": "text",
  "pairs.first.arabicMeaning": "text",
  "pairs.first.explanation": "text",
  "pairs.first.patientPhrases": "text",
  "pairs.second.word": "text",
  "pairs.second.arabicMeaning": "text",
  "pairs.second.explanation": "text",
  "pairs.second.patientPhrases": "text",
  "pairs.difference": "text",
  "pairs.clarify": "text",
  "pairs.warning": "text",
});

export const MedicalEnglishLesson = model("MedicalEnglishLesson", medicalEnglishLessonSchema);
