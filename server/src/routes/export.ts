import { Router } from "express";
import mongoose from "mongoose";
import { Settings } from "../models/Settings";

const router = Router();

/**
 * Every collection this app owns.
 *
 * Named explicitly rather than dumping the database: this Atlas cluster is shared
 * with another application, and an export that quietly included somebody else's
 * collections would be a leak dressed up as a backup.
 */
const OWNED = [
  "appsettings",
  "banks",
  "calorieentries",
  "cheatdays",
  "dashboardtrackers",
  "daystatuses",
  "earnedbadges",
  "exercisenotes",
  "expenses",
  "externalsources",
  "foods",
  "goalcheckpoints",
  "goals",
  "habitdefinitions",
  "incomeentries",
  "journalentries",
  "kitchenitems",
  "moneymovements",
  "objectives",
  "rates",
  "recipes",
  "setlogs",
  "shoppingitems",
  "sleepentries",
  "subscriptions",
  "tasks",
  "trackergoals",
  "usagedays",
  "waterentries",
  "weightentries",
  "weightgoals",
  "wishlistitems",
  "workoutdayplans",
  "workoutsessions",
  "workoutsettings",
];

// =====================================================================
// GET /export
//
// The whole thing as one JSON file. There was no way to get your data out of this
// app at all, which is a strange gap in something you are asked to feed every day.
//
// Deliberately not paginated and not streamed: the entire dataset is a few megabytes,
// and a backup that arrives in pieces is not a backup.
// =====================================================================
router.get("/", async (_req, res) => {
  const db = mongoose.connection.db;
  if (!db) return res.status(503).json({ error: "the database is not connected" });

  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const data: Record<string, unknown[]> = {};
  let documents = 0;

  for (const name of OWNED) {
    if (!present.has(name)) continue;
    const rows = await db.collection(name).find({}).toArray();
    data[name] = rows;
    documents += rows.length;
  }

  await Settings.updateOne({}, { $set: { lastExportAt: new Date() } }, { upsert: true });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="lifetracker-${stamp}.json"`);
  res.json({
    app: "LifeTracker",
    exportedAt: new Date().toISOString(),
    /** Bumped if the shape of this file ever changes, so an importer can tell. */
    formatVersion: 1,
    collections: Object.keys(data).length,
    documents,
    data,
  });
});

/** What an export would contain, without producing one. */
router.get("/summary", async (_req, res) => {
  const db = mongoose.connection.db;
  if (!db) return res.status(503).json({ error: "the database is not connected" });

  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const counts: { collection: string; documents: number }[] = [];
  for (const name of OWNED) {
    if (!present.has(name)) continue;
    counts.push({ collection: name, documents: await db.collection(name).countDocuments() });
  }
  res.json({
    collections: counts.filter((c) => c.documents > 0).sort((a, b) => b.documents - a.documents),
    documents: counts.reduce((total, c) => total + c.documents, 0),
  });
});

export default router;
