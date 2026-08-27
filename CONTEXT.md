# LifeTracker Technical Context

## Stack
- Languages: TypeScript throughout app code; JSX/TSX for React UI; CSS via Tailwind v4 theme tokens in `client/src/index.css`.
- Client framework/runtime: React `^19.2.5`, React DOM `^19.2.5`, Vite `^8.0.10`, browser SPA mounted by `client/src/main.tsx` into `client/index.html`.
- Server framework/runtime: Node.js CommonJS TypeScript compiled to `server/dist`; Express `^5.2.1`; Mongoose `^9.6.1`; entry `server/src/index.ts`.
- Database/storage: MongoDB via Mongoose. Connection string loaded from `server/.env` key `MONGO_URI`; schemas in `server/src/models/*.ts` are schema source of truth. Client-only localStorage stores theme, money visibility, and private-route unlock.
- Config/secrets: `server/src/index.ts` calls `dotenv.config()` and reads `PORT`, `MONGO_URI`. Client API URL is hard-coded in `client/src/lib/api.ts` to `https://tracker-u98r.onrender.com/api`. No `.env.example`.
- Package layout: no root `package.json`; independent `client/package.json` and `server/package.json`; both `node_modules` folders exist in the workspace despite `.gitignore`.
- Key client libraries:
  - `axios`: HTTP client wrapper in `client/src/lib/api.ts`.
  - `react-router-dom`: routes in `client/src/App.tsx`, links/sidebar.
  - `@base-ui/react`: primitive UI components under `client/src/components/ui/*.tsx`.
  - `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`: styling pipeline and animation utilities.
  - `motion`: page/card/dialog animations in most `client/src/pages/*.tsx`.
  - `lucide-react`: icons in pages/components.
  - `sonner`: toast notifications via `client/src/components/ui/sonner.tsx`.
  - `recharts`: dashboard/recap/workout charts in `client/src/pages/Dashboard.tsx`, `client/src/components/RecapModal.tsx`, `client/src/components/CalorieRecapModal.tsx`, `client/src/components/WorkoutRecapModal.tsx`.
  - `react-markdown`: career topic notes preview in `client/src/pages/CareerTopic.tsx`.
  - `clsx`, `tailwind-merge`, `class-variance-authority`: class composition in `client/src/lib/utils.ts` and shadcn-style UI components.
- Key server libraries:
  - `express`: REST routes in `server/src/routes/*.ts`.
  - `mongoose`: Mongo schemas/models and payments transactions.
  - `cors`: open CORS in `server/src/index.ts`.
  - `dotenv`: server `.env` loading.
  - `ts-node-dev`: dev runner for `server/src/index.ts`.
- Build/run/test commands:
  - Client: `cd client && npm run dev`, `npm run build`, `npm run lint`, `npm run preview`.
  - Server: `cd server && npm run dev`, `npm run build`, `npm start`.
  - Actually run during this context pass: `client npm run build` passed; warnings: CSS `@import` ordering in `client/src/index.css`, chunk `dist/assets/index-*.js` >500 kB. `server npm run build` failed: `server/src/lib/targets.ts` imports missing `../models/Settings`.
  - Tests: None; no test scripts in `client/package.json` or `server/package.json`.

## Architecture
- Client entry: `client/src/main.tsx` renders `<ThemeProvider><App /></ThemeProvider>` under React `StrictMode`.
- App shell: `client/src/App.tsx` sets `BrowserRouter`, `SidebarProvider`, `AppSidebar`, sticky top bar, `ThemeToggle`, `Toaster`, and routes.
- Server entry: `server/src/index.ts` creates Express app, enables CORS/JSON, mounts `/api/*` route modules, connects Mongoose, then listens.
- Directory structure:
  - `client/`: Vite React SPA package.
  - `client/src/pages/`: feature pages; most data fetching and state lives here.
  - `client/src/components/`: app components, private gate, recap modals, theme provider.
  - `client/src/components/ui/`: generated/custom Base UI + Tailwind primitives.
  - `client/src/lib/`: Axios client, curriculum constants, `cn()` utility.
  - `client/src/hooks/`: mobile media hook used by sidebar.
  - `client/src/assets/`: unused Vite/react SVGs and `hero.png`.
  - `client/public/`: favicon and icons.
  - `server/`: Express/Mongoose API package.
  - `server/src/models/`: Mongoose schemas/models.
  - `server/src/routes/`: REST route modules grouped by feature.
  - `server/src/lib/`: date helpers plus broken/unused income target helpers.
