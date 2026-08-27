import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { PICKER_LIMIT, type Page } from "../lib/pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { BarChart3, Cake, ChevronLeft, ChevronRight, Droplet, GripVertical, Minus, Plus, Search, ShoppingBasket, Target, Trash2 } from "lucide-react";
// Recharts is ~320 kB and only the recap needs it. Loading it lazily keeps it off
// the Calories page itself, which is the screen used several times a day.
const importRecap = () => import("../components/CalorieRecapModal");
const CalorieRecapModal = lazy(() => importRecap().then((m) => ({ default: m.CalorieRecapModal })));
import {
  MEALS,
  MEAL_LABELS,
  dayLabel,
  entryTotals,
  foodHeadlineCalories,
  foodHeadlineUnit,
  foodMacros,
  getApiError,
  mealForNow,
  quickLogAmount,
  round,
  round1,
  servingLabel,
  shiftDay,
  unitWord,
  type Entry,
  type Food,
  type Macros,
  type Meal,
} from "../lib/food";

const DRAG_FOOD_TYPE = "application/x-lifetracker-food";
const WATER_STEPS = [200, 300, 600, 1000];

type WaterRow = { _id: string; date: string; ml: number };
type CheatDay = { _id: string; date: string; note?: string } | null;
type Goal = {
  caloriesTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterMin: number;
  waterTarget: number;
  waterMax: number;
};

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: Math.min(i, 6) * 0.03 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function Calories() {
  const [date, setDate] = useState(todayISO);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [waters, setWaters] = useState<WaterRow[]>([]);
  const [cheat, setCheat] = useState<CheatDay>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMeal, setPendingMeal] = useState<Meal>("breakfast");
  const [pendingFood, setPendingFood] = useState<Food | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapMounted, setRecapMounted] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");

  const entriesRef = useRef<Entry[]>([]);
  const writeEntries = useCallback((next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);
  const watersRef = useRef<WaterRow[]>([]);
  const writeWaters = useCallback((next: WaterRow[]) => {
    watersRef.current = next;
    setWaters(next);
  }, []);

  const isToday = date === todayISO();

  const loadFoods = useCallback(async () => {
    try {
      const r = await api.get<Page<Food>>("/foods", { params: { limit: PICKER_LIMIT, offset: 0 } });
      setFoods(r.data.items);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const r = await api.get<{ foodId: string; count: number }[]>("/calories/recent-foods");
      setRecentIds(r.data.map((x) => x.foodId));
    } catch {
      /* recents are a convenience; do not shout if they fail */
    }
  }, []);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const [e, w, c] = await Promise.all([
        api.get<Entry[]>("/calories/day", { params: { date } }),
        api.get<WaterRow[]>("/calories/water/day", { params: { date } }),
        api.get<CheatDay>("/calories/cheat-day", { params: { date } }),
      ]);
      writeEntries(e.data);
      writeWaters(w.data);
      setCheat(c.data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [date, writeEntries, writeWaters]);

  const loadGoal = useCallback(async () => {
    try {
      const r = await api.get<Goal>("/calories/goal");
      setGoal(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    void loadFoods();
  }, [loadFoods]);
  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);
  useEffect(() => {
    void loadDay();
  }, [loadDay]);
  useEffect(() => {
    void loadGoal();
  }, [loadGoal]);

  // Warm the recap chunk once the page is idle, so it is cached before it is wanted.
  useEffect(() => {
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => void importRecap());
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => void importRecap(), 2500);
    return () => window.clearTimeout(id);
  }, []);

  const totals = useMemo<Macros>(
    () =>
      entries.reduce<Macros>(
        (acc, e) => {
          const t = entryTotals(e);
          return { cal: acc.cal + t.cal, p: acc.p + t.p, c: acc.c + t.c, f: acc.f + t.f };
        },
        { cal: 0, p: 0, c: 0, f: 0 },
      ),
    [entries],
  );

  const waterTotal = useMemo(() => waters.reduce((s, w) => s + w.ml, 0), [waters]);

  const byMeal = useMemo(() => {
    const map: Record<Meal, Entry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const e of entries) map[e.meal].push(e);
    return map;
  }, [entries]);

  const toggleCheat = async () => {
    const before = cheat;
    setCheat(before ? null : { _id: "pending", date });
    try {
      await api.put("/calories/cheat-day", { date, on: !before });
      void loadDay();
    } catch (e) {
      toast.error(getApiError(e));
      setCheat(before);
    }
  };

  const openPicker = (meal: Meal, food: Food | null = null) => {
    setPendingMeal(meal);
    setPendingFood(food);
    setPickerOpen(true);
    setShelfOpen(false);
  };

  /** One-tap log; falls back to the picker when the food has no default amount. */
  const quickLog = async (food: Food, meal: Meal) => {
    const amount = quickLogAmount(food);
    if (amount === null) {
      openPicker(meal, food);
      return;
    }
    try {
      const body = food.entryMode === "perUnit" ? { date, foodId: food._id, meal, units: amount } : { date, foodId: food._id, meal, grams: amount };
      const r = await api.post<Entry>("/calories", body);
      writeEntries([...entriesRef.current, r.data]);
      void loadRecent();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const patchEntry = async (entry: Entry, patch: { grams?: number; units?: number }) => {
    const before = entriesRef.current;
    writeEntries(before.map((x) => (x._id === entry._id ? { ...x, ...patch } : x)));
    try {
      await api.patch(`/calories/${entry._id}`, patch);
    } catch (e) {
      toast.error(getApiError(e));
      writeEntries(before);
    }
  };

  const deleteEntry = async (entry: Entry) => {
    const before = entriesRef.current;
    writeEntries(before.filter((x) => x._id !== entry._id));
    try {
      await api.delete(`/calories/${entry._id}`);
    } catch (e) {
      toast.error(getApiError(e));
      writeEntries(before);
    }
  };

  const addWater = async (ml: number) => {
    const optimistic: WaterRow = { _id: `pending-${Date.now()}`, date, ml };
    const before = watersRef.current;
    writeWaters([...before, optimistic]);
    try {
      const r = await api.post<WaterRow>("/calories/water", { date, ml });
      writeWaters(watersRef.current.map((w) => (w._id === optimistic._id ? r.data : w)));
    } catch (e) {
      toast.error(getApiError(e));
      writeWaters(before);
    }
  };

  const removeWater = async (row: WaterRow) => {
    const before = watersRef.current;
    writeWaters(before.filter((w) => w._id !== row._id));
    try {
      await api.delete(`/calories/water/${row._id}`);
    } catch (e) {
      toast.error(getApiError(e));
      writeWaters(before);
    }
  };

  // =====================================================================
  return (
    <div className="w-full max-w-[1400px] space-y-3">
      {/* ===== Date nav ===== */}
      <motion.nav {...fadeUp} aria-label="Select day" className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <button
          type="button"
          onClick={() => setDate(todayISO())}
          disabled={isToday}
          aria-label={isToday ? "Showing today" : `Showing ${dayLabel(date)}. Jump to today`}
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-medium transition-colors enabled:hover:border-border enabled:hover:bg-muted/60 disabled:cursor-default"
        >
          <span className="truncate">{dayLabel(date)}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jump to today</span>
          )}
        </button>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </motion.nav>

      {/* ===== Actions ===== */}
      <motion.div {...stagger(1)} className="flex flex-wrap items-center gap-2">
        <Button variant={cheat ? "default" : "outline"} size="sm" className="h-9" onClick={toggleCheat}>
          <Cake className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          {cheat ? "Cheat day on" : "Cheat day"}
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setGoalOpen(true)}>
          <Target className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Targets
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            setRecapMounted(true);
            setRecapOpen(true);
          }}
        >
          <BarChart3 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Recap
        </Button>
        {/* The shelf is a sidebar on desktop; on a phone it opens as a sheet. */}
        <Button variant="outline" size="sm" className="ml-auto h-9 xl:hidden" onClick={() => setShelfOpen(true)}>
          <Search className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Find food
        </Button>
      </motion.div>

      {loading || !goal ? (
        <CaloriesSkeleton />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            {/* ===== Day summary ===== */}
            <motion.section {...stagger(2)} aria-label="Day summary">
              <DaySummary totals={totals} goal={goal} cheat={!!cheat} />
            </motion.section>

            {/* ===== Water ===== */}
            <motion.section {...stagger(3)} aria-label="Water">
              <WaterCard total={waterTotal} goal={goal} waters={waters} onAdd={addWater} onRemove={removeWater} />
            </motion.section>

            {/* ===== Meals ===== */}
            <div className="grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-2">
              {MEALS.map((meal, i) => (
                <motion.div key={meal} {...stagger(i + 4)} className="min-w-0">
                  <MealCard
                    meal={meal}
                    entries={byMeal[meal]}
                    onAdd={() => openPicker(meal)}
                    onEdit={patchEntry}
                    onDelete={deleteEntry}
                    onFoodDrop={(food) => void quickLog(food, meal)}
                  />
                </motion.div>
              ))}
            </div>
          </div>

          {/* ===== Food shelf (desktop) ===== */}
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-0">
              <FoodShelf foods={foods} recentIds={recentIds} search={foodSearch} onSearchChange={setFoodSearch} onQuickLog={(food) => void quickLog(food, mealForNow())} onOpenPicker={(food) => openPicker(mealForNow(), food)} draggable />
            </div>
          </aside>
        </div>
      )}

      {/* ===== Food shelf (mobile sheet) ===== */}
      <Dialog open={shelfOpen} onOpenChange={setShelfOpen}>
        <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[560px] max-h-[88svh] overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Food shelf</DialogTitle>
          </DialogHeader>
          <div className="p-3">
            <FoodShelf bare foods={foods} recentIds={recentIds} search={foodSearch} onSearchChange={setFoodSearch} onQuickLog={(food) => void quickLog(food, mealForNow())} onOpenPicker={(food) => openPicker(mealForNow(), food)} />
          </div>
        </DialogContent>
      </Dialog>

      <FoodPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} foods={foods} recentIds={recentIds} meal={pendingMeal} date={date} initialFood={pendingFood} onLogged={(entry) => writeEntries([...entriesRef.current, entry])} onRecent={loadRecent} />
      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} goal={goal} onSaved={loadGoal} />
      {recapMounted && (
        <Suspense fallback={null}>
          <CalorieRecapModal open={recapOpen} onOpenChange={setRecapOpen} />
        </Suspense>
      )}
    </div>
  );
}

function CaloriesSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-[132px] rounded-xl" />
        <Skeleton className="h-[104px] rounded-xl" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="hidden h-[520px] rounded-xl xl:block" />
    </div>
  );
}

// =====================================================================
// DaySummary: the number that actually matters is what is left
// =====================================================================
function DaySummary({ totals, goal, cheat }: { totals: Macros; goal: Goal; cheat: boolean }) {
  const cal = Math.round(totals.cal);
  const left = goal.caloriesTarget - cal;
  const over = left < 0;
  const pct = goal.caloriesTarget > 0 ? Math.min((cal / goal.caloriesTarget) * 100, 100) : 0;

  return (
    <Card>
      <CardContent className="px-4 py-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cheat ? "Cheat day · not counted" : over ? "Over budget" : "Left today"}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{cheat ? cal : Math.abs(left)}</span>
              <span className="text-sm text-muted-foreground">cal</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {cal} of {goal.caloriesTarget} eaten
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <MacroStat label="Protein" value={totals.p} target={goal.proteinTarget} />
            <MacroStat label="Carbs" value={totals.c} target={goal.carbsTarget} />
            <MacroStat label="Fat" value={totals.f} target={goal.fatTarget} />
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div
            className={`h-full rounded-full ${over && !cheat ? "bg-foreground" : "bg-foreground"}`}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={over && !cheat ? { backgroundImage: "repeating-linear-gradient(45deg, var(--color-foreground) 0 6px, var(--color-muted-foreground) 6px 12px)" } : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MacroStat({ label, value, target }: { label: string; value: number; target: number }) {
  const v = round1(value);
  const pct = target > 0 ? Math.min((v / target) * 100, 100) : 0;
  return (
    <div className="min-w-[54px]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
        {v}
        <span className="text-[11px] font-normal text-muted-foreground">/{target}g</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// =====================================================================
// WaterCard
// =====================================================================
function WaterCard({ total, goal, waters, onAdd, onRemove }: { total: number; goal: Goal; waters: WaterRow[]; onAdd: (ml: number) => void; onRemove: (row: WaterRow) => void }) {
  const pct = goal.waterTarget > 0 ? Math.min((total / goal.waterTarget) * 100, 100) : 0;
  const hitMin = total >= goal.waterMin;

  return (
    <Card>
      <CardContent className="px-4 py-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Droplet className="h-3 w-3" aria-hidden />
              Water
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{(total / 1000).toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">L</span>
              <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">of {(goal.waterTarget / 1000).toFixed(1)}L</span>
            </div>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(pct)}% · {hitMin ? "minimum met" : `${((goal.waterMin - total) / 1000).toFixed(2)}L to minimum`}
          </div>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {WATER_STEPS.map((ml) => (
            <Button key={ml} variant="outline" size="sm" className="h-10 flex-1 font-mono text-xs tabular-nums" onClick={() => onAdd(ml)} aria-label={`Add ${ml} millilitres of water`}>
              +{ml}
            </Button>
          ))}
        </div>

        {waters.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
            {waters.map((w) => (
              <button
                key={w._id}
                type="button"
                onClick={() => onRemove(w)}
                aria-label={`Remove the ${w.ml} millilitre entry`}
                className="group inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {w.ml}
                <Trash2 className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// MealCard
// =====================================================================
function MealCard({
  meal,
  entries,
  onAdd,
  onEdit,
  onDelete,
  onFoodDrop,
}: {
  meal: Meal;
  entries: Entry[];
  onAdd: () => void;
  onEdit: (entry: Entry, patch: { grams?: number; units?: number }) => void;
  onDelete: (entry: Entry) => void;
  onFoodDrop: (food: Food) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const total = entries.reduce((s, e) => s + entryTotals(e).cal, 0);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOver(false);
    const raw = event.dataTransfer.getData(DRAG_FOOD_TYPE);
    if (!raw) return;
    try {
      onFoodDrop(JSON.parse(raw) as Food);
    } catch {
      toast.error("Could not read the dragged food.");
    }
  };

  return (
    <Card className={`h-full transition-colors ${isOver ? "ring-2 ring-foreground/40" : ""}`}>
      <CardContent className="flex h-full flex-col px-0 py-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 pb-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold">{MEAL_LABELS[meal]}</h2>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums">
              {round(total)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">cal</span>
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onAdd} aria-label={`Add food to ${MEAL_LABELS[meal]}`}>
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div
          className="flex flex-1 flex-col px-1.5 pt-1.5"
          onDragEnter={(e) => {
            e.preventDefault();
            setIsOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsOver(false);
          }}
          onDrop={handleDrop}
        >
          {entries.length === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="flex min-h-[92px] flex-1 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-muted/40"
            >
              Nothing logged, tap to add
            </button>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence initial={false}>
                {entries.map((e) => (
                  <EntryRow key={e._id} entry={e} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// EntryRow: adjust in place instead of opening a dialog for a number
// =====================================================================
function EntryRow({ entry, onEdit, onDelete }: { entry: Entry; onEdit: (entry: Entry, patch: { grams?: number; units?: number }) => void; onDelete: (entry: Entry) => void }) {
  const isUnit = entry.entryMode === "perUnit";
  const amount = isUnit ? (entry.units ?? 0) : (entry.grams ?? 0);
  const step = isUnit ? 1 : 25;
  const t = entryTotals(entry);
  const label = isUnit ? `${round1(amount)} ${entry.unitLabelSnapshot || "unit"}${amount === 1 ? "" : "s"}` : `${round(amount)}g`;

  const bump = (delta: number) => {
    const next = round1(Math.max(step, amount + delta));
    if (next === amount) return;
    onEdit(entry, isUnit ? { units: next } : { grams: next });
  };

  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.foodNameSnapshot}</div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {label} · {round(t.cal)} cal · P {round1(t.p)} C {round1(t.c)} F {round1(t.f)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
        <button type="button" onClick={() => bump(-step)} disabled={amount <= step} aria-label={`Less ${entry.foodNameSnapshot}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30">
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => bump(step)} aria-label={`More ${entry.foodNameSnapshot}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => onDelete(entry)} aria-label={`Remove ${entry.foodNameSnapshot}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}

// =====================================================================
// FoodShelf
// =====================================================================
function FoodShelf({
  foods,
  recentIds,
  search,
  onSearchChange,
  onQuickLog,
  onOpenPicker,
  draggable = false,
  bare = false,
}: {
  foods: Food[];
  recentIds: string[];
  search: string;
  onSearchChange: (v: string) => void;
  onQuickLog: (food: Food) => void;
  onOpenPicker: (food: Food) => void;
  draggable?: boolean;
  bare?: boolean;
}) {
  const recentFoods = useMemo(() => {
    const byId = new Map(foods.map((f) => [f._id, f]));
    return recentIds.map((id) => byId.get(id)).filter((f): f is Food => !!f);
  }, [foods, recentIds]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s) return foods.filter((f) => f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s));
    return recentFoods.length > 0 ? recentFoods : foods.slice(0, 20);
  }, [foods, recentFoods, search]);

  const heading = search.trim() ? "Results" : recentFoods.length > 0 ? "Frequently used" : "Your foods";

  const body = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="h-11 pl-9 text-base sm:text-sm" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search foods…" aria-label="Search foods" />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h2>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{visible.length}</span>
      </div>

      <div className={`mt-2 space-y-1.5 ${bare ? "" : "max-h-[calc(100svh-230px)] overflow-y-auto pr-1"}`}>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No foods match.</p>
        ) : (
          visible.map((food) => <FoodTile key={food._id} food={food} draggable={draggable} onQuickLog={() => onQuickLog(food)} onOpenPicker={() => onOpenPicker(food)} />)
        )}
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;

  return (
    <Card>
      <CardContent className="px-3 py-0">{body}</CardContent>
    </Card>
  );
}

// =====================================================================
// FoodTile: tap logs one serving, the chevron opens the full picker
// =====================================================================
function FoodTile({ food, draggable = false, onQuickLog, onOpenPicker }: { food: Food; draggable?: boolean; onQuickLog: () => void; onOpenPicker: () => void }) {
  const canQuickLog = quickLogAmount(food) !== null;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(DRAG_FOOD_TYPE, JSON.stringify(food));
      }}
      className={`group flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 transition-colors hover:border-border-strong ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {draggable && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-30 transition-opacity group-hover:opacity-70" aria-hidden />}

      <button type="button" onClick={canQuickLog ? onQuickLog : onOpenPicker} className="min-w-0 flex-1 text-left" aria-label={canQuickLog ? `Log ${servingLabel(food)} of ${food.name}` : `Choose an amount for ${food.name}`}>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{food.name}</span>
          {food.trackInFridge && <ShoppingBasket className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Tracked in the Kitchen" />}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {foodHeadlineCalories(food)} cal {foodHeadlineUnit(food)}
          {canQuickLog ? <span className="ml-1.5 text-muted-foreground/70">· tap for {servingLabel(food)}</span> : <span className="ml-1.5 text-muted-foreground/70">· pick an amount</span>}
        </div>
      </button>

      <button type="button" onClick={onOpenPicker} aria-label={`Choose a custom amount of ${food.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

// =====================================================================
// FoodPickerDialog
// =====================================================================
function FoodPickerDialog({
  open,
  onOpenChange,
  foods,
  recentIds,
  meal,
  date,
  initialFood,
  onLogged,
  onRecent,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  foods: Food[];
  recentIds: string[];
  meal: Meal;
  date: string;
  initialFood: Food | null;
  onLogged: (entry: Entry) => void;
  onRecent: () => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [amount, setAmount] = useState("");
  const [targetMeal, setTargetMeal] = useState<Meal>(meal);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPicked(initialFood);
    setTargetMeal(meal);
    setAmount(initialFood ? String(quickLogAmount(initialFood) ?? "") : "");
  }, [open, meal, initialFood]);

  const recentFoods = useMemo(() => {
    const byId = new Map(foods.map((f) => [f._id, f]));
    return recentIds.map((id) => byId.get(id)).filter((f): f is Food => !!f);
  }, [foods, recentIds]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return recentFoods.length > 0 ? recentFoods : foods;
    return foods.filter((f) => f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s));
  }, [foods, recentFoods, search]);

  const pick = (f: Food) => {
    setPicked(f);
    setAmount(String(quickLogAmount(f) ?? ""));
  };

  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0;
  const preview = picked && valid ? foodMacros(picked, n) : null;
  const isUnit = picked?.entryMode === "perUnit";
  const presets = isUnit ? [1, 2, 3] : [50, 100, 150, 200, 250];

  const save = async () => {
    if (!picked || !valid || saving) return;
    setSaving(true);
    try {
      const body = isUnit ? { date, foodId: picked._id, meal: targetMeal, units: n } : { date, foodId: picked._id, meal: targetMeal, grams: n };
      const r = await api.post<Entry>("/calories", body);
      onLogged(r.data);
      onRecent();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[560px] max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{picked ? picked.name : `Add to ${MEAL_LABELS[meal]}`}</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input className="h-11 pl-9 text-base sm:text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search foods…" aria-label="Search foods" autoFocus />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{search.trim() ? "Results" : recentFoods.length > 0 ? "Frequently used" : "All foods"}</div>
            <div className="max-h-[46svh] space-y-1.5 overflow-y-auto pr-1">
              {filtered.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No foods match.</p>}
              {filtered.map((f) => (
                <button key={f._id} type="button" onClick={() => pick(f)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-border-strong hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                      {foodHeadlineCalories(f)} cal {foodHeadlineUnit(f)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {isUnit
                ? `per ${unitWord(picked)}: ${round1(picked.caloriesPerUnit)} cal · P ${round1(picked.proteinPerUnit)} · C ${round1(picked.carbsPerUnit)} · F ${round1(picked.fatPerUnit)}`
                : `per 100g: ${round1(picked.caloriesPerGram * 100)} cal · P ${round1(picked.proteinPerGram * 100)} · C ${round1(picked.carbsPerGram * 100)} · F ${round1(picked.fatPerGram * 100)}`}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isUnit ? unitWord(picked, 2) : "Grams"}</Label>
                <Input type="number" inputMode="decimal" min="0" step={isUnit ? "1" : "5"} value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono tabular-nums" autoFocus />
                <div className="flex flex-wrap gap-1">
                  {presets.map((p) => (
                    <button key={p} type="button" onClick={() => setAmount(String(p))} className={`rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${String(p) === amount ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}>
                      {isUnit ? p : `${p}g`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meal</Label>
                <Select value={targetMeal} onValueChange={(v) => setTargetMeal((v ?? "breakfast") as Meal)}>
                  <SelectTrigger className="w-full !h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEALS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MEAL_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-3">
              <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                {preview ? round(preview.cal) : 0} <span className="text-sm font-normal text-muted-foreground">cal</span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                P {preview ? round1(preview.p) : 0}g · C {preview ? round1(preview.c) : 0}g · F {preview ? round1(preview.f) : 0}g
              </div>
            </div>
          </div>
        )}

        {picked && (
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" size="default" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button variant="default" size="default" onClick={save} disabled={!valid || saving}>
              Log to {MEAL_LABELS[targetMeal]}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// GoalDialog
// =====================================================================
function GoalDialog({ open, onOpenChange, goal, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; goal: Goal | null; onSaved: () => void }) {
  const [form, setForm] = useState<Record<keyof Goal, string>>({
    caloriesTarget: "2000",
    proteinTarget: "160",
    carbsTarget: "200",
    fatTarget: "70",
    waterMin: "2500",
    waterTarget: "3000",
    waterMax: "3500",
  });

  useEffect(() => {
    if (open && goal) {
      setForm({
        caloriesTarget: String(goal.caloriesTarget),
        proteinTarget: String(goal.proteinTarget),
        carbsTarget: String(goal.carbsTarget),
        fatTarget: String(goal.fatTarget),
        waterMin: String(goal.waterMin),
        waterTarget: String(goal.waterTarget),
        waterMax: String(goal.waterMax),
      });
    }
  }, [open, goal]);

  const set = (k: keyof Goal, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof Goal) => Number(form[k]);

  const save = async () => {
    const values = Object.fromEntries(Object.keys(form).map((k) => [k, num(k as keyof Goal)])) as Record<keyof Goal, number>;
    if (Object.values(values).some((v) => !Number.isFinite(v) || v < 0)) return toast.error("Every target must be zero or more");
    // The server rejects an out-of-order band; catching it here explains why.
    if (values.waterMin > values.waterTarget || values.waterTarget > values.waterMax) {
      return toast.error("Water needs min ≤ target ≤ max");
    }
    try {
      await api.patch("/calories/goal", values);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const field = (k: keyof Goal, label: string, suffix?: string) => (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </Label>
      <Input type="number" inputMode="numeric" min="0" value={form[k]} onChange={(e) => set(k, e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono tabular-nums" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[480px] max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Daily targets</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macros</div>
            <div className="grid grid-cols-2 gap-3">
              {field("caloriesTarget", "Calories")}
              {field("proteinTarget", "Protein", "g")}
              {field("carbsTarget", "Carbs", "g")}
              {field("fatTarget", "Fat", "g")}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Calories, carbs and fat are ceilings. Protein is a goal to reach.</p>
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Water (ml)</div>
            <div className="grid grid-cols-3 gap-3">
              {field("waterMin", "Min")}
              {field("waterTarget", "Target")}
              {field("waterMax", "Max")}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Must stay in order: min ≤ target ≤ max.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save}>
            Save targets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
