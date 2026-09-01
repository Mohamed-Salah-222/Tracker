// =====================================================================
// Exercise reference: what a movement works and how to do it well.
//
// `primary` / `secondary` name muscles; `cues` are the two or three things that
// actually change whether a set is any good. A movement missing from here still
// renders, just without the reference section.
//
// Illustrations live in client/public/exercises/<id>.webp and are looked up by the
// movement id. Any that are missing show a placeholder rather than a broken image.
// =====================================================================

export type ExerciseInfo = {
  primary: string[];
  secondary: string[];
  cues: string[];
};

export const EXERCISE_INFO: Record<string, ExerciseInfo> = {
  // ---- Chest ----
  "chest-press": { primary: ["Chest"], secondary: ["Front delts", "Triceps"], cues: ["Set the seat so the handles line up with mid-chest.", "Stop just short of locking out to keep tension on the chest.", "Let the handles travel back until you feel a stretch, no further."] },
  "flat-bar-chest-press": { primary: ["Chest"], secondary: ["Front delts", "Triceps"], cues: ["Shoulder blades pulled back and down, chest up.", "Bar path meets the lower half of the chest, not the collarbone.", "Drive the feet into the floor as you press."] },
  "bench-press": { primary: ["Chest"], secondary: ["Front delts", "Triceps"], cues: ["Tuck the elbows to about 45 degrees, not flared straight out.", "Touch the sternum, pause, then press.", "Keep the wrists stacked over the elbows."] },
  "incline-db-press": { primary: ["Upper chest"], secondary: ["Front delts", "Triceps"], cues: ["Bench at 30 degrees; steeper turns it into a shoulder press.", "Dumbbells stay over the elbows through the whole range.", "Stop before the bells clash at the top."] },
  "decline-press": { primary: ["Lower chest"], secondary: ["Triceps"], cues: ["Secure the legs before unracking.", "Lower to the bottom of the chest.", "Shorter range than flat bench, so do not force depth."] },
  "chest-fly": { primary: ["Chest"], secondary: ["Front delts"], cues: ["Soft bend in the elbow, fixed for the whole set.", "Think about hugging, not pressing.", "Squeeze for a beat at the point of peak tension."] },
  "cable-crossover": { primary: ["Chest"], secondary: ["Front delts"], cues: ["Step forward so there is tension at the stretched position.", "Bring the hands together and slightly across.", "Keep the ribcage down; do not lean in with the lower back."] },
  dips: { primary: ["Lower chest", "Triceps"], secondary: ["Front delts"], cues: ["Lean forward for chest, stay upright for triceps.", "Descend until the upper arm is roughly parallel.", "Do not shrug; keep the shoulders away from the ears."] },
  "push-up": { primary: ["Chest"], secondary: ["Triceps", "Core"], cues: ["Body in one line from head to heels.", "Hands under the shoulders, elbows at 45 degrees.", "Full lockout at the top, chest to the floor at the bottom."] },

  // ---- Back ----
  "lat-pulldown": { primary: ["Lats"], secondary: ["Biceps", "Rear delts"], cues: ["Pull the bar to the collarbone, not behind the neck.", "Lead with the elbows, not the hands.", "Let the shoulder blades rise at the top for a full stretch."] },
  "pull-up": { primary: ["Lats"], secondary: ["Biceps", "Mid back"], cues: ["Start from a dead hang every rep.", "Drive the elbows down and back.", "Chest to the bar, not chin over it, if you can."] },
  "chin-up": { primary: ["Lats", "Biceps"], secondary: ["Mid back"], cues: ["Underhand grip, about shoulder width.", "Keep the ribs down so it does not become a swing.", "Lower under control; that half is the growth."] },
  "barbell-row": { primary: ["Mid back", "Lats"], secondary: ["Biceps", "Rear delts"], cues: ["Hinge to roughly 45 degrees and hold it.", "Pull to the belly button, not the chest.", "Stop the set when the torso starts rising to help."] },
  "t-bar-row": { primary: ["Mid back"], secondary: ["Lats", "Biceps"], cues: ["Chest supported if the pad allows it.", "Squeeze the shoulder blades at the top.", "Do not jerk the weight off the bottom."] },
  "seated-cable-row": { primary: ["Mid back"], secondary: ["Lats", "Biceps"], cues: ["Sit tall; the torso stays still.", "Pull to the navel, elbows close to the body.", "Allow a full stretch forward without rounding."] },
  "db-row": { primary: ["Lats", "Mid back"], secondary: ["Biceps"], cues: ["Flat back, one hand braced.", "Pull the dumbbell to the hip, not the shoulder.", "No twisting at the top to gain range."] },
  "inverted-row": { primary: ["Mid back"], secondary: ["Biceps", "Rear delts"], cues: ["Straight line from heels to head.", "Chest to the bar.", "Lower the feet to make it easier, raise them to make it harder."] },
  "straight-arm-pulldown": { primary: ["Lats"], secondary: ["Triceps (long head)"], cues: ["Arms stay nearly straight the whole time.", "Hinge slightly and keep the torso fixed.", "Drive the bar to the thighs, feel the lats, not the triceps."] },
  shrug: { primary: ["Traps"], secondary: ["Forearms"], cues: ["Straight up and down, no rolling.", "Pause at the top for a full second.", "Use straps once grip is the limiting factor."] },
  "back-extension": { primary: ["Erectors", "Glutes"], secondary: ["Hamstrings"], cues: ["Hinge at the hip, do not crank the lower back.", "Squeeze the glutes to finish.", "Stop level with the body; hyperextension buys nothing."] },

  // ---- Shoulders ----
  "shoulder-press": { primary: ["Front delts"], secondary: ["Side delts", "Triceps"], cues: ["Set the seat so the handles start at ear height.", "Press up and slightly in.", "Keep the lower back against the pad."] },
  "db-shoulder-press": { primary: ["Front delts"], secondary: ["Side delts", "Triceps"], cues: ["Elbows slightly in front of the body, not flared wide.", "Do not clash the bells overhead.", "Ribs down - no leaning back into a press."] },
  "overhead-press": { primary: ["Front delts"], secondary: ["Triceps", "Upper chest"], cues: ["Squeeze the glutes to stop the lower back arching.", "Move the head back, then push it through at lockout.", "Bar finishes over the mid-foot."] },
  "lateral-raise": { primary: ["Side delts"], secondary: ["Traps"], cues: ["Lead with the elbows, not the hands.", "Stop at shoulder height - higher brings in the traps.", "Lighter than you think; this is not a strength lift."] },
  "cable-lateral-raise": { primary: ["Side delts"], secondary: [], cues: ["Cable behind the body gives tension at the bottom.", "One arm at a time, torso still.", "Slow on the way down."] },
  "rear-delt-fly": { primary: ["Rear delts"], secondary: ["Mid back"], cues: ["Hinge over and let the arms hang.", "Think elbows out and back, not up.", "Stop when the shoulder blades take over."] },
  "face-pull": { primary: ["Rear delts"], secondary: ["Traps", "Rotator cuff"], cues: ["Rope at eye height.", "Pull to the forehead, hands finishing wide.", "The external rotation at the end is the point."] },
  "pike-push-up": { primary: ["Front delts"], secondary: ["Triceps"], cues: ["Hips high, body in an inverted V.", "Crown of the head to the floor between the hands.", "Raise the feet to make it harder."] },
  "handstand-hold": { primary: ["Front delts"], secondary: ["Core", "Traps"], cues: ["Stack wrists, shoulders and hips.", "Push the floor away - do not sag.", "Logged in seconds, not reps."] },

  // ---- Arms ----
  "bicep-curl": { primary: ["Biceps"], secondary: ["Forearms"], cues: ["Elbows pinned to the sides.", "No swing - if the hips move, it is too heavy.", "Squeeze at the top, control the descent."] },
  "barbell-curl": { primary: ["Biceps"], secondary: ["Forearms"], cues: ["Shoulder-width grip, elbows still.", "Stop before the forearms go vertical to keep tension.", "Use an EZ bar if a straight bar bothers the wrists."] },
  "hammer-curl": { primary: ["Brachialis", "Biceps"], secondary: ["Forearms"], cues: ["Neutral grip, thumbs up throughout.", "No shoulder swing.", "Elbow-friendly way to add curl volume."] },
  "preacher-curl": { primary: ["Biceps"], secondary: ["Forearms"], cues: ["Armpits into the top of the pad.", "Do not fully lock out at the bottom under load.", "Slow eccentric; this position is a deep stretch."] },
  "triceps-pushdown": { primary: ["Triceps"], secondary: [], cues: ["Elbows locked at the sides.", "Full extension, brief squeeze.", "Lean in slightly and keep the torso still."] },
  "overhead-triceps": { primary: ["Triceps (long head)"], secondary: [], cues: ["Upper arms stay vertical.", "Full stretch behind the head.", "Elbows in, not flaring wide."] },
  "skull-crusher": { primary: ["Triceps"], secondary: [], cues: ["Lower to the forehead or just behind it.", "Upper arms angled slightly back, not vertical.", "Stop the set if the elbows start aching."] },
  "close-grip-bench": { primary: ["Triceps"], secondary: ["Chest", "Front delts"], cues: ["Hands just inside shoulder width - narrower wrecks wrists.", "Elbows tucked close.", "Touch the lower chest."] },
  "wrist-curl": { primary: ["Forearms"], secondary: [], cues: ["Forearms braced on a bench or the thighs.", "Full range: let the bar roll to the fingertips.", "High reps; it is a small muscle."] },

  // ---- Legs ----
  "back-squat": { primary: ["Quads", "Glutes"], secondary: ["Hamstrings", "Erectors"], cues: ["Brace as if about to be punched, then descend.", "Knees track over the toes.", "Depth to at least parallel if mobility allows."] },
  "front-squat": { primary: ["Quads"], secondary: ["Glutes", "Upper back"], cues: ["Elbows high - dropping them dumps the bar.", "More upright torso than a back squat.", "Lighter than back squat; that is expected."] },
  "goblet-squat": { primary: ["Quads"], secondary: ["Glutes", "Core"], cues: ["Weight at the chest, elbows inside the knees.", "Sit down between the hips.", "Good for grooving depth."] },
  "hack-squat": { primary: ["Quads"], secondary: ["Glutes"], cues: ["Feet mid-platform; higher shifts work to the glutes.", "Lower back flat on the pad.", "Do not bounce out of the bottom."] },
  "leg-press": { primary: ["Quads", "Glutes"], secondary: ["Hamstrings"], cues: ["Do not let the lower back round off the seat.", "Knees to about 90 degrees, no forced depth.", "Never lock the knees out hard at the top."] },
  "leg-extension": { primary: ["Quads"], secondary: [], cues: ["Align the knee with the machine pivot.", "Pause at full extension.", "Control the negative; do not let it slam."] },
  "seated-leg-curl": { primary: ["Hamstrings"], secondary: ["Calves"], cues: ["Strap the hips down so they cannot lift.", "Squeeze hard at the bottom.", "Slow return, full stretch."] },
  "lying-leg-curl": { primary: ["Hamstrings"], secondary: ["Calves"], cues: ["Hips pressed into the pad.", "Do not let the hips pike up to help.", "Point the toes to bias the hamstring."] },
  "romanian-deadlift": { primary: ["Hamstrings", "Glutes"], secondary: ["Erectors"], cues: ["Push the hips back; the knees barely bend.", "Bar stays against the legs.", "Stop where the stretch ends, not at the floor."] },
  deadlift: { primary: ["Glutes", "Hamstrings", "Erectors"], secondary: ["Lats", "Traps"], cues: ["Bar over the mid-foot before you pull.", "Take the slack out, then push the floor away.", "Hips and shoulders rise together."] },
  "rack-pull": { primary: ["Erectors", "Traps"], secondary: ["Glutes", "Lats"], cues: ["Bar starts just below or at the knee.", "Same brace as a deadlift, shorter range.", "Do not hyperextend to lock out."] },
  "hip-thrust": { primary: ["Glutes"], secondary: ["Hamstrings"], cues: ["Shoulder blades on the bench edge.", "Chin tucked, ribs down.", "Full lockout with a one-second squeeze."] },
  "bulgarian-split-squat": { primary: ["Quads", "Glutes"], secondary: ["Adductors"], cues: ["Front foot far enough forward that the knee stays behind the toes.", "Upright for quads, leaning for glutes.", "Balance first, load second."] },
  "walking-lunge": { primary: ["Quads", "Glutes"], secondary: ["Hamstrings"], cues: ["Long step, drop the back knee straight down.", "Push through the front heel.", "Keep the torso tall."] },
  "pistol-squat": { primary: ["Quads", "Glutes"], secondary: ["Core"], cues: ["Progress from a box before going full depth.", "Free leg straight out in front.", "Hold something light out front for balance."] },
  "nordic-curl": { primary: ["Hamstrings"], secondary: ["Glutes"], cues: ["Anchor the ankles firmly.", "Resist the whole way down - the eccentric is the exercise.", "Push off the hands to return."] },
  "good-morning": { primary: ["Hamstrings", "Erectors"], secondary: ["Glutes"], cues: ["Light. This is not a squat variation.", "Hinge back with a flat spine.", "Stop well short of where the back would round."] },
  "calf-raise": { primary: ["Calves (gastroc)"], secondary: [], cues: ["Full stretch at the bottom, full contraction at the top.", "Pause at both ends.", "Do not bounce."] },
  "seated-calf-raise": { primary: ["Calves (soleus)"], secondary: [], cues: ["The bent knee shifts work to the soleus.", "Slow, deliberate reps.", "Higher reps than most lifts."] },
  "box-jump": { primary: ["Quads", "Glutes"], secondary: ["Calves"], cues: ["Step down, never jump down.", "Land soft, knees tracking out.", "Quality over height."] },

  // ---- Core ----
  plank: { primary: ["Core"], secondary: ["Glutes"], cues: ["Elbows under the shoulders.", "Squeeze the glutes and tuck the ribs.", "Logged in seconds, not reps."] },
  "hanging-leg-raise": { primary: ["Core"], secondary: ["Hip flexors", "Forearms"], cues: ["Stop the swing before each rep.", "Curl the pelvis up, do not just lift the legs.", "Bend the knees to make it easier."] },
  "cable-crunch": { primary: ["Core"], secondary: [], cues: ["Hips stay fixed; the spine does the moving.", "Crunch down, do not hinge at the hip.", "Slow return."] },
  "ab-wheel": { primary: ["Core"], secondary: ["Lats"], cues: ["Ribs down and glutes tight before you roll.", "Only go as far as you can keep a flat back.", "Knees on a pad."] },

  // ---- Power ----
  "power-clean": { primary: ["Full body"], secondary: ["Traps", "Quads", "Glutes"], cues: ["Coach it before loading it.", "Extend the hips fully before pulling with the arms.", "Catch in a quarter squat with the elbows high."] },
  "speed-squat": { primary: ["Quads", "Glutes"], secondary: [], cues: ["About 50-60% of max, moved as fast as possible.", "Short rest, many sets.", "Stop the set the moment bar speed drops."] },
  "speed-bench": { primary: ["Chest"], secondary: ["Triceps", "Front delts"], cues: ["Around 50% of max, explosive.", "Three reps, short rest.", "Speed is the whole point, not fatigue."] },
  "board-press": { primary: ["Triceps"], secondary: ["Chest", "Front delts"], cues: ["Board or pad shortens the range at the chest.", "Pause on the board, do not bounce.", "Trains the lockout."] },

  // ---- Cardio ----
  "zone2-run": { primary: ["Cardio"], secondary: [], cues: ["Conversational pace throughout.", "Logged in minutes.", "If you cannot talk, slow down."] },
  intervals: { primary: ["Cardio"], secondary: [], cues: ["Hard effort, then equal or longer easy.", "Logged as rounds.", "Warm up properly first."] },
  "long-cardio": { primary: ["Cardio"], secondary: [], cues: ["Easy and steady.", "Logged in minutes.", "Fuel and hydrate for anything over an hour."] },
};

/** Path convention for the anatomy illustration. Missing files fall back to a placeholder. */
export function exerciseImagePath(movementId: string): string {
  return `/exercises/${movementId}.webp`;
}

export function exerciseInfo(movementId: string): ExerciseInfo | undefined {
  return EXERCISE_INFO[movementId];
}