- Route map:
  - `/` -> `client/src/pages/Dashboard.tsx`
  - `/income` -> `client/src/pages/Income.tsx`, wrapped by `client/src/components/PrivateRoute.tsx`
  - `/payments` -> `client/src/pages/Payments.tsx`, wrapped by `client/src/components/PrivateRoute.tsx`
  - `/tasks` -> `client/src/pages/Tasks.tsx`
  - `/today` -> `client/src/pages/Today.tsx`
  - `/calories` -> `client/src/pages/Calories.tsx`
  - `/fridge` -> `client/src/pages/Fridge.tsx`
  - `/foods` -> `client/src/pages/Foods.tsx`
  - `/workout` -> `client/src/pages/Workout.tsx`
  - `/career` -> `client/src/pages/Career.tsx`
  - `/career/:topicId` -> `client/src/pages/CareerTopic.tsx`
- Data flow example: calorie logging with fridge deduction:
  - User opens `client/src/pages/Calories.tsx`; page loads foods via `GET /foods`, day entries via `GET /calories/day`, water via `GET /calories/water/day`, cheat day via `GET /calories/cheat-day`, goals via `GET /calories/goal`.
  - User picks food in `FoodPickerDialog` in `client/src/pages/Calories.tsx`; `api.post("/calories", { date, foodId, meal, grams|units })`.
  - Server `server/src/routes/calories.ts` validates meal, loads `Food`, normalizes date via `server/src/lib/dates.ts::toDayUTC`.
  - For `Food.entryMode === "perUnit"` and `trackInFridge`, route loads `FridgeItem`, deducts up to requested units from `count`, stores `fridgeDeductedAtLog`.
  - Server creates `CalorieEntry` with food/macro snapshots so later food edits do not mutate history.
  - Client reloads day data and recent foods; dashboard later aggregates via `server/src/routes/dashboard.ts` and displays calorie/water/food data in `client/src/pages/Dashboard.tsx`.
- State management:
  - No Redux/query cache/global store. Page-local React `useState`, `useEffect`, `useMemo`, `useCallback`.
  - Shared cross-page state only through server persistence and localStorage.
  - Theme state in React context: `client/src/components/ThemeProvider.tsx`, `ThemeContext.ts`, `useTheme.ts`.
  - Sidebar state uses cookie `sidebar_state` in `client/src/components/ui/sidebar.tsx`.
  - Private gate stores expiry timestamp under localStorage key `private:unlocked-until` in `client/src/components/PrivateRoute.tsx`.
  - Dashboard money hiding stores localStorage key `dashboard:money-hidden` in `client/src/pages/Dashboard.tsx`.
- Async/background work:
  - Server has no schedulers/jobs/queues.
  - Client uses effects to fetch on mount/range/filter changes.
  - `client/src/pages/CareerTopic.tsx` autosaves notes/done state with an 800 ms debounce.
  - Several UI-only timers for confetti/flash animations in `client/src/pages/Income.tsx`, `Today.tsx`, `Payments.tsx`.
  - Payments uses MongoDB sessions/transactions in `server/src/routes/payments.ts`; requires a replica-set/transaction-capable Mongo deployment. See "Deployment requirements" below for the verified topology and the exact call sites.

## Deployment requirements

