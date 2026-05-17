import { Router } from "express";
import { Task } from "../models/Task";
import { toDayUTC, monthRange } from "../lib/dates";

const router = Router();

// Get tasks for a specific day
router.get("/day", async (req, res) => {
  const dateStr = req.query.date as string;
  if (!dateStr) return res.status(400).json({ error: "date required" });
  const day = toDayUTC(dateStr);
  const tasks = await Task.find({ date: day }).sort({ createdAt: 1 });
  res.json(tasks);
});

// Get all tasks in a month (for the calendar view)
router.get("/month", async (req, res) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) return res.status(400).json({ error: "year + month required" });
  const { start, end } = monthRange(year, month);
  const tasks = await Task.find({ date: { $gte: start, $lt: end } }).sort({ date: 1, createdAt: 1 });
  res.json(tasks);
});

// Create
router.post("/", async (req, res) => {
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: "missing fields" });

  const day = toDayUTC(date);
  const task = await Task.create({ title: title.trim(), date: day });
  res.json(task);
});

// Update (title, date, done)
router.patch("/:id", async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });

  const { title, date, done } = req.body;
  if (typeof title === "string") task.title = title.trim();
  if (date) task.date = toDayUTC(date);
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
