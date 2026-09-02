/**
 * The badge catalogue.
 *
 * A list in code rather than a collection: a badge is a rule plus some words, and both
 * of those are code. Only the earning of one is data.
 *
 * Every badge names a measure from lib/measures.ts and the number it wants. Adding one
 * is a row here; adding a whole new area is a measure there plus rows here.
 *
 * Three principles the whole list follows:
 *  - Nothing can be un-earned. Every measure is a lifetime figure, so a streak badge
 *    survives the streak that earned it. The record is of what you did.
 *  - Every threshold is reachable by doing the thing, never by opening the app. There
 *    is no badge for looking at a page.
 *  - The wording says what it took, in the second person, with no exclamation marks.
 */
export type BadgeGroup =
  | "usage"
  | "habits"
  | "tasks"
  | "journal"
  | "sleep"
  | "calories"
  | "protein"
  | "water"
  | "steps"
  | "workout"
  | "body"
  | "kitchen"
  | "goals"
  | "income"
  | "payments";

export type BadgeDef = {
  key: string;
  label: string;
  detail: string;
  /** A measure key from lib/measures.ts. */
  measure: string;
  threshold: number;
  group: BadgeGroup;
  /** How the number reads on a locked card: 12 of 30, or 12,000 of 50,000. */
  unit?: string;
};

export const GROUP_LABELS: Record<BadgeGroup, string> = {
  usage: "Showing up",
  habits: "The grid",
  tasks: "Tasks",
  journal: "Journal",
  sleep: "Sleep",
  calories: "Calories",
  protein: "Protein",
  water: "Water",
  steps: "Steps",
  workout: "Training",
  body: "Body",
  kitchen: "Food and kitchen",
  goals: "Goals",
  income: "Income",
  payments: "Money",
};

export const GROUP_ORDER: BadgeGroup[] = [
  "usage",
  "habits",
  "tasks",
  "journal",
  "sleep",
  "calories",
  "protein",
  "water",
  "steps",
  "workout",
  "body",
  "kitchen",
  "goals",
  "income",
  "payments",
];

/** A ladder of thresholds sharing one measure, so the common case is one line. */
function ladder(
  group: BadgeGroup,
  measure: string,
  steps: { at: number; label: string; detail: string }[],
  unit?: string,
): BadgeDef[] {
  return steps.map((step) => ({
    key: `${measure}-${step.at}`,
    label: step.label,
    detail: step.detail,
    measure,
    threshold: step.at,
    group,
    unit,
  }));
}

