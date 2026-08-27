// =====================================================================
// Workout splits catalogue.
//
// Three layers, so no exercise or day is ever written twice:
//   MOVEMENTS      id -> display name. Stable: SetLog.exerciseId references these,
//                  so a name may change but an id never may.
//   DAY_TEMPLATES  a named training day (push, legs, chest+back…) and its slots.
//   SPLITS         an ordered weekly cycle of day-template keys, "rest" included so
//                  the cycle length is explicit.
// =====================================================================

export const REST = "rest";

export const MOVEMENTS: Record<string, string> = {
  // ---- Chest ----
  "chest-press": "Machine Chest Press",
  "flat-bar-chest-press": "Flat Bar Chest Press",
  "incline-db-press": "Incline Dumbbell Press",
  "bench-press": "Barbell Bench Press",
  "chest-fly": "Chest Fly",
  "cable-crossover": "Cable Crossover",
  "dips": "Chest Dips",
  "push-up": "Push-Up",
  "decline-press": "Decline Press",

  // ---- Back ----
  "lat-pulldown": "Lat Pulldown",
  "pull-up": "Pull-Up",
  "chin-up": "Chin-Up",
  "barbell-row": "Barbell Row",
  "seated-cable-row": "Seated Cable Row",
  "db-row": "Dumbbell Row",
  "straight-arm-pulldown": "Straight-Arm Pulldown",
  "t-bar-row": "T-Bar Row",
  "inverted-row": "Inverted Row",
  "shrug": "Barbell Shrug",
  "back-extension": "Back Extension",

  // ---- Shoulders ----
  "shoulder-press": "Shoulder Press",
  "db-shoulder-press": "Dumbbell Shoulder Press",
  "overhead-press": "Barbell Overhead Press",
  "lateral-raise": "Lateral Raise",
  "cable-lateral-raise": "Cable Lateral Raise",
  "rear-delt-fly": "Rear Delt Fly",
  "face-pull": "Face Pull",
  "pike-push-up": "Pike Push-Up",
  "handstand-hold": "Handstand Hold",

  // ---- Arms ----
  "bicep-curl": "Cable Bicep Curl",
  "barbell-curl": "Barbell Curl",
  "hammer-curl": "Hammer Curl",
  "preacher-curl": "Preacher Curl",
  "triceps-pushdown": "Cable Tricep Pushdown",
  "overhead-triceps": "Overhead Triceps Extension",
  "skull-crusher": "Skull Crusher",
  "close-grip-bench": "Close-Grip Bench Press",
  "wrist-curl": "Wrist Curl",

  // ---- Legs ----
  "leg-press": "Leg Press Machine",
  "hack-squat": "Hack Squats",
  "back-squat": "Barbell Back Squat",
  "front-squat": "Front Squat",
  "goblet-squat": "Goblet Squat",
  "leg-extension": "Leg Extension",
  "seated-leg-curl": "Seated Leg Curl",
  "lying-leg-curl": "Lying Leg Curl",
  "romanian-deadlift": "Romanian Deadlift",
  "deadlift": "Conventional Deadlift",
  "hip-thrust": "Hip Thrust",
  "bulgarian-split-squat": "Bulgarian Split Squat",
  "walking-lunge": "Walking Lunge",
  "calf-raise": "Standing Calf Raise",
  "seated-calf-raise": "Seated Calf Raise",
  "pistol-squat": "Pistol Squat Progression",
  "nordic-curl": "Nordic Curl",
  "good-morning": "Good Morning",
  "box-jump": "Box Jump",

  // ---- Core ----
  "plank": "Plank",
  "hanging-leg-raise": "Hanging Leg Raise",
  "cable-crunch": "Cable Crunch",
  "ab-wheel": "Ab Wheel Rollout",

  // ---- Olympic / power ----
  "power-clean": "Power Clean",
  "speed-squat": "Speed Squat",
  "speed-bench": "Speed Bench Press",
  "board-press": "Board Press",
  "rack-pull": "Rack Pull",

  // ---- Cardio ----
  "zone2-run": "Zone 2 Run",
  "intervals": "HIIT Intervals",
  "long-cardio": "Long Cardio",
};

/**
 * `reps` is the top of the working range and `repsMin` the bottom. Double
 * progression lives on that range: start at the bottom, add a rep each session, and
 * once every set reaches the top the load goes up and the reps reset. A slot with no
 * `repsMin` is a fixed prescription (strength templates, timed holds).
 */
export type Slot = { id: string; sets: number; reps: number; repsMin?: number };

export type DayTemplate = {
  key: string;
  label: string;
  /** Muscle groups this day is aimed at, shown under the title. */
  focus: string;
  slots: Slot[];
};

const s = (id: string, sets: number, reps: number, repsMin?: number): Slot => (repsMin === undefined ? { id, sets, reps } : { id, sets, reps, repsMin });

