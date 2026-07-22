import { Router } from "express";
import { MedicalEnglishEntry } from "../models/MedicalEnglishEntry";
import { MedicalEnglishLesson } from "../models/MedicalEnglishLesson";

const router = Router();

const statuses = ["learning", "polished", "course-ready"] as const;
const speakers = ["patient", "doctor", "interpreter", "course"] as const;
const lessonStatuses = ["draft", "polished", "course-ready"] as const;

function cleanTags(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function cleanPayload(body: Record<string, unknown>) {
  const speaker = speakers.includes(body.speaker as (typeof speakers)[number]) ? (body.speaker as (typeof speakers)[number]) : "patient";
  const status = statuses.includes(body.status as (typeof statuses)[number]) ? (body.status as (typeof statuses)[number]) : "learning";
  return {
    phrase: String(body.phrase ?? "").trim(),
    speaker,
    category: String(body.category ?? "General").trim() || "General",
    plainMeaning: String(body.plainMeaning ?? "").trim(),
    useWhen: String(body.useWhen ?? "").trim(),
    difference: String(body.difference ?? "").trim(),
    example: String(body.example ?? "").trim(),
    courseNote: String(body.courseNote ?? "").trim(),
    tags: cleanTags(body.tags),
    status,
  };
}

function cleanTerm(input: unknown) {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    word: String(source.word ?? "").trim(),
    arabicMeaning: String(source.arabicMeaning ?? "").trim(),
    explanation: String(source.explanation ?? "").trim(),
    patientPhrases: String(source.patientPhrases ?? "").trim(),
  };
}

function cleanPairs(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((pair) => {
      const source = typeof pair === "object" && pair !== null ? (pair as Record<string, unknown>) : {};
      return {
        first: cleanTerm(source.first),
        second: cleanTerm(source.second),
        difference: String(source.difference ?? "").trim(),
        clarify: String(source.clarify ?? "").trim(),
        warning: String(source.warning ?? "").trim(),
      };
    })
    .filter((pair) => pair.first.word || pair.second.word)
    .slice(0, 30);
}

function cleanLessonPayload(body: Record<string, unknown>) {
  const status = lessonStatuses.includes(body.status as (typeof lessonStatuses)[number]) ? (body.status as (typeof lessonStatuses)[number]) : "draft";
  return {
    title: String(body.title ?? "").trim(),
    category: String(body.category ?? "General").trim() || "General",
    description: String(body.description ?? "").trim(),
    status,
    pairs: cleanPairs(body.pairs),
  };
}

router.get("/lessons", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const query: Record<string, unknown> = {};
  if (search) query.$text = { $search: search };
  if (category && category !== "all") query.category = category;
  const lessons = await MedicalEnglishLesson.find(query).sort(search ? { score: { $meta: "textScore" }, updatedAt: -1 } : { updatedAt: -1 }).limit(100);
  res.json(lessons);
});

router.get("/lessons/stats", async (_req, res) => {
  const lessons = await MedicalEnglishLesson.find().select("category status reviewCount pairs");
  const totalLessons = lessons.length;
  const totalPairs = lessons.reduce((sum, lesson) => sum + lesson.pairs.length, 0);
  const courseReady = lessons.filter((lesson) => lesson.status === "course-ready").length;
  const reviewed = lessons.filter((lesson) => lesson.reviewCount > 0).length;
  const categories = [...new Set(lessons.map((lesson) => lesson.category).filter(Boolean))].sort();
  res.json({ totalLessons, totalPairs, courseReady, reviewed, categories });
});

router.post("/lessons", async (req, res) => {
  const payload = cleanLessonPayload(req.body);
  if (!payload.title) return res.status(400).json({ error: "Lesson title is required" });
  if (!payload.pairs.length) return res.status(400).json({ error: "Add at least one word pair" });
  const lesson = await MedicalEnglishLesson.create(payload);
  res.status(201).json(lesson);
});

router.put("/lessons/:id", async (req, res) => {
  const payload = cleanLessonPayload(req.body);
  if (!payload.title) return res.status(400).json({ error: "Lesson title is required" });
  if (!payload.pairs.length) return res.status(400).json({ error: "Add at least one word pair" });
  const lesson = await MedicalEnglishLesson.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  res.json(lesson);
});

router.post("/lessons/:id/review", async (req, res) => {
  const lesson = await MedicalEnglishLesson.findByIdAndUpdate(req.params.id, { $inc: { reviewCount: 1 }, $set: { lastReviewedAt: new Date() } }, { new: true });
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  res.json(lesson);
});

router.delete("/lessons/:id", async (req, res) => {
  await MedicalEnglishLesson.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const query: Record<string, unknown> = {};
  if (search) query.$text = { $search: search };
  if (category && category !== "all") query.category = category;
  if (status && status !== "all") query.status = status;

  const entries = await MedicalEnglishEntry.find(query).sort(search ? { score: { $meta: "textScore" }, updatedAt: -1 } : { updatedAt: -1 }).limit(300);
  res.json(entries);
});

router.get("/stats", async (_req, res) => {
  const entries = await MedicalEnglishEntry.find().select("status reviewCount lastReviewedAt category");
  const total = entries.length;
  const courseReady = entries.filter((entry) => entry.status === "course-ready").length;
  const polished = entries.filter((entry) => entry.status === "polished").length;
  const reviewed = entries.filter((entry) => entry.reviewCount > 0).length;
  const categories = [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort();
  res.json({ total, courseReady, polished, reviewed, categories });
});

router.post("/", async (req, res) => {
  const payload = cleanPayload(req.body);
  if (!payload.phrase) return res.status(400).json({ error: "Phrase is required" });
  const entry = await MedicalEnglishEntry.create(payload);
  res.status(201).json(entry);
});

router.put("/:id", async (req, res) => {
  const payload = cleanPayload(req.body);
  if (!payload.phrase) return res.status(400).json({ error: "Phrase is required" });
  const entry = await MedicalEnglishEntry.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
  if (!entry) return res.status(404).json({ error: "Entry not found" });
  res.json(entry);
});

router.post("/:id/review", async (req, res) => {
  const entry = await MedicalEnglishEntry.findByIdAndUpdate(req.params.id, { $inc: { reviewCount: 1 }, $set: { lastReviewedAt: new Date() } }, { new: true });
  if (!entry) return res.status(404).json({ error: "Entry not found" });
  res.json(entry);
});

router.delete("/:id", async (req, res) => {
  await MedicalEnglishEntry.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
