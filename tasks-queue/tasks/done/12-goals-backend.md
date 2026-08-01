client/src/pages/Goals.tsx and GoalDetail.tsx currently render entirely from static hardcoded data in client/src/lib/goals.ts, with no server persistence — the "New Goal" button has no handler, and GoalDetail.tsx falls back to localStorage for money/InBody edits with silently swallowed parse failures (lines 36 and 63).

Build a real backend for this:

1. [QUESTION FOR USER: create server/src/models/Goal2.ts — or agree on a non-colliding name first, since Goal.ts already exists for nutrition targets. Do not create the model until this is answered.] The new model covers three types matching the existing frontend's GoalKind: "project" | "money" | "weight".
   - For the "weight" type, do not duplicate weight tracking — reuse the existing WeightEntry and WeightGoal models, which already do exactly this; the new Goal type should reference/wrap them, not replace them.
   - For "money" type: title, target amount, currency, current amount derived from a running total of logged contributions (new GoalContribution model: goalId, date, amount).
   - For "project" type: title, subtitle, an ordered list of tasks/tickets (title, done, status, threadCount, section) — matching the existing GoalTask shape already defined in client/src/lib/goals.ts, just persisted instead of hardcoded.
2. Add server/src/routes/goals.ts with full CRUD for goals, contributions, and project tasks, mounted at /api/goals in server/src/index.ts.
3. Update client/src/pages/Goals.tsx and GoalDetail.tsx to fetch from the new API instead of the static client/src/lib/goals.ts file, and wire up the "New Goal" button to actually create a goal via the API.
4. Replace the localStorage fallback in GoalDetail.tsx with real API calls, including proper error handling (no more silently swallowed parse failures).
5. Remove the placeholder gym-platform project data from client/src/lib/goals.ts once real persistence is in place — it was unrelated dummy content, not real data about this app.
