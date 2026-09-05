import type { ModuleKey } from "../models/Settings";

/**
 * What each module owns.
 *
 * Switching a module off has to remove it coherently: its pages, the dashboard rows
 * it feeds and the badges that score it. The client has the same table for nav and
 * routing; this one is the authority for anything the server decides.
 */
export const MODULE_ROWS: Record<ModuleKey, string[]> = {
  tasks: ["tasks"],
  journal: [],
  sleep: ["sleep"],
  calories: ["calories", "protein", "water"],
  foods: [],
  kitchen: [],
  workout: ["gym"],
  body: [],
  goals: [],
  income: ["work"],
  payments: [],
  badges: [],
};

export const MODULE_BADGE_GROUPS: Record<ModuleKey, string[]> = {
  tasks: ["tasks"],
  journal: ["journal"],
  sleep: ["sleep"],
  calories: ["calories", "protein", "water"],
  foods: [],
  kitchen: ["kitchen"],
  workout: ["workout"],
  body: ["body"],
  goals: ["goals"],
  income: ["income"],
  payments: ["payments"],
  badges: [],
};

/** Habit keys that belong to a module which is switched off. */
export function hiddenRowKeys(modules: Record<string, boolean>): Set<string> {
  const out = new Set<string>();
  for (const [key, rows] of Object.entries(MODULE_ROWS)) {
    if (modules[key] === false) for (const row of rows) out.add(row);
  }
  return out;
}

/** Badge groups that belong to a module which is switched off. */
export function hiddenBadgeGroups(modules: Record<string, boolean>): Set<string> {
  const out = new Set<string>();
  for (const [key, groups] of Object.entries(MODULE_BADGE_GROUPS)) {
    if (modules[key] === false) for (const group of groups) out.add(group);
  }
  return out;
}