### MongoDB transactions are mandatory
`server/src/routes/payments.ts` wraps every balance-moving operation in a MongoDB
transaction via `mongoose.startSession()` + `session.withTransaction()`. Transactions
require a replica set or a sharded cluster. **A standalone `mongod` will fail these
endpoints** with `Transaction numbers are only allowed on a replica set member or
mongos`, meaning every expense, movement, and account creation breaks, while the
rest of the app keeps working. There is no non-transactional fallback path.

Transaction call sites in `server/src/routes/payments.ts`:

| Operation | Route | Why it needs atomicity |
| --- | --- | --- |
| Create account with opening balance | `POST /wallets`, `POST /banks` | Account row + its opening `adjustment` movement must commit together |
| Create expense (wallet-funded) | `POST /expenses` | Wallet balance decrement + `Expense` insert |
| Create expense (bank-funded) | `POST /expenses` | Bank balance decrement + `Expense` insert |
| Edit expense | `PATCH /expenses/:id` | Refund old source, deduct new source, update `Expense` |
| Delete expense | `DELETE /expenses/:id` | Refund source + soft-delete `Expense` |
| Create movement | `POST /movements` | Both account balances + `MoneyMovement` insert |
| Edit movement | `PATCH /movements/:id` | Reverse old balance effects, apply new ones, update the doc |
| Delete movement | `DELETE /movements/:id` | Reverse balance effects + soft-delete the doc |

Expense routes not listed here (`GET /expenses`, `GET /summary`) are read-only and
work on any topology.

### Current deployment, verified 2026-07-29
- API host: Render (`https://tracker-u98r.onrender.com/api`, hard-coded in `client/src/lib/api.ts`).
- Database: **MongoDB Atlas, 3-node replica set** `atlas-7p9y1s-shard-0`, MongoDB **8.0.28**.
  Driver reports topology `ReplicaSetWithPrimary`.
- **Transactions are supported.** Verified by opening a real transaction, writing, and
  aborting: the write rolled back cleanly and left nothing behind.
- Caveat: `MONGO_URI` uses the plain `mongodb://` scheme with an explicit 3-host seed
  list rather than `mongodb+srv://`. This works today, but it pins specific shard
  hostnames. If Atlas rotates or resizes nodes the seed list can go stale. Prefer the
  `mongodb+srv://` connection string, which resolves members via DNS SRV.
- If the database is ever moved (local `mongod`, a single-container Mongo, a
  budget host), it **must** be a replica set, even a single-node replica set
  (`rs.initiate()`) is enough. Plain standalone Mongo will break payments.

## Data Model
- `CalorieEntry` (`server/src/models/CalorieEntry.ts`), persisted in Mongo collection `calorieentries`:
  - `date: Date` indexed; `foodId: ObjectId ref Food`; `foodNameSnapshot: string`; `meal: "breakfast"|"lunch"|"dinner"|"snack"`; `entryMode: "perGram"|"perUnit"`.
  - Per-gram: `grams: number|null`; `caloriesPerGramSnapshot/proteinPerGramSnapshot/carbsPerGramSnapshot/fatPerGramSnapshot: number`.
  - Per-unit: `units: number|null`; `caloriesPerUnitSnapshot/proteinPerUnitSnapshot/carbsPerUnitSnapshot/fatPerUnitSnapshot: number`; `unitLabelSnapshot: string`.
  - `fridgeDeductedAtLog: number`; `deletedAt: Date|null`; timestamps.
  - Relationships: snapshots current `Food`; may deduct/refund `FridgeItem` counts.
- `Food` (`server/src/models/Food.ts`), persisted in Mongo:
  - `name: string`; `category: "protein"|"carbs"|"fats"|"vegetables"|"snacks"|"drinks"|"prepared"|"other"`; `entryMode: "perGram"|"perUnit"`; `trackInFridge: boolean`.
  - Per-gram nutrition: `caloriesPerGram/proteinPerGram/carbsPerGram/fatPerGram: number`; `defaultServingGrams: number|null`.
  - Per-unit nutrition: `caloriesPerUnit/proteinPerUnit/carbsPerUnit/fatPerUnit: number`; `unitLabel: string`.
  - `archived: boolean`; timestamps.
