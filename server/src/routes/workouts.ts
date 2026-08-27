import { Router } from "express";
import { WorkoutSession, REST_DAY, isRestType, isValidDayKey, normalizeWorkoutType } from "../models/WorkoutSession";
import { loadWorkoutSettings } from "../models/WorkoutSettings";
import { WorkoutDayPlan } from "../models/WorkoutDayPlan";
import { ExerciseNote } from "../models/ExerciseNote";
import { SetLog } from "../models/SetLog";
import { toDayUTC } from "../lib/dates";
import { isNonNegativeNumber, isObjectId, isPositiveInteger, objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);

const isValidType = isValidDayKey;

/**
 * Sessions created before the split was simplified still hold "upperA"/"lowerB"/etc.
 * Every response folds them into the current upper/lower/rest vocabulary so the
 * client only ever sees three types.
 */
function serializeSession(session: { toObject: () => Record<string, unknown>; type: string }) {
  return { ...session.toObject(), type: normalizeWorkoutType(session.type) };
}

// =====================================================================
// Day plans: a user's edited exercise list for one day template.
// GET    /workouts/day-plans            every customised day
// PUT    /workouts/day-plans/:dayKey    replace that day's exercises
// DELETE /workouts/day-plans/:dayKey    reset it to the catalogue default
// =====================================================================
router.get("/day-plans", async (_req, res) => {
  const plans = await WorkoutDayPlan.find();
  const out: Record<string, { id: string; sets: number; reps: number }[]> = {};
  for (const p of plans) out[p.dayKey] = p.slots.map((sl) => ({ id: sl.id, sets: sl.sets, reps: sl.reps }));
  res.json(out);
});

router.put("/day-plans/:dayKey", async (req, res) => {
  const dayKey = trimmedString(req.params.dayKey);
  if (!dayKey || !isValidDayKey(dayKey)) return res.status(400).json({ error: "invalid dayKey" });

  const slots = req.body?.slots;
  if (!Array.isArray(slots) || slots.length === 0) return res.status(400).json({ error: "slots required" });
  if (slots.length > 20) return res.status(400).json({ error: "too many exercises for one day" });

  const clean: { id: string; sets: number; reps: number }[] = [];
  const seen = new Set<string>();
  for (const raw of slots) {
    const id = trimmedString(raw?.id);
    if (!id) return res.status(400).json({ error: "each exercise needs an id" });
    // The same movement twice in one day would collide: SetLog is keyed by
    // (session, exercise, set number), so the two entries would overwrite each other.
    if (seen.has(id)) return res.status(400).json({ error: `${id} is listed twice` });
    seen.add(id);
    if (!isPositiveInteger(raw?.sets) || raw.sets > 20) return res.status(400).json({ error: "sets must be 1-20" });
    if (!isPositiveInteger(raw?.reps) || raw.reps > 500) return res.status(400).json({ error: "reps must be 1-500" });
    clean.push({ id, sets: raw.sets, reps: raw.reps });
  }

  const plan = await WorkoutDayPlan.findOneAndUpdate({ dayKey }, { $set: { dayKey, slots: clean } }, { upsert: true, returnDocument: "after" });
  res.json({ dayKey, slots: plan!.slots.map((sl) => ({ id: sl.id, sets: sl.sets, reps: sl.reps })) });
});

router.delete("/day-plans/:dayKey", async (req, res) => {
  const dayKey = trimmedString(req.params.dayKey);
  if (!dayKey) return res.status(400).json({ error: "invalid dayKey" });
  await WorkoutDayPlan.deleteOne({ dayKey });
  res.json({ ok: true, dayKey });
});

// =====================================================================
// Per-movement notes. Keyed by movement, not by day, so a note about a machine
// follows that exercise wherever it turns up.
// GET /workouts/exercise-notes            every note, as { movementId: note }
// PUT /workouts/exercise-notes/:movementId
// =====================================================================
router.get("/exercise-notes", async (_req, res) => {
  const notes = await ExerciseNote.find();
  const out: Record<string, string> = {};
  for (const n of notes) out[n.movementId] = n.note;
  res.json(out);
});