export const DAY_TEMPLATES: Record<string, DayTemplate> = {
  [REST]: { key: REST, label: "Rest day", focus: "Recover", slots: [] },

  // ---- Upper / Lower. Mohamed's own programme: heavy, low volume, 3 sets of 6-8.
  // Start a movement at 6 reps, add a rep each session, and once all three sets hit
  // 8 the weight goes up and the reps drop back to 6.
  upper: {
    key: "upper",
    label: "Upper",
    focus: "Chest, back, shoulders, arms. Heavy 6-8",
    slots: [s("chest-press", 3, 8, 6), s("flat-bar-chest-press", 3, 8, 6), s("chest-fly", 3, 8, 6), s("shoulder-press", 3, 8, 6), s("lat-pulldown", 3, 8, 6), s("bicep-curl", 3, 8, 6), s("triceps-pushdown", 3, 8, 6)],
  },
  lower: {
    key: "lower",
    label: "Lower",
    focus: "Quads, hamstrings, glutes. Heavy 6-8",
    slots: [s("leg-press", 3, 8, 6), s("hack-squat", 3, 8, 6), s("leg-extension", 3, 8, 6), s("seated-leg-curl", 3, 8, 6), s("romanian-deadlift", 3, 8, 6)],
  },
  upperB: {
    key: "upperB",
    label: "Upper B",
    focus: "Chest, back, shoulders, arms",
    slots: [s("incline-db-press", 4, 8, 6), s("barbell-row", 4, 8, 6), s("db-shoulder-press", 3, 10, 6), s("pull-up", 3, 8, 6), s("cable-crossover", 3, 12, 8), s("hammer-curl", 3, 12, 8), s("overhead-triceps", 3, 12, 8)],
  },
  lowerB: {
    key: "lowerB",
    label: "Lower B",
    focus: "Hinge, glutes, calves",
    slots: [s("deadlift", 4, 5), s("front-squat", 3, 8, 6), s("hip-thrust", 3, 10, 6), s("lying-leg-curl", 3, 12, 8), s("seated-calf-raise", 4, 15, 11), s("hanging-leg-raise", 3, 12, 8)],
  },

  // ---- Push / Pull / Legs ----
  push: {
    key: "push",
    label: "Push",
    focus: "Chest, front & side delts, triceps",
    slots: [s("bench-press", 4, 6), s("db-shoulder-press", 3, 10, 6), s("incline-db-press", 3, 10, 6), s("lateral-raise", 3, 15, 11), s("triceps-pushdown", 3, 12, 8), s("overhead-triceps", 3, 12, 8)],
  },
  pushB: {
    key: "pushB",
    label: "Push B",
    focus: "Chest, delts, triceps",
    slots: [s("overhead-press", 4, 6), s("chest-press", 3, 10, 6), s("cable-crossover", 3, 12, 8), s("cable-lateral-raise", 3, 15, 11), s("dips", 3, 10, 6), s("skull-crusher", 3, 12, 8)],
  },
  pull: {
    key: "pull",
    label: "Pull",
    focus: "Back, rear delts, biceps, forearms",
    slots: [s("pull-up", 4, 8, 6), s("barbell-row", 4, 8, 6), s("seated-cable-row", 3, 12, 8), s("face-pull", 3, 15, 11), s("barbell-curl", 3, 10, 6), s("hammer-curl", 3, 12, 8)],
  },
  pullB: {
    key: "pullB",
    label: "Pull B",
    focus: "Back, rear delts, biceps",
    slots: [s("lat-pulldown", 4, 10, 6), s("t-bar-row", 4, 8, 6), s("straight-arm-pulldown", 3, 12, 8), s("rear-delt-fly", 3, 15, 11), s("preacher-curl", 3, 10, 6), s("wrist-curl", 3, 15, 11)],
  },
  legs: {
    key: "legs",
    label: "Legs",
    focus: "Quads, hamstrings, glutes, calves, core",
    slots: [s("back-squat", 4, 6), s("romanian-deadlift", 3, 8, 6), s("leg-press", 3, 12, 8), s("lying-leg-curl", 3, 12, 8), s("calf-raise", 4, 15, 11), s("plank", 3, 45)],
  },
  legsB: {
    key: "legsB",
    label: "Legs B",
    focus: "Hinge focus, glutes, calves",
    slots: [s("deadlift", 4, 5), s("bulgarian-split-squat", 3, 10, 6), s("leg-extension", 3, 15, 11), s("nordic-curl", 3, 8, 6), s("seated-calf-raise", 4, 15, 11), s("cable-crunch", 3, 15, 11)],
  },

  // ---- Full body ----
  fullBodyA: {
    key: "fullBodyA",
    label: "Full Body A",
    focus: "Squat focus, all major groups",
    slots: [s("back-squat", 3, 8, 6), s("bench-press", 3, 8, 6), s("barbell-row", 3, 10, 6), s("db-shoulder-press", 3, 10, 6), s("lying-leg-curl", 3, 12, 8), s("bicep-curl", 2, 12, 8), s("plank", 3, 45)],
  },
  fullBodyB: {
    key: "fullBodyB",
    label: "Full Body B",
    focus: "Hinge focus, all major groups",
    slots: [s("deadlift", 3, 5), s("incline-db-press", 3, 10, 6), s("lat-pulldown", 3, 12, 8), s("walking-lunge", 3, 12, 8), s("lateral-raise", 3, 15, 11), s("triceps-pushdown", 2, 12, 8), s("hanging-leg-raise", 3, 12, 8)],
  },
  fullBodyC: {
    key: "fullBodyC",
    label: "Full Body C",
    focus: "Machine & accessory emphasis",
    slots: [s("leg-press", 3, 12, 8), s("chest-press", 3, 10, 6), s("seated-cable-row", 3, 12, 8), s("overhead-press", 3, 8, 6), s("leg-extension", 3, 15, 11), s("hammer-curl", 2, 12, 8), s("cable-crunch", 3, 15, 11)],
  },

  // ---- Body-part (bro) split ----
  chest: {
    key: "chest",
    label: "Chest",
    focus: "Chest + abs",
    slots: [s("bench-press", 4, 8, 6), s("incline-db-press", 4, 10, 6), s("cable-crossover", 3, 12, 8), s("dips", 3, 10, 6), s("hanging-leg-raise", 3, 12, 8)],
  },
  back: {
    key: "back",
    label: "Back",
    focus: "Lats, traps, rhomboids",
    slots: [s("pull-up", 4, 8, 6), s("barbell-row", 4, 8, 6), s("lat-pulldown", 3, 12, 8), s("seated-cable-row", 3, 12, 8), s("shrug", 3, 15, 11), s("back-extension", 3, 12, 8)],
  },
  shoulders: {
    key: "shoulders",
    label: "Shoulders",
    focus: "Delts, traps, abs",
    slots: [s("overhead-press", 4, 8, 6), s("lateral-raise", 4, 15, 11), s("rear-delt-fly", 3, 15, 11), s("face-pull", 3, 15, 11), s("shrug", 3, 12, 8), s("cable-crunch", 3, 15, 11)],
  },
  arms: {
    key: "arms",
    label: "Arms",
    focus: "Biceps, triceps, forearms",
    slots: [s("barbell-curl", 4, 10, 6), s("close-grip-bench", 4, 8, 6), s("hammer-curl", 3, 12, 8), s("skull-crusher", 3, 12, 8), s("preacher-curl", 3, 12, 8), s("wrist-curl", 3, 15, 11)],
  },
  weakPoint: {
    key: "weakPoint",
    label: "Weak Points",
    focus: "Abs, calves, whatever lags",
    slots: [s("cable-lateral-raise", 3, 15, 11), s("rear-delt-fly", 3, 15, 11), s("calf-raise", 4, 15, 11), s("ab-wheel", 3, 12, 8), s("wrist-curl", 3, 15, 11)],
  },

  // ---- Antagonist pairing (Arnold) ----
  // Arnold superset chest against back: press, then immediately row.
  chestBack: {
    key: "chestBack",
    label: "Chest + Back",
    focus: "Chest supersetted against back",
    slots: [s("bench-press", 4, 8, 6), s("barbell-row", 4, 8, 6), s("incline-db-press", 3, 10, 6), s("lat-pulldown", 3, 12, 8), s("chest-fly", 3, 12, 8), s("deadlift", 3, 6)],
  },
  shouldersArms: {
    key: "shouldersArms",
    label: "Shoulders + Arms",
    focus: "Delts, biceps, triceps",
    slots: [s("overhead-press", 4, 8, 6), s("lateral-raise", 3, 15, 11), s("rear-delt-fly", 3, 15, 11), s("barbell-curl", 3, 10, 6), s("skull-crusher", 3, 12, 8), s("hammer-curl", 3, 12, 8)],
  },
  // Arnold's leg day: squats or leg press first, then lunges, curls and calves.
  legsLowerBack: {
    key: "legsLowerBack",
    label: "Legs + Lower Back",
    focus: "Quads, hams, glutes, erectors",
    slots: [s("back-squat", 4, 8, 6), s("leg-press", 3, 12, 8), s("walking-lunge", 3, 12, 8), s("lying-leg-curl", 3, 12, 8), s("back-extension", 3, 15, 11), s("calf-raise", 4, 15, 11)],
  },

  // ---- Chains ----
  anterior: {
    key: "anterior",
    label: "Anterior Chain",
    focus: "Chest, front & side delts, triceps, quads, abs",
    slots: [s("bench-press", 4, 8, 6), s("back-squat", 4, 8, 6), s("db-shoulder-press", 3, 10, 6), s("leg-extension", 3, 15, 11), s("triceps-pushdown", 3, 12, 8), s("cable-crunch", 3, 15, 11)],
  },
  anteriorB: {
    key: "anteriorB",
    label: "Anterior Chain B",
    focus: "Chest, delts, quads, abs",
    slots: [s("incline-db-press", 4, 10, 6), s("front-squat", 3, 8, 6), s("lateral-raise", 3, 15, 11), s("walking-lunge", 3, 12, 8), s("close-grip-bench", 3, 10, 6), s("ab-wheel", 3, 12, 8)],
  },
  posterior: {
    key: "posterior",
    label: "Posterior Chain",
    focus: "Back, rear delts, biceps, hams, glutes, erectors",
    slots: [s("deadlift", 4, 5), s("pull-up", 4, 8, 6), s("romanian-deadlift", 3, 10, 6), s("face-pull", 3, 15, 11), s("barbell-curl", 3, 10, 6), s("back-extension", 3, 15, 11)],
  },
  posteriorB: {
    key: "posteriorB",
    label: "Posterior Chain B",
    focus: "Back, hams, glutes, traps",
    slots: [s("barbell-row", 4, 8, 6), s("hip-thrust", 4, 10, 6), s("lat-pulldown", 3, 12, 8), s("nordic-curl", 3, 8, 6), s("shrug", 3, 15, 11), s("rear-delt-fly", 3, 15, 11)],
  },

  // ---- Torso / Limbs ----
  torso: {
    key: "torso",
    label: "Torso",
    focus: "Chest, back, shoulders, abs",
    slots: [s("bench-press", 4, 8, 6), s("barbell-row", 4, 8, 6), s("overhead-press", 3, 10, 6), s("lat-pulldown", 3, 12, 8), s("rear-delt-fly", 3, 15, 11), s("plank", 3, 45)],
  },
  torsoB: {
    key: "torsoB",
    label: "Torso B",
    focus: "Chest, back, shoulders, abs",
    slots: [s("incline-db-press", 4, 10, 6), s("seated-cable-row", 4, 10, 6), s("db-shoulder-press", 3, 10, 6), s("straight-arm-pulldown", 3, 12, 8), s("face-pull", 3, 15, 11), s("cable-crunch", 3, 15, 11)],
  },
  limbs: {
    key: "limbs",
    label: "Limbs",
    focus: "Quads, hams, glutes, calves, arms",
    slots: [s("back-squat", 4, 8, 6), s("romanian-deadlift", 3, 10, 6), s("leg-extension", 3, 15, 11), s("barbell-curl", 3, 12, 8), s("triceps-pushdown", 3, 12, 8), s("calf-raise", 4, 15, 11)],
  },
  limbsB: {
    key: "limbsB",
    label: "Limbs B",
    focus: "Legs and arms, variation",
    slots: [s("leg-press", 4, 12, 8), s("bulgarian-split-squat", 3, 10, 6), s("lying-leg-curl", 3, 12, 8), s("hammer-curl", 3, 12, 8), s("overhead-triceps", 3, 12, 8), s("seated-calf-raise", 4, 15, 11)],
  },

  // ---- Agonist / antagonist pairs ----
  quadsHams: {
    key: "quadsHams",
    label: "Quads + Hamstrings",
    focus: "Opposing leg pairing",
    slots: [s("back-squat", 4, 8, 6), s("lying-leg-curl", 4, 12, 8), s("leg-press", 3, 12, 8), s("romanian-deadlift", 3, 10, 6), s("leg-extension", 3, 15, 11), s("calf-raise", 3, 15, 11)],
  },
  shouldersLats: {
    key: "shouldersLats",
    label: "Shoulders + Lats",
    focus: "Vertical push and pull",
    slots: [s("overhead-press", 4, 8, 6), s("pull-up", 4, 8, 6), s("lateral-raise", 3, 15, 11), s("straight-arm-pulldown", 3, 12, 8), s("face-pull", 3, 15, 11)],
  },
  bicepsTriceps: {
    key: "bicepsTriceps",
    label: "Biceps + Triceps",
    focus: "Arms, calves, abs",
    slots: [s("barbell-curl", 4, 10, 6), s("close-grip-bench", 4, 10, 6), s("hammer-curl", 3, 12, 8), s("triceps-pushdown", 3, 12, 8), s("calf-raise", 3, 15, 11), s("hanging-leg-raise", 3, 12, 8)],
  },

  // ---- Power / hypertrophy (PHUL, PHAT) ----
  powerUpper: {
    key: "powerUpper",
    label: "Power Upper",
    focus: "Heavy compounds, 3-5 reps",
    slots: [s("bench-press", 4, 4), s("barbell-row", 4, 4), s("overhead-press", 3, 5), s("pull-up", 3, 5), s("close-grip-bench", 3, 6), s("barbell-curl", 3, 6)],
  },
  powerLower: {
    key: "powerLower",
    label: "Power Lower",
    focus: "Heavy squat and deadlift, 3-5 reps",
    slots: [s("back-squat", 4, 4), s("deadlift", 3, 4), s("leg-press", 3, 8, 6), s("lying-leg-curl", 3, 8, 6), s("calf-raise", 4, 10, 6)],
  },
  hypUpper: {
    key: "hypUpper",
    label: "Hypertrophy Upper",
    focus: "8-15 reps, higher volume",
    slots: [s("incline-db-press", 4, 12, 8), s("seated-cable-row", 4, 12, 8), s("cable-crossover", 3, 15, 11), s("lat-pulldown", 3, 12, 8), s("lateral-raise", 4, 15, 11), s("hammer-curl", 3, 15, 11), s("triceps-pushdown", 3, 15, 11)],
  },
  hypLower: {
    key: "hypLower",
    label: "Hypertrophy Lower",
    focus: "8-15 reps, higher volume",
    slots: [s("front-squat", 4, 12, 8), s("romanian-deadlift", 3, 12, 8), s("leg-extension", 4, 15, 11), s("seated-leg-curl", 4, 15, 11), s("walking-lunge", 3, 12, 8), s("seated-calf-raise", 4, 20)],
  },
  // Norton's published back-and-shoulders day: rack chins, seated row, DB row or
  // shrug, close-grip pulldown, seated DB press, upright row, lateral raise.
  backShouldersHyp: {
    key: "backShouldersHyp",
    label: "Back + Shoulders",
    focus: "Hypertrophy, 8-15 reps",
    slots: [s("pull-up", 3, 10, 6), s("seated-cable-row", 3, 10, 6), s("db-row", 2, 14, 10), s("lat-pulldown", 2, 18, 14), s("db-shoulder-press", 3, 10, 6), s("shrug", 2, 14, 10), s("lateral-raise", 3, 16, 12)],
  },
  chestArmsHyp: {
    key: "chestArmsHyp",
    label: "Chest + Arms",
    focus: "Hypertrophy, 8-15 reps",
    slots: [s("incline-db-press", 4, 12, 8), s("cable-crossover", 4, 15, 11), s("dips", 3, 12, 8), s("barbell-curl", 3, 12, 8), s("skull-crusher", 3, 12, 8), s("hammer-curl", 3, 15, 11)],
  },

  // ---- Strength templates ----
  ssA: {
    key: "ssA",
    label: "Workout A",
    focus: "Squat, bench, deadlift",
    slots: [s("back-squat", 3, 5), s("bench-press", 3, 5), s("deadlift", 1, 5)],
  },
  ssB: {
    key: "ssB",
    label: "Workout B",
    focus: "Squat, press, power clean",
    slots: [s("back-squat", 3, 5), s("overhead-press", 3, 5), s("power-clean", 5, 3)],
  },
  ohpDay: {
    key: "ohpDay",
    label: "Overhead Press",
    focus: "Main lift plus accessories",
    slots: [s("overhead-press", 3, 5), s("dips", 3, 10, 6), s("lat-pulldown", 3, 12, 8), s("lateral-raise", 3, 15, 11), s("hanging-leg-raise", 3, 12, 8)],
  },
  deadliftDay: {
    key: "deadliftDay",
    label: "Deadlift",
    focus: "Main lift plus accessories",
    slots: [s("deadlift", 3, 5), s("good-morning", 3, 10, 6), s("lying-leg-curl", 3, 12, 8), s("hanging-leg-raise", 3, 12, 8), s("back-extension", 3, 15, 11)],
  },
  benchDay: {
    key: "benchDay",
    label: "Bench Press",
    focus: "Main lift plus accessories",
    slots: [s("bench-press", 3, 5), s("db-row", 4, 10, 6), s("incline-db-press", 3, 12, 8), s("triceps-pushdown", 3, 15, 11), s("face-pull", 3, 15, 11)],
  },
  squatDay: {
    key: "squatDay",
    label: "Squat",
    focus: "Main lift plus accessories",
    slots: [s("back-squat", 3, 5), s("romanian-deadlift", 3, 10, 6), s("leg-press", 3, 12, 8), s("calf-raise", 4, 15, 11), s("ab-wheel", 3, 12, 8)],
  },
  txVolume: {
    key: "txVolume",
    label: "Volume Day",
    focus: "5x5 at about 90%",
    slots: [s("back-squat", 5, 5), s("bench-press", 5, 5), s("barbell-row", 5, 5)],
  },
  txRecovery: {
    key: "txRecovery",
    label: "Recovery Day",
    focus: "Light, technique focused",
    slots: [s("back-squat", 2, 5), s("overhead-press", 3, 5), s("back-extension", 3, 12, 8), s("plank", 3, 45)],
  },
  txIntensity: {
    key: "txIntensity",
    label: "Intensity Day",
    focus: "Heavy single or triple",
    slots: [s("back-squat", 1, 3), s("bench-press", 1, 3), s("deadlift", 1, 3)],
  },
  meLower: {
    key: "meLower",
    label: "Max Effort Lower",
    focus: "Work to a heavy single",
    slots: [s("back-squat", 5, 3), s("good-morning", 3, 8, 6), s("hip-thrust", 3, 10, 6), s("back-extension", 3, 12, 8), s("ab-wheel", 4, 12, 8)],
  },
  meUpper: {
    key: "meUpper",
    label: "Max Effort Upper",
    focus: "Work to a heavy single",
    slots: [s("board-press", 5, 3), s("db-row", 4, 10, 6), s("close-grip-bench", 3, 6), s("face-pull", 3, 15, 11), s("hammer-curl", 3, 12, 8)],
  },
  deLower: {
    key: "deLower",
    label: "Dynamic Lower",
    focus: "Speed work",
    slots: [s("speed-squat", 8, 2), s("rack-pull", 3, 5), s("box-jump", 4, 5), s("lying-leg-curl", 3, 12, 8), s("plank", 3, 45)],
  },
  deUpper: {
    key: "deUpper",
    label: "Dynamic Upper",
    focus: "Speed work",
    slots: [s("speed-bench", 8, 3), s("barbell-row", 4, 8, 6), s("lateral-raise", 3, 15, 11), s("triceps-pushdown", 3, 15, 11), s("rear-delt-fly", 3, 15, 11)],
  },

  // ---- GVT ----
  // GVT pairs antagonists at 10x10, then two accessories at 3 sets.
  gvtChestBack: {
    key: "gvtChestBack",
    label: "Chest + Back (10x10)",
    focus: "Antagonist pair at 10x10, then accessories",
    slots: [s("decline-press", 10, 10), s("chin-up", 10, 10), s("cable-crossover", 3, 12, 8), s("straight-arm-pulldown", 3, 12, 8)],
  },
  gvtLegsAbs: {
    key: "gvtLegsAbs",
    label: "Legs + Abs (10x10)",
    focus: "Antagonist pair at 10x10, then accessories",
    slots: [s("back-squat", 10, 10), s("lying-leg-curl", 10, 10), s("calf-raise", 3, 15, 11), s("cable-crunch", 3, 15, 11)],
  },
  gvtArmsShoulders: {
    key: "gvtArmsShoulders",
    label: "Arms + Shoulders (10x10)",
    focus: "Antagonist pair at 10x10, then accessories",
    slots: [s("dips", 10, 10), s("barbell-curl", 10, 10), s("lateral-raise", 3, 15, 11), s("rear-delt-fly", 3, 15, 11)],
  },

  // ---- Hybrid lift + cardio ----
  upperStrength: {
    key: "upperStrength",
    label: "Upper Strength",
    focus: "Heavy upper body",
    slots: [s("bench-press", 4, 5), s("barbell-row", 4, 5), s("overhead-press", 3, 8, 6), s("pull-up", 3, 8, 6), s("triceps-pushdown", 3, 12, 8)],
  },
  lowerStrength: {
    key: "lowerStrength",
    label: "Lower Strength",
    focus: "Heavy lower body",
    slots: [s("back-squat", 4, 5), s("romanian-deadlift", 3, 8, 6), s("bulgarian-split-squat", 3, 10, 6), s("calf-raise", 4, 15, 11)],
  },
  zone2: { key: "zone2", label: "Zone 2 Cardio", focus: "Easy aerobic run", slots: [s("zone2-run", 1, 40)] },
  hiit: { key: "hiit", label: "Intervals", focus: "HIIT", slots: [s("intervals", 8, 1)] },
  longCardio: { key: "longCardio", label: "Long Cardio", focus: "Long easy effort", slots: [s("long-cardio", 1, 75)] },

  // ---- Calisthenics ----
  calPush: {
    key: "calPush",
    label: "Push (Bodyweight)",
    focus: "Push-ups, dips, handstand work",
    slots: [s("push-up", 4, 15, 11), s("dips", 4, 10, 6), s("pike-push-up", 3, 10, 6), s("handstand-hold", 3, 30), s("plank", 3, 45)],
  },
  calPull: {
    key: "calPull",
    label: "Pull (Bodyweight)",
    focus: "Pull-ups, rows, hangs",
    slots: [s("pull-up", 4, 8, 6), s("chin-up", 3, 8, 6), s("inverted-row", 4, 12, 8), s("straight-arm-pulldown", 3, 12, 8)],
  },
  calLegs: {
    key: "calLegs",
    label: "Legs + Core (Bodyweight)",
    focus: "Squats, lunges, pistols, nordics",
    slots: [s("goblet-squat", 4, 15, 11), s("walking-lunge", 3, 12, 8), s("pistol-squat", 3, 6), s("nordic-curl", 3, 8, 6), s("plank", 3, 60)],
  },
  bwFullBody: {
    key: "bwFullBody",
    label: "Bodyweight Circuit",
    focus: "All major groups",
    slots: [s("push-up", 4, 15, 11), s("inverted-row", 4, 12, 8), s("goblet-squat", 4, 15, 11), s("walking-lunge", 3, 12, 8), s("pike-push-up", 3, 10, 6), s("plank", 3, 60)],
  },
};

