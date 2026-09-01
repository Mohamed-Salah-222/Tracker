import { MOODS, type Mood } from "../models/JournalEntry";

export const iso = (d: Date) => d.toISOString().slice(0, 10);

export const isMood = (v: unknown): v is Mood => typeof v === "string" && (MOODS as readonly string[]).includes(v);

/** Where a mood sits on a 1 to 5 scale, for averages and correlations. */
export function moodScore(mood: Mood | null | undefined): number | null {
  if (!mood) return null;
  return MOODS.indexOf(mood) + 1;
}

/**
 * Tags, cleaned up.
 *
 * Lowercased, stripped of a leading hash, deduplicated, and capped. Without this a
 * tag list is a place for the same word to appear four ways and match none of them.
 */
export function readTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").toLowerCase().slice(0, 24);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

/** First line, or the first stretch of words, for a list that shows one row per day. */
export function excerptOf(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}

export function wordCount(body: string): number {
  const flat = body.trim();
  return flat === "" ? 0 : flat.split(/\s+/).length;
}
