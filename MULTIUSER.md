# Going multi-user

Everything that has to change before a second person can use LifeTracker, written
down while the details were fresh. Audited against the code and the live database on
**30 August 2026**.

Read this before writing any auth code. Several of the items below are cheap now and
expensive later, and at least one of them (the `users` collection) will silently
corrupt another application if it is missed.

---

## 1. Where the app stands today

- **One user, assumed everywhere.** No document has an owner. Every query is
  effectively `find({})`.
- **No API authentication at all.** Not one endpoint checks anything. Anyone who
  knows the Render URL has full read and write access to the whole database.
- **The only lock is cosmetic.** `PrivateRoute` gates the Income and Payments *pages*
  with `PASSWORD = "2462"`, hardcoded in `client/src/components/PrivateRoute.tsx` and
  therefore visible in the shipped JavaScript bundle. It gates rendering, not data.
- **14 route files, 158 endpoints, 33 Mongoose models.**

---

## 2. Read this first: the database is shared with another app

`MONGO_URI` points at a database that **LifeTracker does not own alone**. Alongside
its own collections sit these, none of which any model in this repo reads:

```
allowances        auditlogs (662)   careertopics      dayflags
dayshapes         doublers (11)     exercises (61)    goalcontributions
matches (105)     medicalenglishentries               medicalenglishlessons
orders            planneddays       predictions (340) products
projects          settings          timelinedays      users (11)
```

### The trap

**`users` already exists and holds 11 documents belonging to a different
application.** Their shape:

```js
{ _id, username, displayName, passwordHash, role, doublersUsed, totalPoints, createdAt, updatedAt }
```

`doublersUsed` and `totalPoints` place them with `matches`, `predictions` and
`doublers`, which is some prediction game. They are not LifeTracker accounts.

Mongoose pluralises a model name into a collection name, so

```ts
export const User = model("User", userSchema);   // ← writes into "users". DO NOT.
```

would drop LifeTracker accounts into a live foreign collection, and any
`User.find({})` would return eleven strangers.

**Always name the collection explicitly:**

```ts
export const Account = model("Account", accountSchema, "lifetracker_users");
```

This has already gone wrong three times in this project's history and was fixed the
same way each time. Existing examples to copy:

| Model | Collection | Why |
| --- | --- | --- |
| `Habit` | `habitdefinitions` | `habits` held 6 documents from an abandoned attempt |
| `Goal2` | `objectives` | `goals` was taken by the nutrition goal, `lifegoals` by the old Goals page |

Before creating **any** new collection, list what is already there and pick a name
nothing answers to.

### Dead LifeTracker collections, safe to ignore or drop

- `habits` (6 docs): abandoned first attempt at the habit definitions
- `lifegoals` (24 docs): from the removed Goals page. Contains real content the user may
  still want: a weight goal to 100 kg with body-fat targets, bank savings goals of
  100,000 LE and $10,000, and a priced wishlist (desk 15,000 EGP, gaming chair, wall
  panels, peg board, flying shelves). Import or delete deliberately, do not migrate
  by accident.
- `fridgeitems` (0): the old name for `kitchenitems`
- Orphan `dashboardtrackers` kinds: `prayers`, `walking`, `reading`, `planning`

---

## 3. The blockers, in the order they will bite

### 3.1 Every unique index is global

These are the hard stops. The moment a second user exists, their 30 August collides
with yours and the write is rejected with a duplicate key error.

| File | Index | Becomes |
| --- | --- | --- |
| `models/SleepEntry.ts:20` | `date` unique | `(userId, date)` |
| `models/JournalEntry.ts:19` | `date` unique | `(userId, date)` |
| `models/CheatDay.ts:5` | `date` unique | `(userId, date)` |
| `models/DayStatus.ts:5` | `date` unique | `(userId, date)` |
| `models/WorkoutSession.ts:40` | `date` unique | `(userId, date)` |
| `models/DashboardTracker.ts:33` | `(kind, date)` unique | `(userId, kind, date)` |
| `models/Task.ts:20` | `(date, isDefault)` unique, partial | `(userId, date, isDefault)` |
| `models/Habit.ts:27` | `key` unique | `(userId, key)` |
| `models/ExerciseNote.ts:10` | `movementId` unique | `(userId, movementId)` |
| `models/WorkoutDayPlan.ts:23` | `dayKey` unique | `(userId, dayKey)` |
| `models/KitchenItem.ts:19` | `foodId` unique | `(userId, foodId)` |
| `models/SetLog.ts:24` | `(sessionId, exerciseId, setNumber)` | already safe: scoped by session |
| `models/GoalCheckpoint.ts:39` | `(goalId, date)` non-unique | already safe: scoped by goal |