export type SplitCategory = "Full body" | "Upper / Lower" | "Push Pull Legs" | "Body part" | "Chains" | "Power & strength" | "Bodyweight" | "Hybrid";

export type Split = {
  id: string;
  name: string;
  category: SplitCategory;
  daysPerWeek: number;
  summary: string;
  /** Ordered cycle of day-template keys. "rest" included so the length is explicit. */
  cycle: string[];
};

export const SPLITS: Split[] = [
  { id: "FULL_BODY_2", name: "Full Body x2", category: "Full body", daysPerWeek: 2, summary: "Two full-body days a week.", cycle: ["fullBodyA", "fullBodyB", REST, REST, REST, REST, REST] },
  { id: "FULL_BODY_3", name: "Full Body x3", category: "Full body", daysPerWeek: 3, summary: "Three non-consecutive full-body days, three variations.", cycle: ["fullBodyA", REST, "fullBodyB", REST, "fullBodyC", REST, REST] },
  { id: "FULL_BODY_4", name: "Full Body x4", category: "Full body", daysPerWeek: 4, summary: "Rotating A/B, squat then hinge focus.", cycle: ["fullBodyA", "fullBodyB", REST, "fullBodyA", "fullBodyB", REST, REST] },
  { id: "BODYWEIGHT_FULL_BODY_3", name: "Bodyweight Full Body", category: "Bodyweight", daysPerWeek: 3, summary: "Full-body circuit, no equipment.", cycle: ["bwFullBody", REST, "bwFullBody", REST, "bwFullBody", REST, REST] },
  { id: "UPPER_LOWER_2", name: "Upper / Lower x2", category: "Upper / Lower", daysPerWeek: 2, summary: "One upper day, one lower day.", cycle: ["upper", "lower", REST, REST, REST, REST, REST] },
  { id: "UPPER_LOWER_4", name: "Upper / Lower x4", category: "Upper / Lower", daysPerWeek: 4, summary: "Upper and lower twice each, with B variations.", cycle: ["upper", "lower", REST, "upperB", "lowerB", REST, REST] },
  { id: "UPPER_LOWER_6", name: "Upper / Lower x6", category: "Upper / Lower", daysPerWeek: 6, summary: "Alternating upper and lower, six days on.", cycle: ["upper", "lower", "upperB", "lowerB", "upper", "lower", REST] },
  { id: "UPPER_LOWER_FULL_3", name: "Upper / Lower / Full", category: "Upper / Lower", daysPerWeek: 3, summary: "Upper, lower, then a full-body day.", cycle: ["upper", "lower", "fullBodyA", REST, REST, REST, REST] },
  { id: "PHUL_4", name: "PHUL", category: "Power & strength", daysPerWeek: 4, summary: "Power upper and lower, then hypertrophy upper and lower.", cycle: ["powerUpper", "powerLower", REST, "hypUpper", "hypLower", REST, REST] },
  { id: "PHAT_5", name: "PHAT", category: "Power & strength", daysPerWeek: 5, summary: "Two power days, three hypertrophy days.", cycle: ["powerUpper", "powerLower", REST, "backShouldersHyp", "hypLower", "chestArmsHyp", REST] },
];

