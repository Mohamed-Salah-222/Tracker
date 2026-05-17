import { Router } from "express";
import { WorkoutSession, WORKOUT_TYPES } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { toDayUTC } from "../lib/dates";

const router = Router();

type WorkoutType = (typeof WORKOUT_TYPES)[number];
function isValidType(t: string): t is WorkoutType {
  return (WORKOUT_TYPES as readonly string[]).includes(t);
}

// =====================================================================
// GET /workouts/today
// Returns today's session if it exists, else suggests the next type (A/B/rest)
// based on the most recent A or B session.
// =====================================================================
router.get("/today", async (_req, res) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const existing = await WorkoutSession.findOne({ date: today });
  if (existing) {
    return res.json({ session: existing, suggested: null });
  }

  // Find most recent A or B session
  const lastAB = await WorkoutSession.findOne({ type: { $in: ["A", "B"] } }).sort({ date: -1 });
  // Suggested: opposite of last AB; if no history, default to A
  let suggested: WorkoutType = "A";
  if (lastAB) {
    suggested = lastAB.type === "A" ? "B" : "A";
  }

  res.json({ session: null, suggested });
});

// =====================================================================
// GET /workouts/session?date=YYYY-MM-DD
// =====================================================================
router.get("/session", async (req, res) => {
  const dateStr = req.query.date as string;
  if (!dateStr) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(dateStr);
  const session = await WorkoutSession.findOne({ date: day });
  res.json(session);
});

// =====================================================================
// GET /workouts/session/:id/sets
// =====================================================================
router.get("/session/:id/sets", async (req, res) => {
  const sets = await SetLog.find({ sessionId: req.params.id }).sort({ exerciseId: 1, setNumber: 1 });
  res.json(sets);
});

// =====================================================================
// POST /workouts/session
// Create a session for a date with a type
// =====================================================================
router.post("/session", async (req, res) => {
  const { date, type, warmupMinutes, finisherMinutes } = req.body;
  if (!date || !type) return res.status(400).json({ error: "date and type required" });
  if (!isValidType(type)) return res.status(400).json({ error: "invalid type" });

  const day = toDayUTC(date);
  const existing = await WorkoutSession.findOne({ date: day });
  if (existing) return res.status(409).json({ error: "session already exists for this date", session: existing });

  const session = await WorkoutSession.create({
    date: day,
    type,
    warmupMinutes: type === "rest" ? 0 : (warmupMinutes ?? 10),
    finisherMinutes: type === "rest" ? 0 : (finisherMinutes ?? 20),
  });
  res.json(session);
});

// =====================================================================
// PATCH /workouts/session/:id
// Update warmup/finisher/walk/completedAt/note/type
// =====================================================================
router.patch("/session/:id", async (req, res) => {
  const session = await WorkoutSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  const { type, warmupMinutes, warmupDone, finisherMinutes, finisherDone, walkMinutes, walkDistanceKm, completedAt, note } = req.body;

  if (type) {
    if (!isValidType(type)) return res.status(400).json({ error: "invalid type" });
    session.set("type", type);
    // Clear sets if changing away from a workout type
    if (type === "rest") {
      await SetLog.deleteMany({ sessionId: session._id });
    }
  }

  if (typeof warmupMinutes === "number") session.warmupMinutes = warmupMinutes;
  if (typeof warmupDone === "boolean") session.warmupDone = warmupDone;
  if (typeof finisherMinutes === "number") session.finisherMinutes = finisherMinutes;
  if (typeof finisherDone === "boolean") session.finisherDone = finisherDone;
  if (typeof walkMinutes === "number") session.walkMinutes = walkMinutes;
  if (typeof walkDistanceKm === "number") session.walkDistanceKm = walkDistanceKm;
  if (typeof note === "string") session.note = note;

  if (completedAt === null) session.completedAt = null;
  else if (completedAt) session.completedAt = new Date(completedAt);

  await session.save();
  res.json(session);
});

// =====================================================================
// DELETE /workouts/session/:id
// =====================================================================
router.delete("/session/:id", async (req, res) => {
  const session = await WorkoutSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  await SetLog.deleteMany({ sessionId: session._id });
  await session.deleteOne();
  res.json({ ok: true });
});

// =====================================================================
// PUT /workouts/sets
// Upsert a set log (sessionId + exerciseId + setNumber is the key)
// Body: { sessionId, exerciseId, setNumber, weight?, reps?, done? }
// =====================================================================
router.put("/sets", async (req, res) => {
  const { sessionId, exerciseId, setNumber, weight, reps, done } = req.body;
  if (!sessionId || !exerciseId || typeof setNumber !== "number") {
    return res.status(400).json({ error: "sessionId, exerciseId, setNumber required" });
  }

  const update: Record<string, unknown> = {};
  if (weight !== undefined) update.weight = weight;
  if (reps !== undefined) update.reps = reps;
  if (typeof done === "boolean") update.done = done;

  const set = await SetLog.findOneAndUpdate({ sessionId, exerciseId, setNumber }, { $set: update, $setOnInsert: { sessionId, exerciseId, setNumber } }, { upsert: true, new: true });
  res.json(set);
});

// =====================================================================
// DELETE /workouts/sets/:id
// =====================================================================
router.delete("/sets/:id", async (req, res) => {
  await SetLog.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// =====================================================================
// GET /workouts/exercise-history?exerciseId=X
// Returns the LAST completed set for this exercise (used for "last session" hint)
// =====================================================================
router.get("/exercise-history", async (req, res) => {
  const exerciseId = req.query.exerciseId as string;
  if (!exerciseId) return res.status(400).json({ error: "exerciseId required" });

  // Find the most recent SetLog with weight or reps logged
  const recent = await SetLog.find({
    exerciseId,
    $or: [{ weight: { $ne: null, $gt: 0 } }, { reps: { $ne: null, $gt: 0 } }],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("sessionId");

  // Find the heaviest set (best PR style)
  const heaviest = await SetLog.findOne({ exerciseId, weight: { $ne: null, $gt: 0 } }).sort({ weight: -1 });

  res.json({
    lastSet: recent[0] ?? null,
    heaviest: heaviest ?? null,
    recentSets: recent,
  });
});

// =====================================================================
// GET /workouts/recent?limit=N
// Returns last N sessions
// =====================================================================
router.get("/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 7, 30);
  const sessions = await WorkoutSession.find().sort({ date: -1 }).limit(limit);
  res.json(sessions);
});

// =====================================================================
// GET /workouts/last-weights
// Returns a map of { exerciseId: { weight, reps } } for fast prefill
// Used by frontend to show "last session" hints inline.
// =====================================================================
router.get("/last-weights", async (_req, res) => {
  // Aggregate: for each exerciseId, find the most recent set with weight
  const rows = await SetLog.aggregate([
    { $match: { weight: { $ne: null, $gt: 0 } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$exerciseId",
        weight: { $first: "$weight" },
        reps: { $first: "$reps" },
        when: { $first: "$createdAt" },
      },
    },
  ]);

  const map: Record<string, { weight: number; reps: number | null; when: Date }> = {};
  for (const r of rows) {
    map[r._id] = { weight: r.weight, reps: r.reps, when: r.when };
  }
  res.json(map);
});

export default router;
