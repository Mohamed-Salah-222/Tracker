import { HttpError } from "./validation";

// Every list endpoint takes ?limit= and ?offset= and answers with the same
// envelope, so the client can render "X of Y" without per-endpoint special cases.
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 500;

export type PageParams = { limit: number; offset: number };
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

function parseIntParam(raw: unknown, name: string): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  // Reject arrays from repeated query params (?limit=1&limit=2) and anything non-numeric.
  if (typeof raw !== "string") throw new HttpError(400, `invalid ${name}`);
  if (!/^\d+$/.test(raw.trim())) throw new HttpError(400, `${name} must be a non-negative integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new HttpError(400, `invalid ${name}`);
  return value;
}

// Throws HttpError(400) on malformed input; the handler in index.ts turns that
// into { error } rather than letting a NaN reach Mongoose as a skip/limit.
export function parsePageParams(
  query: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): PageParams {
  const defaultLimit = options.defaultLimit ?? DEFAULT_PAGE_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_PAGE_LIMIT;

  const rawLimit = parseIntParam(query.limit, "limit");
  const rawOffset = parseIntParam(query.offset, "offset");

  if (rawLimit !== null && rawLimit < 1) {
    throw new HttpError(400, "limit must be at least 1");
  }
  if (rawLimit !== null && rawLimit > maxLimit) {
    throw new HttpError(400, `limit must be at most ${maxLimit}`);
  }

  return { limit: rawLimit ?? defaultLimit, offset: rawOffset ?? 0 };
}

export function pageOf<T>(items: T[], total: number, params: PageParams): Page<T> {
  return { items, total, limit: params.limit, offset: params.offset };
}