Dropping and rebuilding a unique index on a live collection is not instant. Do it in
the migration script, explicitly, with the old index dropped by name.

### 3.2 Four singleton documents

`lib/schema-guards.ts` enforces "at most one document in this collection" as a
pre-validate hook. Used by:

- `models/TrackerGoals.ts:88`: every target the dashboard measures against
- `models/WeightGoal.ts:12`
- `models/WorkoutSettings.ts:23`
- `models/Goal.ts:21`: the retired nutrition goal, folded into TrackerGoals but still
  present

Each becomes one-per-user. `enforceSingleton(schema, label)` needs a scope argument:

```ts
export function enforceSingletonPerUser(schema: Schema, label: string): void {
  schema.pre("validate", async function () {
    if (!this.isNew) return;
    const rivals = await (this.constructor as Model<unknown>)
      .countDocuments({ _id: { $ne: this._id }, userId: this.get("userId") })
      .limit(1);
    if (rivals > 0) this.invalidate("_id", `${label} already exists for this user`);
  });
}
```

Every `findOne()` against these four (there are many, `loadTrackerGoals()` most of
all) must gain a userId filter. `loadTrackerGoals()` in `models/TrackerGoals.ts` is
the single most-called one: fix it first and most callers follow.

### 3.3 Habits are seeded once per database

`lib/habit-seed.ts` seeds 13 habit definitions the first time the collection is
empty, guarded by a **module-level `let done = false`** (line 99) plus a
`countDocuments() > 0` check. Both assume one user.

For multi-user this stops being a boot-time concern and becomes part of signup:
seed that user's 13 habits when the account is created. Delete the `done` flag; it is
a per-process cache that will serve the wrong answer as soon as seeding is per-user.

`patchExisting()` in the same file (the migration that turned Sleep into a derived
habit) is idempotent and can stay, but must run per user.

### 3.4 Habit keys are global strings, and logic branches on them

`routes/dashboard.ts` hardcodes behaviour by key: `water`, `calories`, `protein`,
`steps`, `gym`, `tasks`, `sleep`, `work` (around lines 188-566, 854, 869). Two users
each owning a habit keyed `sleep` is fine once habits are scoped, but be aware that
the key is treated as a well-known identifier, not as a user's private name. If a
user renames or deletes their `sleep` habit, the derived branch simply stops firing.
That is acceptable; it just should not be a surprise.

### 3.5 Process-level cache keyed by nothing

In `routes/dashboard.ts:27`, `earliestMonthCache` caches the earliest tracked month for
five minutes, globally. With two users, whoever loads first decides how far back
everyone else can page. Make it a `Map<userId, …>` or drop it.

---

## 4. Security, which is a today problem

None of this is safe once the app is public, and most of it is not safe now.

1. **`app.use(cors())` in `server/src/index.ts:38` allows every origin.** Replace with
   an allow-list of your deployed front end plus `http://localhost:5173`, and add
   `credentials: true` if cookies carry the session.
2. **No endpoint authenticates.** After auth exists, mount the middleware *above* the
   routers so a new route file cannot forget it:
   ```ts
   app.use("/api", requireAuth);   // above every app.use("/api/…", router)
   ```
   Keep `/api/health` and the login/signup routes above that line.
3. **`PASSWORD = "2462"` must go.** It is in the client bundle. Anyone can read it.
4. **The rate limiter keys on IP** (`index.ts`, `limit: 1000` per 15 minutes). Fine as
   an abuse ceiling, but the login endpoint needs its own much tighter limiter keyed
   on username, or it is a brute-force target.
5. **`client/.env` sets a `VITE_API_KEY` that nothing in the codebase reads.** Either it is dead and should be deleted, or
   it is a real credential sitting in a file whose contents ship to the browser under
   the `VITE_` prefix. Check what it belongs to and rotate it if it is real.