router.put("/exercise-notes/:movementId", async (req, res) => {
  const movementId = trimmedString(req.params.movementId);
  if (!movementId || movementId.length > 60) return res.status(400).json({ error: "invalid movementId" });
  const note = req.body?.note;
  if (typeof note !== "string") return res.status(400).json({ error: "note must be a string" });
  if (note.length > 2000) return res.status(400).json({ error: "note is too long" });

  if (note.trim() === "") {
    // An emptied note is a deleted note; no point keeping blank rows around.
    await ExerciseNote.deleteOne({ movementId });
    return res.json({ movementId, note: "" });
  }
  await ExerciseNote.findOneAndUpdate({ movementId }, { $set: { movementId, note } }, { upsert: true });
  res.json({ movementId, note });
});

// =====================================================================
// GET /workouts/settings   /   PATCH /workouts/settings
// Which split the user follows. `chosenAt` is what tells the page whether to show
// the first-run picker or go straight to the session.
// =====================================================================
router.get("/settings", async (_req, res) => {
  const s = await loadWorkoutSettings();
  res.json({ splitId: s.splitId, hasChosenSplit: !!s.chosenAt, stallNoticeSessions: s.stallNoticeSessions, stallDeloadSessions: s.stallDeloadSessions });
});

router.patch("/settings", async (req, res) => {
  const { splitId, stallNoticeSessions, stallDeloadSessions } = req.body;
  const s = await loadWorkoutSettings();

  if (splitId !== undefined) {
    if (typeof splitId !== "string" || !/^[A-Za-z0-9_]{1,60}$/.test(splitId)) {
      return res.status(400).json({ error: "valid splitId required" });
    }
    s.splitId = splitId;
    s.chosenAt = new Date();
  }

  for (const [field, value] of [
    ["stallNoticeSessions", stallNoticeSessions],
    ["stallDeloadSessions", stallDeloadSessions],
  ] as const) {
    if (value === undefined) continue;
    if (!isPositiveInteger(value) || value < 2 || value > 20) return res.status(400).json({ error: `${field} must be between 2 and 20` });
    s.set(field, value);
  }

  // A deload that fires before the notice would make the notice pointless.
  if (s.stallDeloadSessions < s.stallNoticeSessions) {
    return res.status(400).json({ error: "the deload threshold must be at least the notice threshold" });
  }

  await s.save();
  res.json({ splitId: s.splitId, hasChosenSplit: !!s.chosenAt, stallNoticeSessions: s.stallNoticeSessions, stallDeloadSessions: s.stallDeloadSessions });
});

// =====================================================================
// GET /workouts/today
// Returns today's session if it exists, else suggests the next type.
// =====================================================================
router.get("/today", async (req, res) => {
  // "Today" is the caller's local calendar day, not the server's UTC one. Deriving it
  // from the server clock made this endpoint return yesterday's session for the hours
  // when local time is ahead of UTC. In Africa/Cairo, every day between local
  // midnight and 03:00, so a session logged on the 26th also showed up on the 27th.
  // See client/src/lib/today.ts for the same rule on the client.
  if (req.query.date !== undefined && !parseDayUTC(req.query.date)) {
    return res.status(400).json({ error: "valid date required" });
  }
  const today = parseDayUTC(req.query.date) ?? toDayUTC(new Date());

  const settings = await loadWorkoutSettings();
  const existing = await WorkoutSession.findOne({ date: today });

  // The split cycles live in the client catalogue, which has 34 of them. Rather than
  // keep a second copy here that could drift, the server reports where the last
  // session sat in its cycle and the client walks its own catalogue from there.
  const last = await WorkoutSession.findOne({ date: { $lt: today } }).sort({ date: -1 });

  res.json({
    session: existing ? serializeSession(existing) : null,
    splitId: settings.splitId,
    hasChosenSplit: !!settings.chosenAt,
    last: last ? { type: normalizeWorkoutType(last.type), splitId: last.splitId ?? "", cycleIndex: last.cycleIndex ?? null, date: last.date.toISOString().slice(0, 10) } : null,
  });
});

