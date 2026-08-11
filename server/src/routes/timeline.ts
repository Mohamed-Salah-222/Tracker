import { Router } from "express";
import { TimelineDay } from "../models/TimelineDay";
import { parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();

type TimelineEvent = {
  id: string;
  start: string;
  end: string;
  title: string;
  details?: string[];
  waterLiters?: number;
  options?: string[];
  linkedTo?: string;
  linkedTitles?: Record<string, string>;
};

type TimelineTemplate = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  events: TimelineEvent[];
};

const lateChoice = {
  id: "late-choice",
  start: "22:00",
  end: "00:00",
  title: "Coding or Free time",
  waterLiters: 1,
  options: ["Coding", "Free time"],
};

const lateFollowUp = {
  id: "late-follow-up",
  start: "00:00",
  end: "02:00",
  title: "Opposite block",
  linkedTo: "late-choice",
  linkedTitles: {
    Coding: "Free time",
    "Free time": "Coding",
  },
};

const templates: TimelineTemplate[] = [
  {
    id: "work-gym",
    name: "Work + Gym Day",
    shortName: "Work + Gym",
    description: "Gym, project work, work shift, walking, and late-night flex block.",
    events: [
      { id: "gym", start: "10:00", end: "12:00", title: "Gym + Atomic Habits", waterLiters: 1.5 },
      { id: "free-noon", start: "12:00", end: "13:00", title: "Free time" },
      { id: "coding-mia", start: "13:00", end: "15:00", title: "Coding MIA + Bigger Leaner Stronger", details: ["Book summary"], waterLiters: 1 },
      { id: "lunch", start: "15:00", end: "16:00", title: "Lunch" },
      { id: "work", start: "16:00", end: "21:30", title: "Work", waterLiters: 1 },
      { id: "walking", start: "21:30", end: "22:00", title: "Walking", waterLiters: 0.5 },
      lateChoice,
      lateFollowUp,
    ],
  },
  {
    id: "work-rest",
    name: "Work + Rest From Gym Day",
    shortName: "Work + Rest",
    description: "Project work instead of gym, work shift, walking, and late-night flex block.",
    events: [
      { id: "coding-werewolf", start: "10:00", end: "12:00", title: "Coding Werewolf", waterLiters: 1 },
      { id: "free-noon", start: "12:00", end: "13:00", title: "Free time" },
      { id: "coding-mia", start: "13:00", end: "15:00", title: "Coding MIA + Bigger Leaner Stronger", details: ["Book summary"], waterLiters: 1 },
      { id: "lunch", start: "15:00", end: "16:00", title: "Lunch" },
      { id: "work", start: "16:00", end: "21:30", title: "Work", waterLiters: 1 },
      { id: "walking", start: "21:30", end: "22:00", title: "Walking", waterLiters: 1 },
      lateChoice,
      lateFollowUp,
    ],
  },
  {
    id: "no-work-gym",
    name: "No Work + Gym Day",
    shortName: "No Work + Gym",
    description: "Gym, project blocks, free time, walking, and late-night flex block.",
    events: [
      { id: "gym", start: "10:00", end: "12:00", title: "Gym + Atomic Habits", waterLiters: 1.5 },
      { id: "free-noon", start: "12:00", end: "13:00", title: "Free time" },
      { id: "coding-mia", start: "13:00", end: "15:00", title: "Coding MIA + Bigger Leaner Stronger", details: ["Book summary"], waterLiters: 1 },
      { id: "lunch", start: "15:00", end: "16:00", title: "Lunch" },
      { id: "coding-aflam", start: "16:00", end: "17:30", title: "Coding Aflam", waterLiters: 1 },
      { id: "coding-werewolf", start: "17:30", end: "19:00", title: "Coding Werewolf" },
      { id: "free-evening", start: "19:00", end: "21:00", title: "Free time" },
      { id: "walking", start: "21:00", end: "22:00", title: "Walking", waterLiters: 1 },
      lateChoice,
      lateFollowUp,
    ],
  },
  {
    id: "no-work-no-gym",
    name: "No Work + No Gym Day",
    shortName: "No Work + No Gym",
    description: "Free blocks, project work, and heavier water reminders.",
    events: [
      { id: "breakfast-free", start: "10:00", end: "12:00", title: "Free time + Breakfast", waterLiters: 1 },
      { id: "coding-mia", start: "12:00", end: "14:00", title: "Coding MIA", waterLiters: 1 },
      { id: "free-afternoon", start: "14:00", end: "16:00", title: "Free time", waterLiters: 1 },
      { id: "coding-aflam", start: "16:00", end: "17:30", title: "Coding Aflam" },
      { id: "coding-werewolf", start: "17:30", end: "19:00", title: "Coding Werewolf" },
      { id: "free-night", start: "19:00", end: "02:00", title: "Free time", waterLiters: 2 },
    ],
  },
];