SPLITS.push(
  { id: "PPL_3", name: "Push Pull Legs x3", category: "Push Pull Legs", daysPerWeek: 3, summary: "One push, one pull, one legs day.", cycle: ["push", "pull", "legs", REST, REST, REST, REST] },
  { id: "PPL_6", name: "Push Pull Legs x6", category: "Push Pull Legs", daysPerWeek: 6, summary: "The full cycle twice, with B variations.", cycle: ["push", "pull", "legs", "pushB", "pullB", "legsB", REST] },
  { id: "PPL_5_ROLLING", name: "PPL Rolling", category: "Push Pull Legs", daysPerWeek: 5, summary: "Push, pull, legs, rest - rolls on, no fixed weekday.", cycle: ["push", "pull", "legs", REST] },
  { id: "PPL_4", name: "PPL + Upper", category: "Push Pull Legs", daysPerWeek: 4, summary: "The cycle plus a fourth day for weak points.", cycle: ["push", "pull", "legs", "upperB", REST, REST, REST] },
  { id: "PUSH_PULL_2", name: "Push / Pull", category: "Push Pull Legs", daysPerWeek: 2, summary: "Legs folded into the push and pull days.", cycle: ["push", "pull", REST, REST, REST, REST, REST] },
  { id: "ULPPL_5", name: "Upper Lower PPL", category: "Push Pull Legs", daysPerWeek: 5, summary: "Upper and lower, then a full push pull legs cycle.", cycle: ["upper", "lower", REST, "push", "pull", "legs", REST] },
  { id: "PPLUL_5", name: "PPL + Upper Lower", category: "Push Pull Legs", daysPerWeek: 5, summary: "Push pull legs, then upper and lower.", cycle: ["push", "pull", "legs", "upperB", "lowerB", REST, REST] },
  { id: "UPPER_LOWER_PPL_HYBRID_5", name: "UL + PPL (no rest)", category: "Push Pull Legs", daysPerWeek: 5, summary: "Five straight days: upper, lower, push, pull, legs.", cycle: ["upper", "lower", "push", "pull", "legs", REST, REST] },
  { id: "PPL_ARNOLD_HYBRID_6", name: "PPL + Arnold", category: "Push Pull Legs", daysPerWeek: 6, summary: "A push pull legs block, then an antagonist block.", cycle: ["push", "pull", "legs", REST, "chestBack", "shouldersArms", "legsLowerBack"] },
  { id: "BRO_SPLIT_5", name: "Bro Split x5", category: "Body part", daysPerWeek: 5, summary: "One body part a day.", cycle: ["chest", "back", "legs", "shoulders", "arms", REST, REST] },
  { id: "BRO_SPLIT_6", name: "Bro Split x6", category: "Body part", daysPerWeek: 6, summary: "One body part a day plus a weak-point day.", cycle: ["chest", "back", "legs", "shoulders", "arms", "weakPoint", REST] },
  { id: "ARNOLD_SPLIT_6", name: "Arnold Split x6", category: "Body part", daysPerWeek: 6, summary: "Antagonist pairs, every muscle twice a week.", cycle: ["chestBack", "shouldersArms", "legsLowerBack", "chestBack", "shouldersArms", "legsLowerBack", REST] },
  { id: "ARNOLD_SPLIT_4", name: "Arnold Split x4", category: "Body part", daysPerWeek: 4, summary: "Antagonist pairs over four days.", cycle: ["chestBack", "shouldersArms", REST, "legsLowerBack", "fullBodyA", REST, REST] },
  { id: "AGONIST_ANTAGONIST_4", name: "Agonist / Antagonist", category: "Body part", daysPerWeek: 4, summary: "Opposing muscles paired in each session.", cycle: ["chestBack", "quadsHams", REST, "shouldersLats", "bicepsTriceps", REST, REST] },
);

