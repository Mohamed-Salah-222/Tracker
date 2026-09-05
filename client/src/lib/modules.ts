import type { ModuleKey } from "./settings";

/**
 * What each module is, and what switching it off removes.
 *
 * The point of the switchboard is that off means gone, coherently: not a hidden nav
 * link with its dashboard rows still sitting there. So a module owns its pages, the
 * habit rows it feeds, and the badge group that scores it, and all of them go together.
 *
 * Nothing is deleted. Everything comes back exactly as it was when the switch goes on.
 */
export type ModuleDef = {
  key: ModuleKey;
  label: string;
  blurb: string;
  /** Routes that belong to it. The first is where the nav points. */
  routes: string[];
  /** Dashboard habit rows fed by it, by habit key. */
  rows: string[];
  /** Badge groups scored by it. */
  badgeGroups: string[];
  /** Always available, whatever the preset. The app is not an app without these. */
  core?: boolean;
};

export const MODULES: ModuleDef[] = [
  { key: "tasks", label: "Tasks", blurb: "A list per day, and the month calendar behind it.", routes: ["/tasks"], rows: ["tasks"], badgeGroups: ["tasks"] },
  { key: "journal", label: "Journal", blurb: "A page a day in your own words, with moods and tags.", routes: ["/journal"], rows: [], badgeGroups: ["journal"] },
  { key: "sleep", label: "Sleep", blurb: "Bed and wake times on Today, and the sleep row on the grid.", routes: [], rows: ["sleep"], badgeGroups: ["sleep"] },
  {
    key: "calories",
    label: "Calories and water",
    blurb: "What you ate and drank, with the calorie, protein and water rows.",
    routes: ["/calories"],
    rows: ["calories", "protein", "water"],
    badgeGroups: ["calories", "protein", "water"],
  },
  { key: "foods", label: "Foods", blurb: "The food catalogue and recipes that calorie logging draws on.", routes: ["/foods"], rows: [], badgeGroups: [] },
  { key: "kitchen", label: "Kitchen", blurb: "What is on the shelf and what needs buying.", routes: ["/kitchen"], rows: [], badgeGroups: ["kitchen"] },
  { key: "workout", label: "Workout", blurb: "Sessions, sets and the training row on the grid.", routes: ["/workout"], rows: ["gym"], badgeGroups: ["workout"] },
  { key: "body", label: "Body", blurb: "Weight, body composition and tape measurements.", routes: [], rows: [], badgeGroups: ["body"] },
  { key: "goals", label: "Goals", blurb: "Longer term goals with their own timelines.", routes: ["/goals"], rows: [], badgeGroups: ["goals"] },
  { key: "income", label: "Income", blurb: "Hours worked and what they earned, and the work row.", routes: ["/income"], rows: ["work"], badgeGroups: ["income"] },
  { key: "payments", label: "Payments", blurb: "Accounts, expenses, movements and subscriptions.", routes: ["/payments"], rows: [], badgeGroups: ["payments"] },
  { key: "badges", label: "Badges", blurb: "The streak and everything it earns.", routes: ["/badges"], rows: [], badgeGroups: [] },
];

export const moduleBy = (key: ModuleKey) => MODULES.find((m) => m.key === key);

/** Which module owns a route, if any. Used to keep a disabled page out of reach. */
export function moduleForRoute(pathname: string): ModuleDef | undefined {
  return MODULES.find((m) => m.routes.some((route) => pathname === route || pathname.startsWith(route + "/")));
}

/** The pages that are always there: the dashboard, today, habits and settings. */
export const CORE_ROUTES = ["/", "/today", "/habits", "/settings"];