6. **No audit trail of any kind.** The `auditlogs` collection belongs to the other
   app, not to this one.

### Session choice

httpOnly cookie is the better default here: the front end never has to hold a token,
and XSS cannot read it. It needs `credentials: "include"` on the axios instance,
`sameSite` set deliberately, and a CORS allow-list (see above). A bearer token in
memory is the alternative if the API and front end end up on unrelated origins.

---

## 5. Client-side work

### 5.1 The API client

`client/src/lib/api.ts` is six lines and sends no credentials. It needs:

- `withCredentials: true` (cookie sessions)
- a response interceptor that redirects to login on 401 rather than surfacing a toast
- to stop falling back to the hardcoded `https://tracker-u98r.onrender.com/api`
  silently, which currently means a missing `VITE_API_URL` points a local build at
  production data

### 5.2 Browser storage is per-device, not per-user

Every one of these keys will be shared between accounts on the same browser. Namespace
them with the user id, or clear them all on logout:

| Key | File | Risk if shared |
| --- | --- | --- |
| `workout:pending-sets:v1` | `lib/setQueue.ts:51` | **Serious.** Unsent sets from user A replay into user B's session after a login switch |
| `lifetracker.dashboard.hiddenRows.v1` | `pages/Dashboard.tsx:142` | Cosmetic |
| `workout:rest-seconds`, `workout:rest-timer-enabled` | `pages/Workout.tsx:151-152` | Cosmetic |
| `lifetracker.install.dismissed.v1` | `components/ConnectionStatus.tsx:45` | Cosmetic |
| `private:unlocked-until` | `components/PrivateRoute.tsx:14` | Disappears with PrivateRoute |

The set queue is the one that matters. It holds real writes that have not landed yet,
and it must be flushed or namespaced before a different account can sign in.

### 5.3 The service worker caches API responses

`client/public/sw.js` keeps a `lifetracker-api-v1` cache of every API GET, so an
offline reload still shows data. On a shared device that cache would serve user A's
dashboard to user B. Before multi-user:

- include the user id in the cache name, **or**
- delete the API cache on logout:
  ```js
  await caches.delete("lifetracker-api-v1");
  ```
- bump `SHELL_VERSION` in the same commit so old workers are replaced

Also make sure the login page itself is never served from the shell cache in a way
that hides a logged-out state.

---

## 6. Suggested migration order

Do it in this order. Steps 1 and 2 are reversible; step 4 is not, so back up first.

1. **Back up.** Atlas snapshot, plus a `mongodump` you hold yourself. There is no
   export feature in the app (see section 8).
2. **Create the account model** with an explicit collection name that is not `users`.
   Signup, login, logout, session middleware. Do not wire it into any existing route
   yet.
3. **Add `userId` to every schema**, optional at first (`required: false`), indexed.
4. **Backfill.** One script, one pass: assign every existing document to your account
   id. Sketch:
   ```ts
   const OWNER = new mongoose.Types.ObjectId("…your account id…");
   const MODELS = [SleepEntry, JournalEntry, WeightEntry, /* …all 32… */];
   for (const M of MODELS) {
     const r = await M.updateMany({ userId: { $exists: false } }, { $set: { userId: OWNER } });
     console.log(M.modelName, r.modifiedCount);
   }
   ```
   Print the counts and check them against section 2's inventory before moving on.
5. **Swap the indexes.** Drop each global unique index by name, create the compound
   one. Verify with `db.collection.getIndexes()`.
6. **Make `userId` required** in the schemas.
7. **Scope every query.** This is the bulk of the work: 158 endpoints. Do it
   router by router, largest first (`payments` 33, `calories` 22, `workouts` 20,
   `kitchen` 13, `goals` 12). A helper that reads the user off the request and merges
   it into the filter keeps it honest:
   ```ts
   const mine = (req: Request, filter: object = {}) => ({ ...filter, userId: req.user!.id });
   ```
   Grep for `find(`, `findOne(`, `findById(`, `countDocuments(`, `aggregate(`,
   `updateMany(`, `deleteMany(` and check each one. `findById` is the dangerous one:
   it takes an id straight from the URL and will happily return another user's
   document. Every one of them needs `findOne({ _id: id, userId })` instead. There are
   **79 `findById` calls and 4 `findByIdAnd…` calls** across the routes and libs today,
   and each is an unauthorised-read bug until it is scoped.