SPLITS.push(
  { id: "GVT_10x10_5", name: "German Volume Training", category: "Power & strength", daysPerWeek: 3, summary: "10x10 on the main lift, over a five-day cycle.", cycle: ["gvtChestBack", "gvtLegsAbs", REST, "gvtArmsShoulders", REST] },
  { id: "ANTERIOR_POSTERIOR_2", name: "Anterior / Posterior x2", category: "Chains", daysPerWeek: 2, summary: "Split by movement chain rather than upper and lower.", cycle: ["anterior", "posterior", REST, REST, REST, REST, REST] },
  { id: "ANTERIOR_POSTERIOR_4", name: "Anterior / Posterior x4", category: "Chains", daysPerWeek: 4, summary: "Both chains twice, with variations.", cycle: ["anterior", "posterior", REST, "anteriorB", "posteriorB", REST, REST] },
  { id: "TORSO_LIMBS_4", name: "Torso / Limbs", category: "Chains", daysPerWeek: 4, summary: "Torso one day, arms and legs the next.", cycle: ["torso", "limbs", REST, "torsoB", "limbsB", REST, REST] },
  { id: "STRENGTH_TEMPLATE_STARTING_STRENGTH_3", name: "Starting Strength", category: "Power & strength", daysPerWeek: 3, summary: "Alternating A/B, three barbell lifts a session.", cycle: ["ssA", REST, "ssB", REST, "ssA", REST, REST] },
  { id: "STRENGTH_TEMPLATE_531_4", name: "5/3/1", category: "Power & strength", daysPerWeek: 4, summary: "One main lift a day over a four-week wave.", cycle: ["ohpDay", "deadliftDay", REST, "benchDay", "squatDay", REST, REST] },
  { id: "STRENGTH_TEMPLATE_TEXAS_METHOD_3", name: "Texas Method", category: "Power & strength", daysPerWeek: 3, summary: "Volume, recovery, then intensity.", cycle: ["txVolume", REST, "txRecovery", REST, "txIntensity", REST, REST] },
  { id: "CONJUGATE_WESTSIDE_4", name: "Conjugate (Westside)", category: "Power & strength", daysPerWeek: 4, summary: "Max effort and dynamic effort, upper and lower.", cycle: ["meLower", "meUpper", REST, "deLower", "deUpper", REST, REST] },
  { id: "HYBRID_LIFT_CARDIO_5", name: "Lift + Cardio Hybrid", category: "Hybrid", daysPerWeek: 5, summary: "Strength days interleaved with running.", cycle: ["upperStrength", "zone2", "lowerStrength", "hiit", "fullBodyA", "longCardio", REST] },
  { id: "CALISTHENICS_PPL_3", name: "Calisthenics PPL", category: "Bodyweight", daysPerWeek: 3, summary: "Push pull legs using bodyweight only.", cycle: ["calPush", "calPull", "calLegs", REST, REST, REST, REST] },
);

