import { Schema, model } from "mongoose";

const medicalEnglishEntrySchema = new Schema(
  {
    phrase: { type: String, required: true, trim: true },
    speaker: { type: String, enum: ["patient", "doctor", "interpreter", "course"], default: "patient", index: true },
    category: { type: String, default: "General", trim: true, index: true },
    plainMeaning: { type: String, default: "", trim: true },
    useWhen: { type: String, default: "", trim: true },
    difference: { type: String, default: "", trim: true },
    example: { type: String, default: "", trim: true },
    courseNote: { type: String, default: "", trim: true },
    tags: { type: [String], default: [], index: true },
    status: { type: String, enum: ["learning", "polished", "course-ready"], default: "learning", index: true },
    reviewCount: { type: Number, default: 0, min: 0 },
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

medicalEnglishEntrySchema.index({
  phrase: "text",
  plainMeaning: "text",
  useWhen: "text",
  difference: "text",
  example: "text",
  courseNote: "text",
  tags: "text",
});

export const MedicalEnglishEntry = model("MedicalEnglishEntry", medicalEnglishEntrySchema);