- `FridgeItem` (`server/src/models/FridgeItem.ts`), persisted in Mongo:
  - `foodId: ObjectId ref Food`, unique; `foodNameSnapshot: string`; `count: number`; `note: string`; timestamps.
- `CheatDay` (`server/src/models/CheatDay.ts`), persisted in Mongo:
  - `date: Date`, unique/indexed; `note: string`; timestamps.
- `WaterEntry` (`server/src/models/WaterEntry.ts`), persisted in Mongo:
  - `date: Date` indexed; `ml: number`; `deletedAt: Date|null`; timestamps.
- `Goal` (`server/src/models/Goal.ts`), singleton-style persisted in Mongo:
  - `caloriesTarget: number`; `caloriesBuffer: number`; `proteinMin: number`; `proteinMax: number`; `waterMin: number`; `waterTarget: number`; `waterMax: number`; timestamps.
- `IncomeEntry` (`server/src/models/IncomeEntry.ts`), persisted in Mongo:
  - `date: Date` indexed; `minutes: number`; `ratePerMinute: number`; `amount: number`; `note: string`; `deletedAt: Date|null`; timestamps.
  - Current implementation soft-deletes existing same-day active income entry before creating a new one in `server/src/routes/income.ts`.
- `Rate` (`server/src/models/Rate.ts`), persisted in Mongo:
  - `ratePerMinute: number`; `effectiveFrom: Date`; `effectiveTo: Date|null`; created timestamp only.
  - Active rate is document with `effectiveTo: null`.
- `DayStatus` (`server/src/models/DayStatus.ts`), persisted in Mongo:
  - `date: Date`, unique; `status: "vacation"|"sick"|"holiday"`; `note: string`; `createdAt` only.
  - Used for income off-day marks.
- `DayFlag` (`server/src/models/DayFlag.ts`), persisted if ever used, but no route imports it:
  - `date: Date`, unique; `dismissed: boolean`; `dismissedAt: Date|null`; timestamps.
  - Comment refers to below-minimum income/day target flags; feature appears abandoned.
- `Wallet` (`server/src/models/Wallet.ts`), persisted in Mongo:
  - `name: string`; `balance: number`; `currency: "EGP"|"USD"` (enum reuses `BANK_CURRENCIES` from `server/src/models/Bank.ts`, default `"EGP"`); `archived: boolean`; timestamps.
  - `balance` is a derived value. It is only ever changed by an `Expense` or a `MoneyMovement`; the API refuses a direct write (see Features → Payments).
  - `currency` was added after launch. `npm run migrate:wallet-currency` backfills pre-existing wallets to `EGP`.
- `Bank` (`server/src/models/Bank.ts`), persisted in Mongo:
  - `name: string`; `balance: number`; `currency: "EGP"|"USD"` (`BANK_CURRENCIES`, default `"EGP"`); `archived: boolean`; timestamps.
  - `balance` is derived, same rule as `Wallet`.
- `MoneyMovement` (`server/src/models/MoneyMovement.ts`), persisted in Mongo:
  - `type: "withdraw"|"deposit"|"transfer_bank"|"transfer_wallet"|"adjustment"|"family_in"` indexed.
  - From side: `fromType: "wallet"|"bank"|"external"|null`; `fromId: ObjectId|null`; `fromNameSnapshot`; `fromCurrencySnapshot`.
  - To side: `toType`; `toId`; `toNameSnapshot`; `toCurrencySnapshot`.
  - `amountFrom: number`; `amountTo: number`; `conversionRate: number`; `date: Date` indexed; `note: string`; `deletedAt: Date|null`; timestamps.
  - Enforced **at the schema level** by a `pre("validate")` hook, not only in the route: amounts must be finite, `conversionRate` finite and `> 0`, per-type from/to shape valid, amounts consistent with the conversion, and `fromId`/`toId` must reference existing accounts. The hook honours `this.$session()` so an account created inside the same transaction resolves correctly.
  - Shape rules live in `server/src/lib/movement-validation.ts` and are shared by the route and the schema, so the two cannot drift.
  - A `conversionRate` of `1` between two *different* currencies is rejected: it is arithmetically self-consistent but means the conversion was never applied.
