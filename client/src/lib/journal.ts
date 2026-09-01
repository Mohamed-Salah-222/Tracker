import { AxiosError } from "axios";
import { api } from "./api";

export const MOODS = ["awful", "low", "fine", "good", "great"] as const;
export type Mood = (typeof MOODS)[number];

export type JournalEntry = {
  _id: string;
  date: string;
  body: string;
  mood: Mood | null;
  tags: string[];
  words: number;
  updatedAt: string | null;
};

export type JournalRow = JournalEntry & { excerpt: string };

export type JournalStats = {
  entries: number;
  words: number;
  streak: number;
  firstDate: string | null;
  lastDate: string | null;
  tags: { tag: string; count: number }[];
  moods: Record<string, number>;
};

export function journalError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function loadDay(date: string): Promise<JournalEntry | null> {
  const r = await api.get<JournalEntry | null>("/journal/day", { params: { date } });
  return r.data;
}

export async function saveDay(body: { date: string; body: string; mood: Mood | null; tags: string[] }): Promise<JournalEntry | null> {
  const r = await api.put<JournalEntry | null>("/journal/day", body);
  return r.data;
}

export async function listEntries(params: Record<string, string | number>): Promise<{ items: JournalRow[]; total: number }> {
  const r = await api.get<{ items: JournalRow[]; total: number }>("/journal", { params });
  return r.data;
}

export async function loadStats(today: string): Promise<JournalStats> {
  const r = await api.get<JournalStats>("/journal/stats", { params: { today } });
  return r.data;
}

export async function loadOnThisDay(today: string): Promise<JournalRow[]> {
  const r = await api.get<JournalRow[]>("/journal/on-this-day", { params: { today } });
  return r.data;
}

/** "#gym #work" typed in a box, turned into the array the API stores. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\s]+/)) {
    const tag = raw.trim().replace(/^#/, "").toLowerCase().slice(0, 24);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

export const tagsToInput = (tags: string[]) => tags.map((t) => `#${t}`).join(" ");
