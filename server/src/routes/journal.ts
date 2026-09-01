import { Router } from "express";
import { JournalEntry } from "../models/JournalEntry";
import { excerptOf, isMood, iso, readTags, wordCount } from "../lib/journal";
import { escapeRegex, parseDayUTC } from "../lib/validation";
import { parsePageParams } from "../lib/pagination";

const router = Router();

const todayFrom = (v: unknown) => iso(parseDayUTC(v) ?? new Date());

type EntryDoc = InstanceType<typeof JournalEntry>;

function shape(doc: EntryDoc) {
  return {
    _id: String(doc._id),
    date: iso(doc.date),
    body: doc.body ?? "",
    mood: doc.mood ?? null,
    tags: doc.tags ?? [],
    words: wordCount(doc.body ?? ""),
    updatedAt: doc.get("updatedAt") ?? null,
  };
}

function shapeRow(doc: EntryDoc) {
  return { ...shape(doc), excerpt: excerptOf(doc.body ?? "") };
}

// =====================================================================
// GET /journal?q=&tag=&mood=&from=&to=&page=
// The archive. Searching the body is the whole point of writing one, so the text is
// matched with an escaped pattern rather than handed to Mongo as a regex.
// =====================================================================
router.get("/", async (req, res) => {
  const page = parsePageParams(req.query);
  const filter: Record<string, unknown> = {};

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) filter.body = { $regex: escapeRegex(q), $options: "i" };

  const tag = typeof req.query.tag === "string" ? req.query.tag.trim().toLowerCase() : "";
  if (tag) filter.tags = tag;

  if (isMood(req.query.mood)) filter.mood = req.query.mood;

  const from = parseDayUTC(req.query.from);
  const to = parseDayUTC(req.query.to);
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  const [docs, total] = await Promise.all([
    JournalEntry.find(filter).sort({ date: -1 }).skip(page.offset).limit(page.limit),
    JournalEntry.countDocuments(filter),
  ]);

  res.json({ items: docs.map(shapeRow), total, offset: page.offset, limit: page.limit });
});

// =====================================================================
// GET /journal/stats?today=
// Enough for a header: how many entries, the current writing streak, every tag in
// use, and how the moods break down.
// =====================================================================
router.get("/stats", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  const docs = await JournalEntry.find().sort({ date: -1 }).select({ date: 1, mood: 1, tags: 1, body: 1 });

  const written = new Set(docs.map((d) => iso(d.date)));
  // Not having written today yet is not a broken streak at lunchtime, so the count
  // may start at yesterday.
  let streak = 0;
  let cursor = Date.parse(todayIso + "T00:00:00Z");
  for (let step = 0; step < 3650; step++) {
    const key = iso(new Date(cursor));
    if (written.has(key)) streak++;
    else if (key !== todayIso) break;
    cursor -= 86_400_000;
  }

  const tagCounts = new Map<string, number>();
  const moodCounts: Record<string, number> = {};
  let words = 0;
  for (const doc of docs) {
    for (const tag of doc.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    if (doc.mood) moodCounts[doc.mood] = (moodCounts[doc.mood] ?? 0) + 1;
    words += wordCount(doc.body ?? "");
  }

  res.json({
    entries: docs.length,
    words,
    streak,
    firstDate: docs.length ? iso(docs[docs.length - 1].date) : null,
    lastDate: docs.length ? iso(docs[0].date) : null,
    tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count })),
    moods: moodCounts,
  });
});

/**
 * GET /journal/on-this-day?today=
 * The same date in earlier months and years. A journal nobody rereads is a write-only
 * file, and this is the cheapest way back into it.
 */
router.get("/on-this-day", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  const [, month, day] = todayIso.split("-");
  const docs = await JournalEntry.find({
    $expr: { $and: [{ $eq: [{ $month: "$date" }, Number(month)] }, { $eq: [{ $dayOfMonth: "$date" }, Number(day)] }] },
    date: { $lt: new Date(todayIso + "T00:00:00Z") },
  }).sort({ date: -1 });
  res.json(docs.map(shapeRow));
});

/** One day. Null rather than 404: an unwritten day is a normal answer here. */
router.get("/day", async (req, res) => {
  const date = parseDayUTC(req.query.date);
  if (!date) return res.status(400).json({ error: "a date is required" });
  const doc = await JournalEntry.findOne({ date });
  res.json(doc ? shape(doc) : null);
});

// =====================================================================
// PUT /journal/day
// One page per day, so writing is an upsert. Clearing the page deletes it rather
// than leaving an empty row that would count towards the streak.
// =====================================================================
router.put("/day", async (req, res) => {
  const date = parseDayUTC(req.body?.date);
  if (!date) return res.status(400).json({ error: "a date is required" });

  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 20000) : "";
  const mood = isMood(req.body?.mood) ? req.body.mood : null;
  if (req.body?.mood !== undefined && req.body?.mood !== null && req.body?.mood !== "" && !mood) {
    return res.status(400).json({ error: "that is not one of the moods" });
  }
  const tags = readTags(req.body?.tags);

  const existing = await JournalEntry.findOne({ date });
  if (body === "" && !mood && tags.length === 0) {
    if (existing) await JournalEntry.deleteOne({ _id: existing._id });
    return res.json(null);
  }

  const doc = existing ?? new JournalEntry({ date });
  doc.body = body;
  doc.mood = mood;
  doc.tags = tags;
  await doc.save();
  res.json(shape(doc));
});

router.delete("/day", async (req, res) => {
  const date = parseDayUTC(req.query.date);
  if (!date) return res.status(400).json({ error: "a date is required" });
  const doc = await JournalEntry.findOneAndDelete({ date });
  if (!doc) return res.status(404).json({ error: "nothing written that day" });
  res.json({ ok: true });
});

export default router;