// =====================================================================
// GET /workouts/session?date=YYYY-MM-DD
// =====================================================================
router.get("/session", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const session = await WorkoutSession.findOne({ date: day });
  res.json(session ? serializeSession(session) : null);
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
  const { date, type, splitId, cycleIndex, warmupMinutes, finisherMinutes } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (typeof type !== "string" || !isValidType(type)) return res.status(400).json({ error: "invalid type" });
  if (warmupMinutes !== undefined && !isNonNegativeNumber(warmupMinutes)) {
    return res.status(400).json({ error: "warmupMinutes must be a non-negative number" });
  }
  if (finisherMinutes !== undefined && !isNonNegativeNumber(finisherMinutes)) {
    return res.status(400).json({ error: "finisherMinutes must be a non-negative number" });
  }

  const existing = await WorkoutSession.findOne({ date: day });
  if (existing) return res.status(409).json({ error: "session already exists for this date", session: serializeSession(existing) });

  const session = await WorkoutSession.create({
    date: day,
    type,
    splitId: typeof splitId === "string" ? splitId : "",
    cycleIndex: Number.isInteger(cycleIndex) ? cycleIndex : null,
    warmupMinutes: type === REST_DAY ? 0 : (warmupMinutes ?? 10),
    finisherMinutes: type === REST_DAY ? 0 : (finisherMinutes ?? 20),
  });
  res.json(serializeSession(session));
});