- `Expense` (`server/src/models/Expense.ts`), persisted in Mongo:
  - `name: string`; `amount: number`; `category: "food"|"transport"|"bills"|"shopping"|"entertainment"|"health"|"education"|"other"`; `walletId: ObjectId ref Wallet`; `walletNameSnapshot: string`; `date: Date`; `deletedAt: Date|null`; timestamps.
  - Creation/update/delete adjusts wallet balances in `server/src/routes/payments.ts`.
- `Task` (`server/src/models/Task.ts`), persisted in Mongo:
  - `title: string`; `date: Date` indexed; `done: boolean`; `completedAt: Date|null`; timestamps.
- `WorkoutSession` (`server/src/models/WorkoutSession.ts`), persisted in Mongo:
  - `date: Date`, unique/indexed; `type: "A"|"B"|"rest"`.
  - A/B: `warmupMinutes: number`; `warmupDone: boolean`; `finisherMinutes: number`; `finisherDone: boolean`.
  - Rest: `walkMinutes: number`; `walkDistanceKm: number`.
  - Common: `completedAt: Date|null`; `note: string`; timestamps.
- `SetLog` (`server/src/models/SetLog.ts`), persisted in Mongo:
  - `sessionId: ObjectId ref WorkoutSession`, indexed; `exerciseId: string`; `setNumber: number`; `weight: number|null`; `reps: number|null`; `done: boolean`; timestamps.
  - Unique compound index `{ sessionId, exerciseId, setNumber }`.
  - `exerciseId` references hard-coded workout IDs in `client/src/pages/Workout.tsx`.
- `CareerTopic` (`server/src/models/CareerTopic.ts`), persisted in Mongo:
  - `topicId: string`, unique/indexed; `done: boolean`; `notes: string`; `startedAt: Date|null`; `completedAt: Date|null`; timestamps.
  - `topicId` joins to hard-coded curriculum in `client/src/lib/career-curriculum.ts`.
- Client-only derived/static types:
  - Curriculum phases/topics/categories in `client/src/lib/career-curriculum.ts`; 177 topics across 10 phases despite file header saying 172.
  - Workout exercise programs in `client/src/pages/Workout.tsx`; duplicated summary counts in `server/src/routes/dashboard.ts`.

## Features (current)
- Dashboard:
  - Aggregates today/month/last-7-day summaries for income, payments, tasks, calories, water, fridge, workout in `server/src/routes/dashboard.ts`.
  - Displays bento cards, charts, modals, local money hiding in `client/src/pages/Dashboard.tsx`.
- Income:
  - Set current per-minute USD rate; close previous active rates in `server/src/routes/income.ts`.
  - Log/edit/soft-delete one income entry per day; monthly/range views; mark off days as vacation/sick/holiday in `server/src/routes/income.ts` and `client/src/pages/Income.tsx`.
  - Private client-side password gate for `/income` via `client/src/components/PrivateRoute.tsx`.
- Payments:
  - Create/edit/archive wallets and banks in `server/src/routes/payments.ts` and `client/src/pages/Payments.tsx`.
  - **Balances are never edited directly.** `PATCH /payments/wallets/:id` and `PATCH /payments/banks/:id` reject a `balance` field with a 400. An account balance only changes through a logged `Expense` or `MoneyMovement`, so the Movements list is a complete audit trail.
    - Manual corrections stay possible: the edit dialog's "Correct balance" field computes the delta against the current balance and posts an `adjustment` `MoneyMovement` (`recordBalanceAdjustment` in `client/src/pages/Payments.tsx`), with an optional reason stored as the movement note.
    - A non-zero opening balance on account creation is applied the same way: the account is inserted at `0` and an `adjustment` movement noted `"Opening balance"` is committed in the same transaction.
    - Changing an account's currency is refused while its balance is non-zero, since that would silently reinterpret the stored amount.
  - Create/filter/edit/soft-delete expenses with category, source, date, search; source balance is adjusted transactionally in `server/src/routes/payments.ts`.
  - Weekly/monthly expense recap in `client/src/components/RecapModal.tsx` backed by `GET /api/payments/summary`.
  - Private client-side password gate for `/payments` via `client/src/components/PrivateRoute.tsx`.
