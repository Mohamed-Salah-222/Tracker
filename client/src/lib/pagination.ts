// Mirrors the envelope returned by the server's paged list endpoints
// (server/src/lib/pagination.ts). Keep PAGE_LIMIT in step with the server's
// DEFAULT_PAGE_LIMIT so an omitted param and an explicit one agree.
export const PAGE_LIMIT = 50;

// Dropdown pickers filter their options client-side, so they need the whole set
// rather than a page. This is the server's MAX_PAGE_LIMIT: high enough that no
// realistic library truncates, but an explicit bound instead of an open query.
// Callers compare items.length against total and warn the user if it ever trips.
export const PICKER_LIMIT = 500;

export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

// "1-50 of 213" / "3 of 3": the label next to a paged list.
export function pageRangeLabel(loaded: number, total: number, offset = 0): string {
  if (total === 0) return "0";
  if (loaded >= total && offset === 0) return `${total}`;
  return `${offset + 1}-${offset + loaded} of ${total}`;
}
