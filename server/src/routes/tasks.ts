import { Router } from "express";
import { Task } from "../models/Task";
import { monthRange } from "../lib/dates";
import { objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);

// Get tasks for a specific day
router.get("/day", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });
  const tasks = await Task.find({ date: day }).sort({ createdAt: 1 });
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
  const tasks = await Task.find({ date: { $gte: start, $lt: end } }).sort({ date: 1, createdAt: 1 });
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

  const task = await Task.create({ title: cleanTitle, date: day });
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

  if (cleanTitle) task.title = cleanTitle;
  if (day) task.date = day;
  if (typeof done === "boolean") {
    task.done = done;
    task.completedAt = done ? new Date() : null;
  }

  await task.save();
  res.json(task);
});

router.delete("/:id", async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