- Tasks:
  - Calendar month view in `client/src/pages/Tasks.tsx` backed by `GET /api/tasks/month`.
  - Today-focused task list in `client/src/pages/Today.tsx` backed by `GET /api/tasks/day`.
  - Add/toggle/delete/move tasks to next day/tomorrow via `server/src/routes/tasks.ts`.
- Foods:
  - Food library with categories, per-gram/per-unit nutrition, default serving, archive instead of delete in `server/src/routes/foods.ts` and `client/src/pages/Foods.tsx`.
  - Per-unit foods can be marked `trackInFridge`.
- Calories/nutrition:
  - Daily calorie entries by meal, per-gram/per-unit input, food snapshots, edit/delete, recent foods in `server/src/routes/calories.ts` and `client/src/pages/Calories.tsx`.
  - Cheat day toggle stored in `CheatDay`; weekly summaries exclude cheat days in `server/src/routes/calories.ts`; UI in `client/src/components/CalorieRecapModal.tsx`.
  - Water logging quick-add/remove-last via `WaterEntry` in `server/src/routes/calories.ts` and `client/src/pages/Calories.tsx`.
  - Daily goals editable via singleton `Goal` in `server/src/routes/calories.ts` and `client/src/pages/Calories.tsx`.
- Fridge:
  - Track counts/notes for fridge-tracked foods; increment/decrement/edit/delete in `server/src/routes/fridge.ts` and `client/src/pages/Fridge.tsx`.
  - Calorie logging deducts/refunds fridge counts for tracked per-unit foods in `server/src/routes/calories.ts`.
- Workout:
  - Pick session by date; suggested alternating A/B based on last A/B session in `server/src/routes/workouts.ts`.
  - Hard-coded A upper and B lower programs in `client/src/pages/Workout.tsx`; rest day walk mode.
  - Log warmup/finisher, sets, weight, reps, done; last weight hints; complete/reopen/delete/change type via `server/src/routes/workouts.ts`.
  - History/progress modal in `client/src/components/WorkoutRecapModal.tsx` backed by `/api/workouts/stats` and `/api/workouts/exercise-progress`.
- Career:
  - Hard-coded AI engineering curriculum in `client/src/lib/career-curriculum.ts`.
  - Overview progress/search/streak/activity backed by `server/src/routes/career.ts` and shown in `client/src/pages/Career.tsx`.
  - Topic detail with markdown notes, preview, done checkbox, debounced autosave, prev/next in `client/src/pages/CareerTopic.tsx`; persisted as sparse `CareerTopic` docs.
- Theme/layout:
  - Light/dark/system theme context in `client/src/components/ThemeProvider.tsx`.
  - Sidebar/nav in `client/src/components/AppSidebar.tsx` and `client/src/components/ui/sidebar.tsx`.

## Conventions
- Files:
  - Client pages are PascalCase TSX under `client/src/pages/*.tsx`.
  - Client UI primitives are lowercase kebab files under `client/src/components/ui/*.tsx`.
  - Server models are PascalCase singular files under `server/src/models/*.ts`.
  - Server routes are lowercase feature files under `server/src/routes/*.ts`.
- Naming:
  - Mongoose models use singular PascalCase exports, e.g. `export const Food = model("Food", foodSchema)`.
  - Client local types are page-local `type Foo = { ... }`; no shared API contract types between client/server.
  - Date helpers use `YYYY-MM-DD` strings in client and UTC-midnight `Date` in server via `server/src/lib/dates.ts`.
  - Enums are mostly `as const` arrays in model files, duplicated as client union types/constants.