export const BADGES: BadgeDef[] = [
  // =====================================================================
  // Showing up. The habit behind every other habit.
  // =====================================================================
  ...ladder("usage", "streak", [
    { at: 7, label: "A week", detail: "Seven days in a row" },
    { at: 30, label: "A month", detail: "Thirty days in a row" },
    { at: 90, label: "Three months", detail: "Ninety days in a row" },
    { at: 180, label: "Six months", detail: "A hundred and eighty days in a row" },
    { at: 365, label: "A year", detail: "A full year without missing a day" },
    { at: 1095, label: "Three years", detail: "Three years without missing a day" },
    { at: 1825, label: "Five years", detail: "Five years without missing a day" },
  ], "days"),
  ...ladder("usage", "usageActions", [
    { at: 500, label: "Five hundred actions", detail: "Five hundred things logged, all told" },
    { at: 5000, label: "Five thousand actions", detail: "Five thousand things logged, all told" },
  ], "actions"),
  ...ladder("usage", "daysUsed", [
    { at: 30, label: "Thirty days", detail: "Thirty days logged, in a row or not" },
    { at: 100, label: "A hundred days", detail: "A hundred days logged" },
    { at: 365, label: "A year of days", detail: "Three hundred and sixty five days logged" },
    { at: 1000, label: "A thousand days", detail: "A thousand days logged" },
  ], "days"),

  // =====================================================================
  // The grid. A perfect day is every habit that could be judged, done.
  // =====================================================================
  ...ladder("habits", "perfectDays", [
    { at: 1, label: "A clean sheet", detail: "One day with every habit done" },
    { at: 10, label: "Ten clean days", detail: "Ten days with nothing missed" },
    { at: 50, label: "Fifty clean days", detail: "Fifty days with nothing missed" },
    { at: 150, label: "A hundred and fifty", detail: "A hundred and fifty perfect days" },
  ], "days"),
  ...ladder("habits", "perfectStreak", [
    { at: 3, label: "Three in a row", detail: "Three perfect days back to back" },
    { at: 7, label: "A perfect week", detail: "Seven perfect days back to back" },
    { at: 30, label: "A perfect month", detail: "Thirty perfect days back to back" },
  ], "days"),
  ...ladder("habits", "habitDaysDone", [
    { at: 100, label: "A hundred ticks", detail: "A hundred habit days completed" },
    { at: 1000, label: "A thousand ticks", detail: "A thousand habit days completed" },
    { at: 5000, label: "Five thousand", detail: "Five thousand habit days completed" },
  ], "ticks"),

  // =====================================================================
  // Tasks. The anchor task the app adds itself is never counted.
  // =====================================================================
  ...ladder("tasks", "tasksDone", [
    { at: 10, label: "Ten done", detail: "Ten tasks finished" },
    { at: 100, label: "A hundred done", detail: "A hundred tasks finished" },
    { at: 500, label: "Five hundred", detail: "Five hundred tasks finished" },
    { at: 2000, label: "Two thousand", detail: "Two thousand tasks finished" },
  ], "tasks"),
  ...ladder("tasks", "taskCleanDays", [
    { at: 5, label: "Inbox clear", detail: "Five days where everything planned got done" },
    { at: 30, label: "Thirty clear days", detail: "Thirty days where everything planned got done" },
    { at: 120, label: "A hundred and twenty", detail: "A hundred and twenty days finished clean" },
  ], "days"),
  ...ladder("tasks", "taskCleanStreak", [
    { at: 7, label: "A clear week", detail: "Seven days running with nothing left over" },
    { at: 21, label: "Three clear weeks", detail: "Twenty one days running with nothing left over" },
  ], "days"),

  // =====================================================================
  // Journal
  // =====================================================================
  ...ladder("journal", "journalEntries", [
    { at: 1, label: "First page", detail: "One day written down" },
    { at: 10, label: "Ten entries", detail: "Ten days written down" },
    { at: 50, label: "Fifty entries", detail: "Fifty days written down" },
    { at: 200, label: "Two hundred", detail: "Two hundred days written down" },
  ], "entries"),
  ...ladder("journal", "journalStreak", [
    { at: 7, label: "A week of writing", detail: "Seven days written in a row" },
    { at: 30, label: "A month of writing", detail: "Thirty days written in a row" },
    { at: 100, label: "A hundred days", detail: "A hundred days written in a row" },
  ], "days"),
  ...ladder("journal", "journalWords", [
    { at: 1000, label: "A thousand words", detail: "A thousand words written" },
    { at: 10000, label: "Ten thousand", detail: "Ten thousand words written" },
    { at: 50000, label: "A short book", detail: "Fifty thousand words written" },
  ], "words"),
  ...ladder("journal", "moodsLogged", [{ at: 30, label: "Taking the temperature", detail: "Thirty days with a mood recorded" }], "days"),
  ...ladder("journal", "journalTagged", [{ at: 25, label: "Filed properly", detail: "Twenty five entries with tags on them" }], "entries"),

  // =====================================================================
  // Sleep
  // =====================================================================
  ...ladder("sleep", "sleepNights", [
    { at: 7, label: "A week of nights", detail: "Seven nights logged" },
    { at: 30, label: "Thirty nights", detail: "Thirty nights logged" },
    { at: 120, label: "A hundred and twenty", detail: "A hundred and twenty nights logged" },
    { at: 365, label: "A year of nights", detail: "Three hundred and sixty five nights logged" },
  ], "nights"),
  ...ladder("sleep", "sleepInBandNights", [
    { at: 10, label: "Ten good nights", detail: "Ten nights inside your range" },
    { at: 50, label: "Fifty good nights", detail: "Fifty nights inside your range" },
    { at: 200, label: "Two hundred", detail: "Two hundred nights inside your range" },
  ], "nights"),
  ...ladder("sleep", "sleepInBandStreak", [
    { at: 7, label: "A settled week", detail: "Seven nights running inside your range" },
    { at: 30, label: "A settled month", detail: "Thirty nights running inside your range" },
  ], "nights"),
  ...ladder("sleep", "sleepLoggedStreak", [
    { at: 14, label: "A fortnight of nights", detail: "Fourteen nights logged without missing one" },
    { at: 60, label: "Two months of nights", detail: "Sixty nights logged without missing one" },
  ], "nights"),
  ...ladder("sleep", "sleepHours", [{ at: 1000, label: "A thousand hours", detail: "A thousand hours of sleep logged" }], "hours"),

  // =====================================================================
  // Calories
  // =====================================================================
  ...ladder("calories", "calorieDaysLogged", [
    { at: 7, label: "A week logged", detail: "Seven days of food written down" },
    { at: 30, label: "A month logged", detail: "Thirty days of food written down" },
    { at: 120, label: "Four months", detail: "A hundred and twenty days of food written down" },
    { at: 365, label: "A year logged", detail: "Three hundred and sixty five days of food written down" },
  ], "days"),
  ...ladder("calories", "calorieTargetDays", [
    { at: 10, label: "Ten on target", detail: "Ten days inside the calorie target" },
    { at: 50, label: "Fifty on target", detail: "Fifty days inside the calorie target" },
    { at: 200, label: "Two hundred", detail: "Two hundred days inside the calorie target" },
  ], "days"),
  ...ladder("calories", "calorieTargetStreak", [
    { at: 7, label: "A tight week", detail: "Seven days running inside the target" },
    { at: 21, label: "Three tight weeks", detail: "Twenty one days running inside the target" },
    { at: 60, label: "Two months", detail: "Sixty days running inside the target" },
  ], "days"),
  ...ladder("calories", "calorieEntries", [{ at: 1000, label: "A thousand meals", detail: "A thousand things logged" }], "entries"),

  // =====================================================================
  // Protein
  // =====================================================================
  ...ladder("protein", "proteinDays", [
    { at: 10, label: "Ten days hit", detail: "Ten days over the protein floor" },
    { at: 50, label: "Fifty days hit", detail: "Fifty days over the protein floor" },
    { at: 200, label: "Two hundred", detail: "Two hundred days over the protein floor" },
  ], "days"),
  ...ladder("protein", "proteinStreak", [
    { at: 7, label: "A week of protein", detail: "Seven days running over the floor" },
    { at: 30, label: "A month of protein", detail: "Thirty days running over the floor" },
  ], "days"),
  ...ladder("protein", "proteinKg", [
    { at: 10, label: "Ten kilos", detail: "Ten kilograms of protein eaten" },
    { at: 50, label: "Fifty kilos", detail: "Fifty kilograms of protein eaten" },
  ], "kg"),

  // =====================================================================
  // Water
  // =====================================================================
  ...ladder("water", "waterDays", [
    { at: 10, label: "Ten days hydrated", detail: "Ten days hitting the water target" },
    { at: 50, label: "Fifty days", detail: "Fifty days hitting the water target" },
    { at: 200, label: "Two hundred", detail: "Two hundred days hitting the water target" },
  ], "days"),
  ...ladder("water", "waterStreak", [
    { at: 7, label: "A week hydrated", detail: "Seven days running on target" },
    { at: 30, label: "A month hydrated", detail: "Thirty days running on target" },
  ], "days"),
  ...ladder("water", "waterLitres", [
    { at: 100, label: "A hundred litres", detail: "A hundred litres drunk" },
    { at: 500, label: "Five hundred", detail: "Five hundred litres drunk" },
    { at: 1500, label: "A bathtub a year", detail: "Fifteen hundred litres drunk" },
  ], "litres"),

  // =====================================================================
  // Steps
  // =====================================================================
  ...ladder("steps", "stepsTargetDays", [
    { at: 10, label: "Ten days walked", detail: "Ten days hitting the step target" },
    { at: 50, label: "Fifty days walked", detail: "Fifty days hitting the step target" },
    { at: 200, label: "Two hundred", detail: "Two hundred days hitting the step target" },
  ], "days"),
  ...ladder("steps", "stepsTargetStreak", [
    { at: 7, label: "A week on foot", detail: "Seven days running on target" },
    { at: 30, label: "A month on foot", detail: "Thirty days running on target" },
  ], "days"),
  ...ladder("steps", "stepsTotal", [
    { at: 100000, label: "A hundred thousand", detail: "A hundred thousand steps" },
    { at: 1000000, label: "A million steps", detail: "One million steps" },
    { at: 5000000, label: "Five million", detail: "Five million steps" },
  ], "steps"),
  ...ladder("steps", "stepsBestDay", [{ at: 20000, label: "Twenty in a day", detail: "Twenty thousand steps in one day" }], "steps"),

  // =====================================================================
  // Training
  // =====================================================================
  ...ladder("workout", "workoutSessions", [
    { at: 1, label: "First session", detail: "One session finished" },
    { at: 10, label: "Ten sessions", detail: "Ten sessions finished" },
    { at: 50, label: "Fifty sessions", detail: "Fifty sessions finished" },
    { at: 150, label: "A hundred and fifty", detail: "A hundred and fifty sessions finished" },
    { at: 500, label: "Five hundred", detail: "Five hundred sessions finished" },
  ], "sessions"),
  ...ladder("workout", "workoutSets", [
    { at: 100, label: "A hundred sets", detail: "A hundred sets logged" },
    { at: 1000, label: "A thousand sets", detail: "A thousand sets logged" },
    { at: 5000, label: "Five thousand", detail: "Five thousand sets logged" },
  ], "sets"),
  ...ladder("workout", "workoutVolume", [
    { at: 50000, label: "Fifty tonnes", detail: "Fifty thousand kilograms moved" },
    { at: 500000, label: "Five hundred tonnes", detail: "Half a million kilograms moved" },
    { at: 2000000, label: "Two million", detail: "Two million kilograms moved" },
  ], "kg"),
  ...ladder("workout", "workoutWeeks", [
    { at: 10, label: "Ten weeks training", detail: "Ten different weeks with a session in them" },
    { at: 52, label: "A year of weeks", detail: "Fifty two weeks with a session in them" },
  ], "weeks"),
  ...ladder("workout", "workoutBestWeek", [{ at: 5, label: "Five in a week", detail: "Five sessions inside one week" }], "sessions"),

  // =====================================================================
  // Body
  // =====================================================================
  ...ladder("body", "bodyReadings", [
    { at: 1, label: "On the scale", detail: "One reading recorded" },
    { at: 10, label: "Ten readings", detail: "Ten readings recorded" },
    { at: 50, label: "Fifty readings", detail: "Fifty readings recorded" },
  ], "readings"),
  ...ladder("body", "bodyMeasureKinds", [
    { at: 3, label: "More than weight", detail: "Three different measurements recorded" },
    { at: 6, label: "The full picture", detail: "Six different measurements recorded" },
  ], "kinds"),

  // =====================================================================
  // Food and kitchen
  // =====================================================================
  ...ladder("kitchen", "foodsCreated", [
    { at: 10, label: "A small pantry", detail: "Ten foods in the catalogue" },
    { at: 50, label: "A real pantry", detail: "Fifty foods in the catalogue" },
    { at: 150, label: "Everything you eat", detail: "A hundred and fifty foods in the catalogue" },
  ], "foods"),
  ...ladder("kitchen", "recipesCreated", [
    { at: 1, label: "First recipe", detail: "One recipe saved" },
    { at: 10, label: "Ten recipes", detail: "Ten recipes saved" },
  ], "recipes"),
  ...ladder("kitchen", "kitchenItems", [
    { at: 10, label: "Stocked", detail: "Ten things tracked in the kitchen" },
    { at: 25, label: "Well stocked", detail: "Twenty five things tracked in the kitchen" },
  ], "items"),
  ...ladder("kitchen", "shoppingCleared", [
    { at: 25, label: "Twenty five bought", detail: "Twenty five things ticked off the list" },
    { at: 200, label: "Two hundred", detail: "Two hundred things ticked off the list" },
  ], "items"),

  // =====================================================================
  // Goals
  // =====================================================================
  ...ladder("goals", "goalsCompleted", [
    { at: 1, label: "First goal", detail: "One goal finished" },
    { at: 5, label: "Five goals", detail: "Five goals finished" },
    { at: 20, label: "Twenty goals", detail: "Twenty goals finished" },
  ], "goals"),
  ...ladder("goals", "checkpointComments", [{ at: 25, label: "Thinking out loud", detail: "Twenty five comments on your own checkpoints" }], "comments"),
  ...ladder("goals", "checkpointsLogged", [
    { at: 10, label: "Ten checkpoints", detail: "Ten checkpoints on the timeline" },
    { at: 100, label: "A hundred", detail: "A hundred checkpoints on the timeline" },
  ], "checkpoints"),

  // =====================================================================
  // Income
  // =====================================================================
  ...ladder("income", "incomeDays", [
    { at: 10, label: "Ten paid days", detail: "Ten days with earnings logged" },
    { at: 50, label: "Fifty paid days", detail: "Fifty days with earnings logged" },
    { at: 200, label: "Two hundred", detail: "Two hundred days with earnings logged" },
  ], "days"),
  ...ladder("income", "incomeTotal", [
    { at: 1000, label: "First thousand", detail: "A thousand earned and written down" },
    { at: 10000, label: "Ten thousand", detail: "Ten thousand earned and written down" },
    { at: 50000, label: "Fifty thousand", detail: "Fifty thousand earned and written down" },
  ], "earned"),
  ...ladder("income", "incomeHours", [
    { at: 100, label: "A hundred hours", detail: "A hundred hours of work logged" },
    { at: 500, label: "Five hundred", detail: "Five hundred hours of work logged" },
    { at: 2000, label: "Two thousand", detail: "Two thousand hours of work logged" },
  ], "hours"),

  // =====================================================================
  // Money
  // =====================================================================
  ...ladder("payments", "expensesLogged", [
    { at: 25, label: "Twenty five logged", detail: "Twenty five expenses recorded" },
    { at: 200, label: "Two hundred", detail: "Two hundred expenses recorded" },
    { at: 1000, label: "A thousand", detail: "A thousand expenses recorded" },
  ], "expenses"),
  ...ladder("payments", "movementsLogged", [
    { at: 50, label: "Fifty movements", detail: "Fifty transfers or adjustments recorded" },
    { at: 250, label: "Two hundred and fifty", detail: "Two hundred and fifty movements recorded" },
  ], "movements"),
  ...ladder("payments", "moneyMonths", [
    { at: 3, label: "A quarter tracked", detail: "Three months with money recorded" },
    { at: 12, label: "A year tracked", detail: "Twelve months with money recorded" },
  ], "months"),
  ...ladder("payments", "subscriptionsSettled", [{ at: 1, label: "Paid on time", detail: "A subscription settled through the app" }], "subscriptions"),
];

export const badgeBy = (key: string) => BADGES.find((b) => b.key === key);

/** Which badges the current numbers have reached. */
export function qualifyingBadges(values: Record<string, number>): BadgeDef[] {
  return BADGES.filter((badge) => (values[badge.measure] ?? 0) >= badge.threshold);
}

/** The next one to aim for on a measure, so a locked group can still say what is close. */
export function nextBadge(measure: string, value: number): BadgeDef | null {
  return BADGES.filter((b) => b.measure === measure && b.threshold > value).sort((a, b) => a.threshold - b.threshold)[0] ?? null;
}