function templateById(id: string | null) {
  return templates.find((template) => template.id === id) ?? null;
}

function dayView(doc: Awaited<ReturnType<typeof TimelineDay.findOne>>, date: Date) {
  const template = templateById(doc?.templateId ?? null);
  return {
    date: date.toISOString().slice(0, 10),
    templateId: doc?.templateId ?? null,
    template,
    checkedEventIds: doc?.checkedEventIds ?? [],
    optionChoices: doc?.optionChoices ? Object.fromEntries(doc.optionChoices.entries()) : {},
  };
}

router.get("/templates", (_req, res) => {
  res.json(templates);
});

router.get("/day", async (req, res) => {
  const date = parseDayUTC(req.query.date);
  if (!date) return res.status(400).json({ error: "valid date required" });
  const doc = await TimelineDay.findOne({ date });
  res.json(dayView(doc, date));
});

router.put("/day", async (req, res) => {
  const date = parseDayUTC(req.body?.date);
  if (!date) return res.status(400).json({ error: "valid date required" });
  const templateId = trimmedString(req.body?.templateId);
  if (!templateId || !templateById(templateId)) return res.status(400).json({ error: "valid templateId required" });

  const existing = await TimelineDay.findOne({ date });
  const doc = await TimelineDay.findOneAndUpdate(
    { date },
    {
      $set: {
        templateId,
        checkedEventIds: existing?.templateId === templateId ? existing.checkedEventIds : [],
        optionChoices: existing?.templateId === templateId ? existing.optionChoices : {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json(dayView(doc, date));
});

router.patch("/day/:date/events/:eventId", async (req, res) => {
  const date = parseDayUTC(req.params.date);
  if (!date) return res.status(400).json({ error: "valid date required" });
  const eventId = trimmedString(req.params.eventId);
  if (!eventId) return res.status(400).json({ error: "eventId required" });

  const doc = await TimelineDay.findOne({ date });
  if (!doc) return res.status(404).json({ error: "choose a template first" });
  const template = templateById(doc.templateId);
  if (!template?.events.some((event) => event.id === eventId)) return res.status(400).json({ error: "event does not belong to this template" });

  const checked = Boolean(req.body?.checked);
  doc.checkedEventIds = checked ? Array.from(new Set([...doc.checkedEventIds, eventId])) : doc.checkedEventIds.filter((id) => id !== eventId);
  await doc.save();
  res.json(dayView(doc, date));
});

router.patch("/day/:date/options/:eventId", async (req, res) => {
  const date = parseDayUTC(req.params.date);
  if (!date) return res.status(400).json({ error: "valid date required" });
  const eventId = trimmedString(req.params.eventId);
  const choice = trimmedString(req.body?.choice);
  if (!eventId || !choice) return res.status(400).json({ error: "eventId and choice required" });

  const doc = await TimelineDay.findOne({ date });
  if (!doc) return res.status(404).json({ error: "choose a template first" });
  const event = templateById(doc.templateId)?.events.find((candidate) => candidate.id === eventId);
  if (!event?.options?.includes(choice)) return res.status(400).json({ error: "invalid option choice" });

  doc.optionChoices.set(eventId, choice);
  await doc.save();
  res.json(dayView(doc, date));
});

export default router;
