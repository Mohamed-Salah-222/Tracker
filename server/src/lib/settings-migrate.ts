import mongoose from "mongoose";
import { Settings } from "../models/Settings";

/**
 * Move this app's settings out of somebody else's collection.
 *
 * The Settings model was created without an explicit collection name, so Mongoose
 * pluralised it to "settings" and found a document that was already there: one this
 * codebase has no model, route or reference for, holding monthlyTargetUSD, usdToLE
 * and weekday and weekend targets. Every save since then has been adding this app's
 * fields onto that document.
 *
 * This is the fourth collision of its kind in this database, after "habits" and
 * "goals" twice. The rule those established applies here: take a dedicated name, and
 * leave the squatted document exactly as it was found.
 *
 * Runs once. It moves the fields this app added into the new collection, then removes
 * them from the old document, and never touches a field it did not write.
 */
const MINE = ["modules", "navOrder", "appearance", "week", "dashboard", "workout", "lastExportAt", "migratedLocal"] as const;

let done = false;

export async function rehomeSettings(): Promise<{ moved: boolean; cleaned: string[] }> {
  if (done) return { moved: false, cleaned: [] };
  done = true;

  const db = mongoose.connection.db;
  if (!db) return { moved: false, cleaned: [] };

  const names = new Set((await db.listCollections().toArray()).map((c) => c.name));
  if (!names.has("settings")) return { moved: false, cleaned: [] };

  const legacy = await db.collection("settings").findOne({});
  if (!legacy) return { moved: false, cleaned: [] };

  const carried = MINE.filter((key) => legacy[key] !== undefined);
  if (carried.length === 0) return { moved: false, cleaned: [] };

  // Only seed the new home if it is empty. A document that has already been written
  // there is newer than anything left behind in the old one.
  if ((await Settings.countDocuments()) === 0) {
    const seed: Record<string, unknown> = {};
    for (const key of carried) seed[key] = legacy[key];
    await Settings.create(seed);
  }

  // Give the other document back its own shape.
  const unset = Object.fromEntries(carried.map((key) => [key, ""]));
  await db.collection("settings").updateOne({ _id: legacy._id }, { $unset: unset });

  return { moved: true, cleaned: [...carried] };
}