export const DEFAULT_SPLIT_ID = "UPPER_LOWER_2";

/**
 * How load advances on each split. Strength templates run linear or wave schemes on
 * the main lift; bodybuilding splits earn reps before weight. Bodyweight and cardio
 * days opt out, since there is no bar to add plates to.
 */
export const SPLIT_PROGRESSION: Record<string, "linear" | "double" | "wave531" | "none"> = {
  STRENGTH_TEMPLATE_STARTING_STRENGTH_3: "linear",
  STRENGTH_TEMPLATE_TEXAS_METHOD_3: "linear",
  STRENGTH_TEMPLATE_531_4: "wave531",
  CONJUGATE_WESTSIDE_4: "wave531",
  PHUL_4: "linear",
  PHAT_5: "linear",
  GVT_10x10_5: "double",
  BODYWEIGHT_FULL_BODY_3: "none",
  CALISTHENICS_PPL_3: "none",
  HYBRID_LIFT_CARDIO_5: "linear",
};

export function progressionFor(splitId: string): "linear" | "double" | "wave531" | "none" {
  // Everything else is hypertrophy work, where double progression is the norm.
  return SPLIT_PROGRESSION[splitId] ?? "double";
}

export function getSplit(id: string): Split {
  return SPLITS.find((sp) => sp.id === id) ?? SPLITS.find((sp) => sp.id === DEFAULT_SPLIT_ID)!;
}