- Errors:
  - Server route handlers mostly use inline `400/404/409/500` JSON `{ error: string }`; no centralized error middleware and most async handlers have no outer `try/catch`.
  - Client pages repeat `getApiError(e)` with `AxiosError` extraction and display `toast.error`.
  - Some client catches intentionally swallow errors: `client/src/pages/Dashboard.tsx`, `client/src/components/PrivateRoute.tsx`.
- Config/secrets:
  - Server secrets from `server/.env` through dotenv; `.gitignore` excludes `.env`, but `server/.env` exists in workspace.
  - Client backend URL is hard-coded in `client/src/lib/api.ts`; no Vite env usage.
  - Private page password is hard-coded in client bundle in `client/src/components/PrivateRoute.tsx`.
- Lint/format:
  - Client ESLint config in `client/eslint.config.js`: JS recommended, TypeScript recommended, React Hooks, React Refresh; disables `react-hooks/set-state-in-effect` and `@typescript-eslint/no-explicit-any`.
  - Client TS config enables `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`; `strict` is not explicitly enabled in `client/tsconfig.app.json`.
  - Server TS config has `strict: true`.
  - No Prettier config.
- Testing:
  - None. No unit/integration/e2e test files discovered; no test scripts.
- UI:
  - Tailwind v4 CSS tokens in `client/src/index.css`; most pages use cards, motion animations, CSS variables.
  - Several generated shadcn/Base UI primitives still include `"use client"` comments from source templates.

