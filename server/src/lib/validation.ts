import type { RequestParamHandler } from "express";
import { toDayUTC } from "./dates";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const MAX_SEARCH_LENGTH = 100;

// Thrown by route code that wants a specific status; the error handler in index.ts reads .status.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
}

// Express router.param handler: rejects any :id-style param that isn't an ObjectId,
// so Mongoose never gets a chance to throw a CastError on it.
export const objectIdParam: RequestParamHandler = (_req, res, next, value, name) => {
  if (!isObjectId(value)) {
    return res.status(400).json({ error: `invalid ${name}` });
  }
  next();
};

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Escape user input before it is used as a $regex, so specials stay literal
// and no user-supplied pattern can trigger catastrophic backtracking.
export function escapeRegex(input: string): string {
  return input.replace(REGEX_SPECIALS, "\\$&");
}

// Safe case-insensitive "contains" filter from a user-supplied search string.
export function buildSearchFilter(input: unknown) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!trimmed) return null;
  return { $regex: escapeRegex(trimmed), $options: "i" };
}

// Non-empty trimmed string, or null.
export function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// UTC-midnight Date for a valid date input, or null for anything unparseable.
export function parseDayUTC(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDayUTC(value);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  // Parse first so nonsense ("2026-02-30", "hello") is rejected, but normalize the
  // original string — toDayUTC reads the calendar day the sender wrote, which a
  // Date instance can no longer report.
  if (Number.isNaN(new Date(value).getTime())) return null;
  return toDayUTC(value);
}
