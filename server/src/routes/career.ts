import { Router } from "express";
import { CareerTopic } from "../models/CareerTopic";

const router = Router();

// =====================================================================
// GET /career/progress
// Returns ALL career topic records (sparse — only ones that have been touched)
// Frontend joins this with the hardcoded curriculum.
// =====================================================================
router.get("/progress", async (_req, res) => {
  const topics = await CareerTopic.find().sort({ updatedAt: -1 });
  res.json(topics);
});

// =====================================================================
// GET /career/topic/:topicId
// =====================================================================
router.get("/topic/:topicId", async (req, res) => {
  const t = await CareerTopic.findOne({ topicId: req.params.topicId });
  res.json(t);
});

// =====================================================================
// PUT /career/topic/:topicId
// Upsert. Sets startedAt on first creation. Sets completedAt when done flips true.
// =====================================================================
router.put("/topic/:topicId", async (req, res) => {
  const { topicId } = req.params;
  const { done, notes } = req.body as { done?: boolean; notes?: string };

  let existing = await CareerTopic.findOne({ topicId });
  const now = new Date();

  if (!existing) {
    existing = await CareerTopic.create({
      topicId,
      done: done ?? false,
      notes: notes ?? "",
      startedAt: now,
      completedAt: done ? now : null,
    });
    return res.json(existing);
  }

  if (typeof notes === "string") {
    existing.notes = notes;
    if (!existing.startedAt) existing.startedAt = now;
  }

  if (typeof done === "boolean" && done !== existing.done) {
    existing.done = done;
    if (done && !existing.completedAt) existing.completedAt = now;
    if (!done) existing.completedAt = null;
  }

  await existing.save();
  res.json(existing);
});

// =====================================================================
// DELETE /career/topic/:topicId
// Resets a topic (deletes the record entirely, so it appears untouched)
// =====================================================================
router.delete("/topic/:topicId", async (req, res) => {
  await CareerTopic.deleteOne({ topicId: req.params.topicId });
  res.json({ ok: true });
});

// =====================================================================
// GET /career/stats
// Aggregated stats for dashboard and overview page.
// =====================================================================
router.get("/stats", async (_req, res) => {
  const topics = await CareerTopic.find();

  const doneCount = topics.filter((t) => t.done).length;
  const startedCount = topics.length;
  const completedDates = topics.filter((t) => t.completedAt).map((t) => t.completedAt!.toISOString().slice(0, 10));

  // Streak: consecutive days back from today where at least one topic was completed
  const completedSet = new Set(completedDates);
  let streak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (completedSet.has(iso)) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else if (i === 0) {
      // Allow no completion today — check from yesterday
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  // Last 30 days activity (for chart)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const activity: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const count = completedDates.filter((dt) => dt === iso).length;
    activity.push({ date: iso, count });
  }

  // Per-topic map for fast frontend lookup
  const byTopicId: Record<string, { done: boolean; startedAt: Date | null; completedAt: Date | null }> = {};
  for (const t of topics) {
    byTopicId[t.topicId] = {
      done: t.done,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    };
  }

  res.json({
    doneCount,
    startedCount,
    streak,
    activity,
    byTopicId,
  });
});

export default router;