// =====================================================================
// PATCH /workouts/session/:id
// Update warmup/finisher/walk/completedAt/note/type
// =====================================================================
router.patch("/session/:id", async (req, res) => {
  const { type, warmupMinutes, warmupDone, finisherMinutes, finisherDone, walkMinutes, walkDistanceKm, completedAt, note } = req.body;

  if (type !== undefined && (typeof type !== "string" || !isValidType(type))) {
    return res.status(400).json({ error: "invalid type" });
  }
  const numericFields = { warmupMinutes, finisherMinutes, walkMinutes, walkDistanceKm };
  for (const [field, value] of Object.entries(numericFields)) {
    if (value !== undefined && !isNonNegativeNumber(value)) {
      return res.status(400).json({ error: `${field} must be a non-negative number` });
    }
  }
  let completedAtDate: Date | null = null;
  if (completedAt !== undefined && completedAt !== null) {
    completedAtDate = new Date(completedAt);
    if (Number.isNaN(completedAtDate.getTime())) {
      return res.status(400).json({ error: "valid completedAt required" });
    }
  }

  const session = await WorkoutSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  if (typeof req.body.cycleIndex === "number") session.set("cycleIndex", req.body.cycleIndex);
  if (typeof req.body.splitId === "string") session.set("splitId", req.body.splitId);

  if (type && type !== normalizeWorkoutType(session.type)) {
    // Sets are keyed by exercise id, and the two halves of the split share none.
    // Leaving the old ones behind would keep them attached to the session, counting
    // toward totals and re-appearing if the user switched back.
    await SetLog.deleteMany({ sessionId: session._id });
    session.set("type", type);
  } else if (type) {
    session.set("type", type);
  }

  if (warmupMinutes !== undefined) session.warmupMinutes = warmupMinutes;
  if (typeof warmupDone === "boolean") session.warmupDone = warmupDone;
  if (finisherMinutes !== undefined) session.finisherMinutes = finisherMinutes;
  if (typeof finisherDone === "boolean") session.finisherDone = finisherDone;
  if (walkMinutes !== undefined) session.walkMinutes = walkMinutes;
  if (walkDistanceKm !== undefined) session.walkDistanceKm = walkDistanceKm;
  if (typeof note === "string") session.note = note;

  if (completedAt === null) session.completedAt = null;
  else if (completedAtDate) session.completedAt = completedAtDate;

  await session.save();
  res.json(serializeSession(session));
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
// Body: { sessionId, exerciseId, setNumber, weight?, reps?, rpe?, done? }
// =====================================================================
router.put("/sets", async (req, res) => {
  const { sessionId, exerciseId, setNumber, weight, reps, rpe, done } = req.body;
  if (!isObjectId(sessionId)) return res.status(400).json({ error: "invalid sessionId" });

  const cleanExerciseId = trimmedString(exerciseId);
  if (!cleanExerciseId) return res.status(400).json({ error: "exerciseId required" });
  if (!isPositiveInteger(setNumber)) {
    return res.status(400).json({ error: "setNumber must be a positive integer" });
  }
  if (weight !== undefined && weight !== null && !isNonNegativeNumber(weight)) {
    return res.status(400).json({ error: "weight must be a non-negative number" });
  }
  if (reps !== undefined && reps !== null && !isNonNegativeNumber(reps)) {
    return res.status(400).json({ error: "reps must be a non-negative number" });
  }
  if (rpe !== undefined && rpe !== null && (typeof rpe !== "number" || !Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
    return res.status(400).json({ error: "rpe must be between 1 and 10" });
  }
  if (done !== undefined && typeof done !== "boolean") {
    return res.status(400).json({ error: "done must be a boolean" });
  }

  // Upserting without this check would create orphaned sets pointing at a session that never existed.
  const session = await WorkoutSession.findById(sessionId);
  if (!session) return res.status(404).json({ error: "session not found" });

  const update: Record<string, unknown> = {};
  if (weight !== undefined) update.weight = weight;
  if (reps !== undefined) update.reps = reps;
  if (rpe !== undefined) update.rpe = rpe;
  if (typeof done === "boolean") update.done = done;

  const set = await SetLog.findOneAndUpdate({ sessionId, exerciseId: cleanExerciseId, setNumber }, { $set: update, $setOnInsert: { sessionId, exerciseId: cleanExerciseId, setNumber } }, { upsert: true, new: true });
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
  const exerciseId = trimmedString(req.query.exerciseId);
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
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 7, 1), 30);
  const sessions = await WorkoutSession.find().sort({ date: -1 }).limit(limit);
  res.json(sessions.map(serializeSession));
});

// =====================================================================
// GET /workouts/last-weights?before=YYYY-MM-DD
// Returns a map of { exerciseId: { weight, reps, when, best } } for inline hints.
//
// `before` restricts the lookup to sessions strictly earlier than that day. The
// page passes the date being viewed, so browsing back to an old session shows what
// was lifted *before* it rather than the newest numbers on record.
// =====================================================================
router.get("/last-weights", async (req, res) => {
  if (req.query.before !== undefined && !parseDayUTC(req.query.before)) {
    return res.status(400).json({ error: "valid before date required" });
  }
  const before = parseDayUTC(req.query.before);

  const rows = await SetLog.aggregate([
    { $match: { weight: { $ne: null, $gt: 0 } } },
    { $lookup: { from: "workoutsessions", localField: "sessionId", foreignField: "_id", as: "session" } },
    { $unwind: "$session" },
    ...(before ? [{ $match: { "session.date": { $lt: before } } }] : []),
    // Order by the day trained, not by row creation: sets can be edited later.
    { $sort: { "session.date": -1, createdAt: -1 } },
    {
      $group: {
        _id: "$exerciseId",
        weight: { $first: "$weight" },
        reps: { $first: "$reps" },
        when: { $first: "$session.date" },
        lastSessionId: { $first: "$sessionId" },
        best: { $max: "$weight" },
        // Heaviest estimated one-rep max ever recorded for this movement, by Epley.
        // Computed here so the client never has to pull the whole set history.
        bestE1rm: { $max: { $multiply: ["$weight", { $add: [1, { $divide: [{ $ifNull: ["$reps", 1] }, 30] }] }] } },
      },
    },
  ]);

  // Every set from the session that movement was last trained in. The suggestion
  // needs the whole set, not just the top one: whether you completed all of them at
  // the target reps is what decides between adding load and repeating it.
  const lastSets = await SetLog.find({
    $or: rows.map((r) => ({ exerciseId: r._id, sessionId: r.lastSessionId })),
  }).sort({ setNumber: 1 });

  const byExercise: Record<string, { weight: number | null; reps: number | null; rpe: number | null; done: boolean }[]> = {};
  for (const s of lastSets) {
    (byExercise[s.exerciseId] ||= []).push({ weight: s.weight ?? null, reps: s.reps ?? null, rpe: s.rpe ?? null, done: s.done });
  }

  // One entry per session per movement (its best set) for the most recent few
  // sessions. Stall detection needs a trend, not just the latest number.
  const RECENT_SESSIONS = 8;
  const trend = await SetLog.aggregate([
    { $match: { weight: { $ne: null, $gt: 0 } } },
    { $lookup: { from: "workoutsessions", localField: "sessionId", foreignField: "_id", as: "session" } },
    { $unwind: "$session" },
    ...(before ? [{ $match: { "session.date": { $lt: before } } }] : []),
    {
      $group: {
        _id: { exerciseId: "$exerciseId", sessionId: "$sessionId" },
        date: { $first: "$session.date" },
        weight: { $max: "$weight" },
        reps: { $max: "$reps" },
        e1rm: { $max: { $multiply: ["$weight", { $add: [1, { $divide: [{ $ifNull: ["$reps", 1] }, 30] }] }] } },
      },
    },
    { $sort: { date: -1 } },
    { $group: { _id: "$_id.exerciseId", sessions: { $push: { date: "$date", weight: "$weight", reps: "$reps", e1rm: "$e1rm" } } } },
    { $project: { sessions: { $slice: ["$sessions", RECENT_SESSIONS] } } },
  ]);

  const trendByExercise: Record<string, { date: string; weight: number; reps: number | null; e1rm: number }[]> = {};
  for (const t of trend) {
    trendByExercise[t._id] = t.sessions.map((s: { date: Date; weight: number; reps: number | null; e1rm: number }) => ({
      date: s.date.toISOString().slice(0, 10),
      weight: s.weight,
      reps: s.reps,
      e1rm: Math.round(s.e1rm * 10) / 10,
    }));
  }

  const map: Record<string, unknown> = {};
  for (const r of rows) {
    map[r._id] = {
      weight: r.weight,
      reps: r.reps,
      when: r.when,
      best: r.best,
      bestE1rm: Math.round((r.bestE1rm ?? 0) * 10) / 10,
      lastSets: byExercise[r._id] ?? [],
      recent: trendByExercise[r._id] ?? [],
    };
  }
  res.json(map);
});

router.get("/stats", async (req, res) => {
  if (req.query.to !== undefined && !parseDayUTC(req.query.to)) {
    return res.status(400).json({ error: "valid to date required" });
  }
  if (req.query.from !== undefined && !parseDayUTC(req.query.from)) {
    return res.status(400).json({ error: "valid from date required" });
  }

  const to =
    parseDayUTC(req.query.to) ??
    (() => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
  const from =
    parseDayUTC(req.query.from) ??
    (() => {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - 30);
      return d;
    })();

  const sessions = await WorkoutSession.find({
    date: { $gte: from, $lt: to },
  }).sort({ date: 1 });

  const sessionIds = sessions.map((s) => s._id);

  const allSets = await SetLog.find({ sessionId: { $in: sessionIds } });

  // Per-session aggregates
  const setsBySession: Record<string, typeof allSets> = {};
  for (const s of allSets) {
    const sid = s.sessionId.toString();
    (setsBySession[sid] ||= []).push(s);
  }

  // Training volume is weight x reps now that both are user-entered. Sets logged
  // before reps were captured fall back to the bare weight so historical totals
  // stay non-zero rather than silently dropping out.
  const setVolume = (set: { weight?: number | null; reps?: number | null }) => {
    if (set.weight == null || set.weight <= 0) return 0;
    return set.reps != null && set.reps > 0 ? set.weight * set.reps : set.weight;
  };

  let totalWeightLogged = 0;
  let totalSetsDone = 0;

  // A rest day has nothing to finish, so it never gets a completedAt. Counting it in
  // the denominator made a perfectly followed week read as "2/3 finished". The
  // adherence ratio is about training sessions only; rest days are reported on their
  // own in sessionsByType.
  const trainingSessions = sessions.filter((s) => normalizeWorkoutType(s.type) !== "rest");
  const completedTrainingSessions = trainingSessions.filter((s) => s.completedAt).length;
  const completedSessions = sessions.filter((s) => s.completedAt).length;
  const sessionsByType: Record<string, number> = {};

  for (const s of sessions) {
    const key = normalizeWorkoutType(s.type);
    sessionsByType[key] = (sessionsByType[key] ?? 0) + 1;
    const sets = setsBySession[s._id.toString()] ?? [];
    for (const set of sets) {
      if (set.done) totalSetsDone++;
      totalWeightLogged += setVolume(set);
    }
  }

  // Per-day frequency map
  const dayMap: Record<string, { date: string; type: string; volume: number; setsDone: number; completed: boolean; note: string }> = {};
  for (const s of sessions) {
    const iso = s.date.toISOString().slice(0, 10);
    const sets = setsBySession[s._id.toString()] ?? [];
    const volume = sets.reduce((acc, set) => acc + setVolume(set), 0);
    const setsDone = sets.filter((set) => set.done).length;
    dayMap[iso] = {
      date: iso,
      type: normalizeWorkoutType(s.type),
      volume,
      setsDone,
      completed: !!s.completedAt,
      note: s.note ?? "",
    };
  }

  // Best lifts per exercise (max weight ever, in this range)
  const bestByExercise: Record<string, { weight: number; reps: number; date: string }> = {};
  for (const s of sessions) {
    const iso = s.date.toISOString().slice(0, 10);
    const sets = setsBySession[s._id.toString()] ?? [];
    for (const set of sets) {
      if (set.weight != null && set.weight > 0) {
        const current = bestByExercise[set.exerciseId];
        if (!current || set.weight > current.weight) {
          bestByExercise[set.exerciseId] = {
            weight: set.weight,
            reps: set.reps ?? 0,
            date: iso,
          };
        }
      }
    }
  }

  res.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    totalSessions: sessions.length,
    completedSessions,
    trainingSessions: trainingSessions.length,
    completedTrainingSessions,
    sessionsByType,
    totalWeightLogged,
    totalSetsDone,
    days: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
    bestByExercise,
  });
});