## Rough Edges
- `server npm run build` currently fails because `server/src/lib/targets.ts` imports `../models/Settings`, but no `server/src/models/Settings.ts` exists. The file is not imported elsewhere, but it breaks TypeScript compilation because it is included by `server/tsconfig.json`.
- `server/src/models/DayFlag.ts` is not imported by any route. It references dismissed below-minimum flags, but no active settings/targets feature exists.
- `server/src/lib/targets.ts` looks like abandoned income target code. It references weekday/weekend USD targets and missing `Settings`.
- `client/src/components/PrivateRoute.tsx` contains literal password `2462`. This is not security; anyone with the built bundle can read it. It only gates UI routes and not server endpoints.
- `client/src/lib/api.ts` points to production Render URL, so local dev client talks to remote API unless code is edited. No `VITE_API_URL`.
- No authentication/authorization on server API. Private money pages are client-only gated; API endpoints remain public if deployed.
- `server/.env` exists in the workspace despite `.gitignore` excluding env files. Context doc intentionally does not include values.
- `client/src/index.css` has malformed comment text around workout colors in the light theme: `/* Workout colors /` and embedded `/ Upper - blue /`; despite build success, this is suspicious. Build emits CSS warning that Google Fonts `@import` must precede all rules because it appears after `@import "tailwindcss";`.
- `client/src/App.css` is leftover Vite template CSS and is not imported by `client/src/App.tsx`; dead file.
- `client/src/assets/react.svg`, `client/src/assets/vite.svg`, and likely `client/src/assets/hero.png` are not referenced in current source.
- `client/src/lib/career-curriculum.ts` header says "172 topics" but `TOTAL_TOPICS` is computed from 177 topic objects.
- Workout program is duplicated: exercise list/sets in `client/src/pages/Workout.tsx`; dashboard total set counts hard-coded separately in `server/src/routes/dashboard.ts`. Adding/changing exercises requires touching both or dashboard progress lies.
- Dashboard workout streak in `server/src/routes/dashboard.ts` counts any consecutive `WorkoutSession`, including rest days; unclear if desired.
- `server/src/routes/workouts.ts` suggestions ignore `rest` sessions and only alternate A/B based on last A/B. Rest days do not affect suggestion.
- `server/src/routes/workouts.ts` `changeType` path deletes sets only when changing to `rest`; changing A to B leaves existing set logs for A exercises attached to the session but hidden by B UI unless manually cleaned.
- `server/src/routes/workouts.ts` `last-weights` groups latest set by `createdAt`, not session date; editing old sessions later can make old data appear as latest.
- `server/src/routes/workouts.ts` `exercise-history` heaviest set sorts only by `weight`, no date tie-breaker, and includes all sessions including incomplete.
- `server/src/routes/payments.ts` uses MongoDB transactions with no fallback. The current Atlas replica set supports them (verified 2026-07-29, see "Deployment requirements"), so this is a constraint on any future move rather than a present-day bug.
- `server/src/routes/payments.ts` wallet archive does not prevent archived wallet IDs from being present on historical expenses, by design, but filtering only loads active wallets on client, so editing old expenses may fail if their wallet was archived.
- `server/src/routes/payments.ts` catches `err` unused in expense create; no structured logging.
- `server/src/routes/calories.ts` fridge deduction for per-unit tracked foods silently logs the full requested units even if fridge had fewer. `fridgeDeductedAtLog` stores partial deduction, but UI may imply full inventory consistency.
- `server/src/routes/calories.ts` editing a per-unit entry only adjusts fridge if `fridgeDeductedAtLog > 0`; if original log deducted 0 because stock was empty, increasing units later will not deduct even if stock now exists.
- `server/src/routes/calories.ts` `Promise.all([..., Goal.findOne() ?? Goal.create({})])` is suspicious: `Goal.findOne()` returns a query object, so nullish coalescing will not create a goal there. Other goal endpoints create one.
- `server/src/routes/income.ts` `POST /income/entry` soft-deletes all existing active entries for the day, so it enforces one income entry per day but model name suggests entries plural. Planner should not assume multi-session income per day exists.
- `server/src/routes/income.ts` day status accepts any `status` truthy value; it does not validate against `DayStatus` enum before `findOneAndUpdate`, so invalid enum errors bubble to Express.
- `client/src/components/ui/sonner.tsx` imports `useTheme` from `next-themes`, while app uses custom `ThemeProvider` in `client/src/components/ThemeProvider.tsx`. `next-themes` is installed, but no `NextThemesProvider` wraps the app. Toast theme may not match custom theme.
- No shared API/client types means server schema changes require manual updates in page-local TypeScript types.
- Many date calculations use `new Date(iso)` and UTC methods; generally consistent, but user timezone is not represented. "Today" comes from browser local `toISOString()` UTC date, not local calendar day, in most pages.
- No runtime request validation library. Server validates manually and inconsistently.
- No pagination. Dashboard/payment/food/task endpoints can grow unbounded except some recent/summary endpoints.
- `client npm run build` creates one large JS chunk around 1.4 MB minified; no route-level code splitting.
- `client/README.md` is untouched Vite template docs, not project docs.
- `client/index.html` title is `"client"`, not Life Tracker.

## Open Questions
- Is the abandoned targets/settings/day flag income feature still wanted, or should `server/src/lib/targets.ts` and `server/src/models/DayFlag.ts` be deleted?
- Should income allow multiple sessions per day, or is the one-entry-per-day overwrite/soft-delete behavior intentional?
- Should money privacy be real authentication, server-side auth, or is local client gating acceptable for this personal deployment?
- Should local development target localhost API through env config instead of the production Render URL?
- Should workout rest days count in streaks and/or influence A/B suggestions?
- Should changing a workout session from A to B delete incompatible old `SetLog` rows?
- ~~What is the intended Mongo deployment topology?~~ Answered 2026-07-29: MongoDB Atlas 3-node replica set (`atlas-7p9y1s-shard-0`, Mongo 8.0.28), transactions verified working. Remaining question is whether to switch `MONGO_URI` to the `mongodb+srv://` form so the seed host list cannot go stale.
- Are date boundaries supposed to follow UTC or the user's local timezone?
- Is the career curriculum count supposed to be 172 or 177?
- Are `node_modules` folders intentionally present in the workspace, or are they accidental local artifacts?