8. **Per-user seeding** on signup: habits, and whichever singletons should exist from
   day one.
9. **Client:** login screen, auth interceptor, logout that clears storage and caches,
   remove `PrivateRoute`.
10. **Lock the door:** CORS allow-list, `requireAuth` above all routers, login rate
    limiter.

### The alternative: a database per user

Worth considering before step 3. It sidesteps every index and singleton change, and
makes a data leak between users almost impossible. The cost is connection management,
migrations that have to run N times, and no cross-user queries ever. For a handful of
friends it is genuinely simpler. For anything that might grow, `userId` on every
document is the conventional answer. Decide deliberately.

---

## 7. What to test after the migration

The failure mode to hunt for is **one user seeing or writing another's data**. Type
checks cannot catch it; only paired accounts can.

Create two accounts and, for each area, do this:

1. Log something as A. Confirm B cannot see it in the list.
2. Copy the document's `_id` out of A's response and request it directly as B. It must
   404, not return the document. This catches every unscoped `findById`.
3. Try to PATCH and DELETE that id as B. Both must 404.
4. Log the **same date** as both A and B: sleep, journal, a weigh-in, a workout
   session, a cheat day, the default daily task. All six have global unique indexes
   today, so this is the exact case that breaks.
5. Check the dashboard grid, monthly totals and streaks as each user. Numbers must not
   include the other's rows.
6. Check the singletons: A changing their calorie target must not move B's.
7. Habits: both users create a habit with the same key. Both must work.
8. Log out of A on a device, log in as B, and confirm the dashboard is not A's cached
   one. Repeat offline.
9. Log sets offline as A, log out before they sync, log in as B. B must not send A's
   sets.

Regression checks unrelated to auth, worth re-running after such a large change:
`client/scripts/check-pages.cjs` (walks every page, fails on any console error) and
`client/scripts/check-offline.cjs` (installs the worker, kills the network, reloads).
Both need the API running and `npm run build` done first.

---

## 8. Known issues, unrelated to auth but worth fixing while in there

- **No backup or export, of anything.** A month of daily logging with no way to get it
  out. An export endpoint per user becomes close to mandatory once other people's data
  is in there, and it is also the honest answer to "can I have my data".
- **Three real weigh-ins are soft-deleted** and therefore invisible: 135 kg on
  2026-04-10, 130 kg on 2026-04-25, 120 kg on 2026-05-21, all with `deletedAt` set.
  The Body view reads "Nothing measured yet" while that history sits in the
  collection. Clearing `deletedAt` on those three restores the chart, if the deletion
  was not deliberate.
- **`components/CoachReportModal.tsx` is fully written and imported by nothing.**
  Either wire it up or delete it.
- **`routes/dashboard.ts` is 900 lines** and holds the habit grid, the goals editor
  and the recap. It is the file most likely to be edited by the scoping work and the
  one where a missed filter hides best. Consider splitting it before, not after.
- **Recurring tasks were designed and never built.** The recurrence engine exists and
  is generic on purpose: `server/src/lib/recurrence.ts` handles weekly, monthly and
  yearly schedules, clamps the 31st into February without drifting, and is verified
  against leap years. Subscriptions already use it. The Tasks page can reuse it as is.

---

## 9. Quick file index

| Concern | File |
| --- | --- |
| Server entry, CORS, rate limit, router mounts | `server/src/index.ts` |
| Singleton guard | `server/src/lib/schema-guards.ts` |
| Targets singleton and its loader | `server/src/models/TrackerGoals.ts` |
| Habit seeding and per-user setup | `server/src/lib/habit-seed.ts` |
| Habit grid, derived rows, recap | `server/src/routes/dashboard.ts` |
| Shared expense writer, balances | `server/src/lib/spend.ts` |
| Recurrence engine | `server/src/lib/recurrence.ts` |
| API client | `client/src/lib/api.ts` |
| Cosmetic page lock, to be removed | `client/src/components/PrivateRoute.tsx` |
| Offline set queue, holds unsent writes | `client/src/lib/setQueue.ts` |
| Service worker and its caches | `client/public/sw.js` |
| Page smoke test | `client/scripts/check-pages.cjs` |
| Offline test | `client/scripts/check-offline.cjs` |