// =====================================================================
// GET /workouts/exercise-progress?exerciseId=X&limit=N
// Returns history for one exercise: best set per session, last N sessions
// =====================================================================
router.get("/exercise-progress", async (req, res) => {
  const exerciseId = trimmedString(req.query.exerciseId);
  if (!exerciseId) return res.status(400).json({ error: "exerciseId required" });
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 12, 1), 50);

  // Find all sets for this exercise that have weight or reps logged
  const sets = await SetLog.find({
    exerciseId,
    $or: [{ weight: { $ne: null, $gt: 0 } }, { reps: { $ne: null, $gt: 0 } }],
  })
    .populate("sessionId")
    .sort({ createdAt: -1 });

  // Group by sessionId, take the best set per session (heaviest weight, tiebreaker on reps)
  type BestSet = { weight: number | null; reps: number | null; sessionId: string; date: string; setNumber: number };
  const perSession: Record<string, BestSet> = {};
  for (const s of sets) {
    const sid = s.sessionId._id ? s.sessionId._id.toString() : s.sessionId.toString();
    const session = s.sessionId as unknown as { date?: Date; _id?: unknown };
    const date = session.date ? session.date.toISOString().slice(0, 10) : "";
    const candidate: BestSet = {
      weight: s.weight ?? null,
      reps: s.reps ?? null,
      sessionId: sid,
      date,
      setNumber: s.setNumber,
    };
    const cur = perSession[sid];
    if (!cur) {
      perSession[sid] = candidate;
    } else {
      const w = candidate.weight ?? 0;
      const cw = cur.weight ?? 0;
      if (w > cw || (w === cw && (candidate.reps ?? 0) > (cur.reps ?? 0))) {
        perSession[sid] = candidate;
      }
    }
  }

  const sorted = Object.values(perSession).sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-limit);

  res.json({ exerciseId, history: recent });
});

export default router;
