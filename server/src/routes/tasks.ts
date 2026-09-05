import { Router } from "express";
import { DAILY_TASK_TITLE, Task } from "../models/Task";
import { monthRange, toDayUTC } from "../lib/dates";
import { isObjectId, objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The optional "when" half of a task: a time of day, and when to be reminded.
 *
 * Both are cleared by sending null, which is how the bell is switched back off.
 */
function readWhen(body: Record<string, unknown>): { ok: true; value: { time?: string | null; remindAt?: Date | null } } | { ok: false; error: string } {
  const value: { time?: string | null; remindAt?: Date | null } = {};

  if (body.time !== undefined) {
    if (body.time === null || body.time === "") value.time = null;
    else if (typeof body.time === "string" && CLOCK.test(body.time)) value.time = body.time;
    else return { ok: false, error: "the time has to look like 15:00" };
  }

  if (body.remindAt !== undefined) {
    if (body.remindAt === null || body.remindAt === "") value.remindAt = null;
    else {
      const at = new Date(String(body.remindAt));
      if (Number.isNaN(at.getTime())) return { ok: false, error: "that reminder time does not look right" };
      value.remindAt = at;
    }
  }

  return { ok: true, value };
}

function startOfToday() {
  return toDayUTC(new Date());
}

// =====================================================================
// GET /tasks/overdue
// Unfinished tasks left on days that have already passed. Without this they were
// unreachable: the day view only asks for today and the calendar only for the
// month you happen to be looking at, so anything missed silently disappeared.
// =====================================================================
router.get("/overdue", async (req, res) => {
  // Same rule as ensure-daily: "before today" means before the caller's local day.
  if (req.query.today !== undefined && !parseDayUTC(req.query.today)) {
    return res.status(400).json({ error: "valid today date required" });
  }
  const cutoff = parseDayUTC(req.query.today) ?? startOfToday();
  const tasks = await Task.find({ done: false, date: { $lt: cutoff } }).sort({ date: 1, createdAt: 1 });
  res.json(tasks);
});

// =====================================================================
// POST /tasks/bulk-move
// Body: { ids: string[], date: "YYYY-MM-DD" }
// Moves many tasks at once so clearing a backlog is one action, not twenty.
// =====================================================================
router.post("/bulk-move", async (req, res) => {
  const { ids, date } = req.body;
  const day = parseDayUTC(date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  if (ids.length > 200) return res.status(400).json({ error: "too many ids" });
  if (!ids.every((id) => typeof id === "string" && isObjectId(id))) {
    return res.status(400).json({ error: "ids must be valid object ids" });
  }

  const result = await Task.updateMany({ _id: { $in: ids } }, { $set: { date: day } });
  const tasks = await Task.find({ _id: { $in: ids } }).sort({ date: 1, createdAt: 1 });
  res.json({ moved: result.modifiedCount, tasks });
});

// =====================================================================
// POST /tasks/ensure-daily   Body: { date: "YYYY-MM-DD" }
// Guarantees the day's anchor task exists, then returns that day's list.
//
// The date comes from the client rather than the server clock on purpose: the app
// treats "today" as the user's *local* calendar day (see client/src/lib/today.ts),
// and deriving it from the server's UTC clock would create the anchor on the wrong
// day for the hours when local time is ahead of UTC.
//
// This is a POST because it writes. Creating rows as a side effect of a GET would
// mean any stray prefetch silently seeds data.
// =====================================================================
router.post("/ensure-daily", async (req, res) => {
  const day = parseDayUTC(req.body?.date);
  if (!day) return res.status(400).json({ error: "valid date required" });

  try {
    await Task.updateOne(
      { date: day, isDefault: true },
      { $setOnInsert: { title: DAILY_TASK_TITLE, date: day, isDefault: true, done: false, completedAt: null } },
      { upsert: true },
    );
  } catch (e) {
    // A duplicate key here means a concurrent request won the race, which is the
    // outcome we wanted anyway. Anything else is a real failure.
    if ((e as { code?: number }).code !== 11000) throw e;
  }

  const tasks = await Task.find({ date: day }).sort({ isDefault: -1, createdAt: 1 });
  res.json(tasks);
});

// Get tasks for a specific day
router.get("/day", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const tasks = await Task.find({ date: day }).sort({ isDefault: -1, createdAt: 1 });
  res.json(tasks);
});

// Get all tasks in a month (for the calendar view)
router.get("/month", async (req, res) => {
  const year = parseInt(req.query.year as string, 10);
  const month = parseInt(req.query.month as string, 10);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return res.status(400).json({ error: "valid year required" });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "month must be between 1 and 12" });
  }
  const { start, end } = monthRange(year, month);
  const tasks = await Task.find({ date: { $gte: start, $lt: end } }).sort({ date: 1, isDefault: -1, createdAt: 1 });
  res.json(tasks);
});

// Create
router.post("/", async (req, res) => {
  const { title, date } = req.body;
  // Validate the trimmed title so a whitespace-only string is rejected.
  const cleanTitle = trimmedString(title);
  const day = parseDayUTC(date);
  if (!cleanTitle) return res.status(400).json({ error: "title required" });
  if (!day) return res.status(400).json({ error: "valid date required" });

  const when = readWhen(req.body);
  if (!when.ok) return res.status(400).json({ error: when.error });

  const task = await Task.create({ title: cleanTitle, date: day, ...when.value });
  res.json(task);
});

// Update (title, date, done)
router.patch("/:id", async (req, res) => {
  const { title, date, done } = req.body;

  let cleanTitle: string | null = null;
  if (title !== undefined) {
    cleanTitle = trimmedString(title);
    if (!cleanTitle) return res.status(400).json({ error: "title required" });
  }
  let day: Date | null = null;
  if (date !== undefined) {
    day = parseDayUTC(date);
    if (!day) return res.status(400).json({ error: "valid date required" });
  }
  if (done !== undefined && typeof done !== "boolean") {
    return res.status(400).json({ error: "done must be a boolean" });
  }

  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });

  const when = readWhen(req.body);
  if (!when.ok) return res.status(400).json({ error: when.error });

  if (cleanTitle) task.title = cleanTitle;
  if (day) task.date = day;
  if ("time" in req.body) task.time = when.value.time ?? null;
  if ("remindAt" in req.body) {
    task.remindAt = when.value.remindAt ?? null;
    // A reminder that has been moved has not happened yet.
    task.remindedAt = null;
  }
  if (typeof done === "boolean") {
    task.done = done;
    task.completedAt = done ? new Date() : null;
  }

  await task.save();
  res.json(task);
});

router.delete("/:id", async (req, res) => {
  const existing = await Task.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  // The anchor is what gives the habit row something to track on an otherwise empty
  // day; deleting it would just make it reappear on the next ensure-daily call.
  if (existing.isDefault) return res.status(400).json({ error: "the daily task cannot be deleted" });
  await existing.deleteOne();
  res.json({ ok: true });
});

export default router;