export function getDay(key: string): DayTemplate {
  const known = DAY_TEMPLATES[key];
  if (known) return known;
  // Deliberately not falling back to the rest template: an unrecognised key would
  // then render as "Rest day" with no exercises, which looks like a deliberate rest
  // rather than a data problem. Better to say plainly that it is not recognised.
  return { key, label: "Unknown day", focus: "This day is not part of your current split", slots: [] };
}

export function isRestDay(key: string): boolean {
  return key === REST;
}

export type Exercise = { id: string; name: string; sets: number; targetReps: number; targetRepsMin: number };

export function exercisesForDay(key: string): Exercise[] {
  return getDay(key).slots.map((slot) => ({ id: slot.id, name: MOVEMENTS[slot.id] ?? slot.id, sets: slot.sets, targetReps: slot.reps, targetRepsMin: slot.repsMin ?? slot.reps }));
}

export function dayLabelOf(key: string): string {
  return getDay(key).label;
}

/** Every distinct day key, for pickers. */
export const ALL_DAY_KEYS: string[] = Object.keys(DAY_TEMPLATES).filter((k) => k !== REST);

/** Every movement that appears in at least one template. */
export const ALL_MOVEMENT_IDS: string[] = [...new Set(Object.values(DAY_TEMPLATES).flatMap((d) => d.slots.map((sl) => sl.id)))];

export function movementName(id: string): string {
  return MOVEMENTS[id] ?? id;
}

export function exerciseTarget(ex: Exercise): string {
  const reps = ex.targetRepsMin < ex.targetReps ? `${ex.targetRepsMin}-${ex.targetReps}` : `${ex.targetReps}`;
  return `${ex.sets} x ${reps}`;
}
