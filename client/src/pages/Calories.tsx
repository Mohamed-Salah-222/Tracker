import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Search, Snowflake, Trash2, Droplet, BarChart3, Target, Cake } from "lucide-react";
import { AxiosError } from "axios";
import { CalorieRecapModal } from "../components/CalorieRecapModal";

// ===== Types =====
type Meal = "breakfast" | "lunch" | "dinner" | "snack";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
type EntryMode = "perGram" | "perUnit";

type Food = {
  _id: string;
  name: string;
  category: string;
  entryMode: EntryMode;
  trackInFridge: boolean;
  caloriesPerGram: number;
  proteinPerGram: number;
  carbsPerGram: number;
  fatPerGram: number;
  defaultServingGrams: number | null;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  unitLabel: string;
};

type Entry = {
  _id: string;
  date: string;
  foodId: string;
  foodNameSnapshot: string;
  meal: Meal;
  entryMode: EntryMode;
  grams: number | null;
  units: number | null;
  caloriesPerGramSnapshot: number;
  proteinPerGramSnapshot: number;
  carbsPerGramSnapshot: number;
  fatPerGramSnapshot: number;
  caloriesPerUnitSnapshot: number;
  proteinPerUnitSnapshot: number;
  carbsPerUnitSnapshot: number;
  fatPerUnitSnapshot: number;
  unitLabelSnapshot: string;
};

type WaterRow = { _id: string; date: string; ml: number };
type CheatDay = { _id: string; date: string; note?: string } | null;
type Goal = {
  caloriesTarget: number;
  caloriesBuffer: number;
  proteinMin: number;
  proteinMax: number;
  waterMin: number;
  waterTarget: number;
  waterMax: number;
};

// ===== Helpers =====
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const todayISO = () => new Date().toISOString().slice(0, 10);

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function shiftDay(iso: string, by: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function entryTotals(e: Entry) {
  if (e.entryMode === "perUnit") {
    const n = e.units ?? 0;
    return {
      cal: n * e.caloriesPerUnitSnapshot,
      p: n * e.proteinPerUnitSnapshot,
      c: n * e.carbsPerUnitSnapshot,
      f: n * e.fatPerUnitSnapshot,
    };
  }
  const g = e.grams ?? 0;
  return {
    cal: g * e.caloriesPerGramSnapshot,
    p: g * e.proteinPerGramSnapshot,
    c: g * e.carbsPerGramSnapshot,
    f: g * e.fatPerGramSnapshot,
  };
}

// ===== Motion =====
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function Calories() {
  const [date, setDate] = useState(todayISO());
  const [foods, setFoods] = useState<Food[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [waters, setWaters] = useState<WaterRow[]>([]);
  const [cheat, setCheat] = useState<CheatDay>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMeal, setPendingMeal] = useState<Meal>("breakfast");
  const [recapOpen, setRecapOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  // ----- Loaders -----
  const loadFoods = useCallback(async () => {
    try {
      const r = await api.get<Food[]>("/foods");
      setFoods(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);
  const loadRecent = useCallback(async () => {
    try {
      const r = await api.get<{ foodId: string; count: number }[]>("/calories/recent-foods");
      setRecentIds(r.data.map((x) => x.foodId));
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);
  const loadDayData = useCallback(async () => {
    try {
      const [e, w, c] = await Promise.all([api.get<Entry[]>("/calories/day", { params: { date } }), api.get<WaterRow[]>("/calories/water/day", { params: { date } }), api.get<CheatDay>("/calories/cheat-day", { params: { date } })]);
      setEntries(e.data);
      setWaters(w.data);
      setCheat(c.data);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }, [date]);
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
    void loadDayData();
  }, [loadDayData]);
  useEffect(() => {
    void loadGoal();
  }, [loadGoal]);

  const reload = () => {
    void loadDayData();
    void loadRecent();
  };

  // ----- Computed -----
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => {
        const t = entryTotals(e);
        acc.cal += t.cal;
        acc.p += t.p;
        acc.c += t.c;
        acc.f += t.f;
        return acc;
      },
      { cal: 0, p: 0, c: 0, f: 0 },
    );
  }, [entries]);

  const waterTotal = waters.reduce((s, w) => s + w.ml, 0);

  const byMeal: Record<Meal, Entry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const e of entries) byMeal[e.meal].push(e);
  const mealTotal = (m: Meal) => byMeal[m].reduce((s, e) => s + entryTotals(e).cal, 0);

  // ----- Cheat day toggle -----
  const toggleCheat = async () => {
    try {
      await api.put("/calories/cheat-day", { date, on: !cheat });
      toast.success(cheat ? "Cheat day removed" : "Cheat day on. Logs won't count toward weekly totals.");
      void loadDayData();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  // ----- Navigation -----
  const isToday = date === todayISO();
  const dateLabel = useMemo(
    () =>
      new Date(date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    [date],
  );

  const openPicker = (meal: Meal) => {
    setPendingMeal(meal);
    setPickerOpen(true);
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Calories</h1>
          {cheat && <CheatBadge />}
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setGoalOpen(true)}>
            <Target className="h-3.5 w-3.5 mr-1.5" />
            Goals
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRecapOpen(true)}>
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Weekly recap
          </Button>
          <Button variant={cheat ? "default" : "outline"} size="sm" onClick={toggleCheat}>
            <Cake className="h-3.5 w-3.5 mr-1.5" />
            {cheat ? "Cheat day on" : "Cheat day"}
          </Button>
        </div>
      </motion.div>

      {/* ===== Date nav ===== */}
      <motion.div {...stagger(1)} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(shiftDay(date, 1))} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium ml-2 truncate flex items-center gap-2">
            {dateLabel}
            {isToday && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</span>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayISO())}>
          Today
        </Button>
      </motion.div>

      {/* ===== Goal bars ===== */}
      {goal && (
        <motion.div {...stagger(2)} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CalorieBar value={totals.cal} goal={goal} cheat={!!cheat} />
          <ProteinBar value={totals.p} goal={goal} cheat={!!cheat} />
          <WaterBar value={waterTotal} goal={goal} cheat={!!cheat} date={date} onChanged={loadDayData} waters={waters} />
        </motion.div>
      )}

      {/* ===== Secondary totals (carbs / fat) ===== */}
      <motion.div {...stagger(3)} className="grid grid-cols-2 gap-3">
        <SmallMacroCard label="Carbs" value={round1(totals.c)} colorVar="--color-carbs" cheat={!!cheat} />
        <SmallMacroCard label="Fat" value={round1(totals.f)} colorVar="--color-fat" cheat={!!cheat} />
      </motion.div>

      {/* ===== Meals ===== */}
      <div className="space-y-3">
        {MEALS.map((meal, i) => (
          <motion.div key={meal} {...stagger(i + 4)}>
            <MealCard meal={meal} entries={byMeal[meal]} total={mealTotal(meal)} onAdd={() => openPicker(meal)} onChanged={reload} />
          </motion.div>
        ))}
      </div>

      {/* ===== Dialogs ===== */}
      <FoodPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} foods={foods} recentIds={recentIds} meal={pendingMeal} date={date} onSaved={reload} />
      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} goal={goal} onSaved={loadGoal} />
      <CalorieRecapModal open={recapOpen} onOpenChange={setRecapOpen} />
    </div>
  );
}

// =====================================================================
// CheatBadge
// =====================================================================
function CheatBadge() {
  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-[11px] px-2 py-0.5 rounded border font-medium flex items-center gap-1"
      style={{
        color: "var(--color-meal-snack)",
        background: "var(--color-meal-snack-bg)",
        borderColor: "color-mix(in oklch, var(--color-meal-snack), transparent 70%)",
      }}
    >
      <Cake className="h-2.5 w-2.5" />
      Cheat day
    </motion.span>
  );
}

// =====================================================================
// CalorieBar
// =====================================================================
function CalorieBar({ value, goal, cheat }: { value: number; goal: Goal; cheat: boolean }) {
  const target = goal.caloriesTarget;
  const buffer = goal.caloriesBuffer;
  const v = Math.round(value);

  // Tier
  let tier: "under" | "ok" | "warn" | "over" = "under";
  if (v === 0) tier = "under";
  else if (v <= target) tier = "ok";
  else if (v <= target + buffer) tier = "warn";
  else tier = "over";

  const color = cheat ? "var(--color-muted-foreground)" : tier === "over" ? "var(--color-expense)" : tier === "warn" ? "var(--color-warning)" : tier === "ok" ? "var(--color-income)" : "var(--color-foreground)";

  const widthPct = Math.min((v / (target + buffer)) * 100, 100);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Calories</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">/{target}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <AnimatePresence mode="wait">
            <motion.span key={v} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color }}>
              {v}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs text-muted-foreground font-medium">cal</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%" }} />
        </div>
        {!cheat && tier === "over" && (
          <div className="text-[10px] mt-1.5 font-medium" style={{ color: "var(--color-expense)" }}>
            Over by {v - target} cal
          </div>
        )}
        {!cheat && tier === "warn" && (
          <div className="text-[10px] mt-1.5 font-medium" style={{ color: "var(--color-warning)" }}>
            Above target, within buffer
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// ProteinBar
// =====================================================================
function ProteinBar({ value, goal, cheat }: { value: number; goal: Goal; cheat: boolean }) {
  const v = round1(value);
  const inRange = v >= goal.proteinMin && v <= goal.proteinMax;
  const color = cheat ? "var(--color-muted-foreground)" : inRange ? "var(--color-income)" : "var(--color-foreground)";

  const widthPct = Math.min((v / goal.proteinMax) * 100, 100);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Protein</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {goal.proteinMin}–{goal.proteinMax}g
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <AnimatePresence mode="wait">
            <motion.span key={v} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color }}>
              {v}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs text-muted-foreground font-medium">g</span>
        </div>
        {/* Range bar with target zone highlighted */}
        <div className="mt-3 h-1.5 rounded-full overflow-hidden relative" style={{ background: "var(--color-muted)" }}>
          {/* Target zone */}
          <div
            className="absolute top-0 bottom-0 opacity-30"
            style={{
              left: `${(goal.proteinMin / goal.proteinMax) * 100}%`,
              width: `${((goal.proteinMax - goal.proteinMin) / goal.proteinMax) * 100}%`,
              background: "var(--color-income)",
            }}
          />
          {/* Progress */}
          <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%", position: "relative" }} />
        </div>
        {!cheat && (
          <div className="text-[10px] mt-1.5 font-medium" style={{ color: inRange ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
            {inRange ? "In target range" : v < goal.proteinMin ? `${round1(goal.proteinMin - v)}g to min` : `Above max range`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// WaterBar
// =====================================================================
function WaterBar({ value, goal, cheat, date, waters, onChanged }: { value: number; goal: Goal; cheat: boolean; date: string; waters: WaterRow[]; onChanged: () => void }) {
  const v = value;
  const inRange = v >= goal.waterTarget && v <= goal.waterMax;
  const aboveMin = v >= goal.waterMin;
  const color = cheat ? "var(--color-muted-foreground)" : inRange ? "var(--color-income)" : aboveMin ? "var(--color-water)" : "var(--color-foreground)";

  const widthPct = Math.min((v / goal.waterMax) * 100, 100);

  const add = async (ml: number) => {
    try {
      await api.post("/calories/water", { date, ml });
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const removeLast = async () => {
    if (waters.length === 0) return;
    const last = waters[waters.length - 1];
    try {
      await api.delete(`/calories/water/${last._id}`);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
            <Droplet className="h-2.5 w-2.5" style={{ color: "var(--color-water)" }} />
            Water
          </span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {(goal.waterTarget / 1000).toFixed(1)}–{(goal.waterMax / 1000).toFixed(1)}L
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <AnimatePresence mode="wait">
            <motion.span key={v} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color }}>
              {(v / 1000).toFixed(1)}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs text-muted-foreground font-medium">L</span>
        </div>
        {/* Bar with min and target markers */}
        <div className="mt-3 h-1.5 rounded-full overflow-hidden relative" style={{ background: "var(--color-muted)" }}>
          {/* target zone */}
          <div
            className="absolute top-0 bottom-0 opacity-30"
            style={{
              left: `${(goal.waterTarget / goal.waterMax) * 100}%`,
              width: `${((goal.waterMax - goal.waterTarget) / goal.waterMax) * 100}%`,
              background: "var(--color-income)",
            }}
          />
          <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%", position: "relative" }} />
        </div>
        {/* Quick add */}
        <div className="flex items-center gap-1 mt-3">
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] font-mono tabular-nums flex-1" onClick={() => add(200)}>
            +200
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] font-mono tabular-nums flex-1" onClick={() => add(300)}>
            +300
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] font-mono tabular-nums flex-1" onClick={() => add(600)}>
            +600
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={removeLast} disabled={waters.length === 0} aria-label="Undo last">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SmallMacroCard
// =====================================================================
function SmallMacroCard({ label, value, colorVar, cheat }: { label: string; value: number; colorVar: string; cheat: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold font-mono tabular-nums" style={{ color: cheat ? "var(--color-muted-foreground)" : `var(${colorVar})` }}>
              {value}
            </span>
            <span className="text-xs text-muted-foreground">g</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// MealCard
// =====================================================================
function MealCard({ meal, entries, total, onAdd, onChanged }: { meal: Meal; entries: Entry[]; total: number; onAdd: () => void; onChanged: () => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium capitalize px-2 py-0.5 rounded border"
              style={{
                color: `var(--color-meal-${meal})`,
                background: `var(--color-meal-${meal}-bg)`,
                borderColor: `color-mix(in oklch, var(--color-meal-${meal}), transparent 70%)`,
              }}
            >
              {meal}
            </span>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold font-mono tabular-nums">{round(total)}</span>
            <span className="text-xs text-muted-foreground">cal</span>
            <Button variant="outline" size="sm" className="h-7 ml-2" onClick={onAdd}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">Nothing logged.</div>
        ) : (
          <div className="space-y-0">
            <AnimatePresence initial={false}>
              {entries.map((e) => (
                <EntryRow key={e._id} entry={e} onChanged={onChanged} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// EntryRow
// =====================================================================
function EntryRow({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [value, setValue] = useState(entry.entryMode === "perUnit" ? (entry.units ?? 1).toString() : (entry.grams ?? 0).toString());

  const handleEditOpen = (next: boolean) => {
    if (next) {
      setValue(entry.entryMode === "perUnit" ? (entry.units ?? 1).toString() : (entry.grams ?? 0).toString());
    }
    setEditOpen(next);
  };

  const save = async () => {
    const n = parseFloat(value);
    if (!n || n <= 0) return toast.error("Invalid value");
    try {
      const body = entry.entryMode === "perUnit" ? { units: n } : { grams: n };
      await api.patch(`/calories/${entry._id}`, body);
      setEditOpen(false);
      toast.success("Updated");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/calories/${entry._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const t = entryTotals(entry);
  const unitText = entry.unitLabelSnapshot || "unit";
  const amountText = entry.entryMode === "perUnit" ? `${entry.units} ${unitText}${(entry.units ?? 0) > 1 ? "s" : ""}` : `${entry.grams}g`;

  return (
    <>
      <motion.button type="button" layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} onClick={() => handleEditOpen(true)} className="w-full flex items-center justify-between py-2 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate text-foreground">{entry.foodNameSnapshot}</span>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground rounded border border-foreground/30 px-1.5 py-0.5 flex-shrink-0">{amountText}</span>
        </div>
        <span className="text-sm font-semibold font-mono tabular-nums flex-shrink-0">
          {round(t.cal)} <span className="text-muted-foreground text-xs font-normal">cal</span>
        </span>
      </motion.button>

      <Dialog open={editOpen} onOpenChange={handleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.foodNameSnapshot}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{entry.entryMode === "perUnit" ? `${unitText}s` : "Grams"}</Label>
              <Input type="number" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono tabular-nums" />
            </div>
            <div className="rounded-md p-3 text-sm" style={{ background: "var(--color-muted)" }}>
              <div className="font-semibold font-mono tabular-nums">{round(t.cal)} cal</div>
              <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                P {round1(t.p)}g · C {round1(t.c)}g · F {round1(t.f)}g
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="default"
              onClick={() => {
                setEditOpen(false);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>{entry.foodNameSnapshot}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =====================================================================
// FoodPickerDialog
// =====================================================================
function FoodPickerDialog({ open, onOpenChange, foods, recentIds, meal, date, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; foods: Food[]; recentIds: string[]; meal: Meal; date: string; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState("");
  const [units, setUnits] = useState("1");
  const [meal2, setMeal2] = useState<Meal>(meal);

  // Reset state every time the dialog opens (or the meal changes while opening)
  useEffect(() => {
    if (open) {
      setSearch("");
      setPicked(null);
      setGrams("");
      setUnits("1");
      setMeal2(meal);
    }
  }, [open, meal]);

  const recentFoods = useMemo(() => {
    const byId = new Map(foods.map((f) => [f._id, f]));
    return recentIds.map((id) => byId.get(id)).filter((f): f is Food => !!f);
  }, [foods, recentIds]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return foods;
    return foods.filter((f) => f.name.toLowerCase().includes(s));
  }, [foods, search]);

  const pickFood = (f: Food) => {
    setPicked(f);
    if (f.entryMode === "perUnit") setUnits("1");
    else setGrams(f.defaultServingGrams?.toString() ?? "");
  };

  const save = async () => {
    if (!picked) return;
    try {
      const body: Record<string, unknown> = {
        date,
        foodId: picked._id,
        meal: meal2,
      };
      if (picked.entryMode === "perUnit") {
        const n = parseFloat(units);
        if (!n || n <= 0) return toast.error("Enter units");
        body.units = n;
      } else {
        const g = parseFloat(grams);
        if (!g || g <= 0) return toast.error("Enter grams");
        body.grams = g;
      }
      await api.post("/calories", body);
      toast.success("Logged");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  let previewCal = 0,
    previewP = 0,
    previewC = 0,
    previewF = 0;
  if (picked) {
    if (picked.entryMode === "perUnit") {
      const n = parseFloat(units) || 0;
      previewCal = round(n * picked.caloriesPerUnit);
      previewP = round1(n * picked.proteinPerUnit);
      previewC = round1(n * picked.carbsPerUnit);
      previewF = round1(n * picked.fatPerUnit);
    } else {
      const g = parseFloat(grams) || 0;
      previewCal = round(g * picked.caloriesPerGram);
      previewP = round1(g * picked.proteinPerGram);
      previewC = round1(g * picked.carbsPerGram);
      previewF = round1(g * picked.fatPerGram);
    }
  }

  const pickedUnitText = picked?.unitLabel || "unit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[680px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{picked ? picked.name : "Pick a food"}</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search foods..." autoFocus />
            </div>

            {!search && recentFoods.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recent</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {recentFoods.map((f) => (
                    <FoodTile key={f._id} food={f} onClick={() => pickFood(f)} />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{search ? "Results" : "All foods"}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {filtered.length === 0 && <p className="col-span-full text-muted-foreground text-sm py-2">No foods match.</p>}
                {filtered.map((f) => (
                  <FoodTile key={f._id} food={f} onClick={() => pickFood(f)} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground font-mono tabular-nums">
              {picked.entryMode === "perUnit" ? `per ${pickedUnitText}: ${round1(picked.caloriesPerUnit)} cal · P ${round1(picked.proteinPerUnit)} · C ${round1(picked.carbsPerUnit)} · F ${round1(picked.fatPerUnit)}` : `per 100g: ${round1(picked.caloriesPerGram * 100)} cal · P ${round1(picked.proteinPerGram * 100)} · C ${round1(picked.carbsPerGram * 100)} · F ${round1(picked.fatPerGram * 100)}`}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {picked.entryMode === "perUnit" ? (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{pickedUnitText}s</Label>
                  <Input type="number" step="1" min="1" value={units} onChange={(e) => setUnits(e.target.value)} className="font-mono tabular-nums" autoFocus />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Grams</Label>
                  <Input type="number" step="1" value={grams} onChange={(e) => setGrams(e.target.value)} className="font-mono tabular-nums" autoFocus />
                  {picked.defaultServingGrams && <p className="text-[10px] text-muted-foreground">Default: {picked.defaultServingGrams}g</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meal</Label>
                <Select value={meal2} onValueChange={(v) => setMeal2((v ?? "breakfast") as Meal)}>
                  <SelectTrigger className="w-full !h-8 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEALS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {previewCal > 0 && (
              <div className="rounded-md p-3" style={{ background: "var(--color-muted)" }}>
                <div className="text-2xl font-semibold font-mono tabular-nums tracking-tight">
                  {previewCal} <span className="text-sm text-muted-foreground font-normal">cal</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                  P {previewP}g · C {previewC}g · F {previewF}g
                </div>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              ← Pick a different food
            </Button>
          </div>
        )}

        {picked && (
          <DialogFooter>
            <Button variant="default" size="default" onClick={save}>
              Log
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// FoodTile
// =====================================================================
function FoodTile({ food, onClick }: { food: Food; onClick: () => void }) {
  const unitText = food.unitLabel || "unit";
  const cal = food.entryMode === "perUnit" ? round1(food.caloriesPerUnit) : round1(food.caloriesPerGram * 100);
  const unitDesc = food.entryMode === "perUnit" ? `/ ${unitText}` : "/ 100g";
  return (
    <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={onClick} className="text-left border border-border bg-card rounded-md p-2.5 hover:border-border-strong transition-colors">
      <div className="text-xs font-medium truncate flex items-center gap-1 text-foreground">
        {food.name}
        {food.trackInFridge && <Snowflake className="h-2.5 w-2.5 flex-shrink-0" style={{ color: "var(--color-water)" }} />}
      </div>
      <div className="text-[10px] text-muted-foreground font-mono tabular-nums mt-0.5">
        {cal} cal {unitDesc}
      </div>
    </motion.button>
  );
}

// =====================================================================
// GoalDialog
// =====================================================================
function GoalDialog({ open, onOpenChange, goal, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; goal: Goal | null; onSaved: () => void }) {
  const [calT, setCalT] = useState("2000");
  const [calB, setCalB] = useState("100");
  const [pMin, setPMin] = useState("160");
  const [pMax, setPMax] = useState("180");
  const [wMin, setWMin] = useState("2500");
  const [wTarget, setWTarget] = useState("3000");
  const [wMax, setWMax] = useState("3500");

  const handleOpenChange = (next: boolean) => {
    if (next && goal) {
      setCalT(goal.caloriesTarget.toString());
      setCalB(goal.caloriesBuffer.toString());
      setPMin(goal.proteinMin.toString());
      setPMax(goal.proteinMax.toString());
      setWMin(goal.waterMin.toString());
      setWTarget(goal.waterTarget.toString());
      setWMax(goal.waterMax.toString());
    }
    onOpenChange(next);
  };

  const save = async () => {
    try {
      await api.patch("/calories/goal", {
        caloriesTarget: parseFloat(calT) || 0,
        caloriesBuffer: parseFloat(calB) || 0,
        proteinMin: parseFloat(pMin) || 0,
        proteinMax: parseFloat(pMax) || 0,
        waterMin: parseFloat(wMin) || 0,
        waterTarget: parseFloat(wTarget) || 0,
        waterMax: parseFloat(wMax) || 0,
      });
      toast.success("Goals updated");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Daily goals</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Calories */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Calories</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Target</Label>
                <Input type="number" value={calT} onChange={(e) => setCalT(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Buffer</Label>
                <Input type="number" value={calB} onChange={(e) => setCalB(e.target.value)} className="font-mono tabular-nums" />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">Warning above target, red above target+buffer.</div>
          </div>

          <div className="border-t border-border" />

          {/* Protein */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Protein range (g)</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Min</Label>
                <Input type="number" value={pMin} onChange={(e) => setPMin(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Max</Label>
                <Input type="number" value={pMax} onChange={(e) => setPMax(e.target.value)} className="font-mono tabular-nums" />
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Water */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Water (ml)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Min</Label>
                <Input type="number" value={wMin} onChange={(e) => setWMin(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Target</Label>
                <Input type="number" value={wTarget} onChange={(e) => setWTarget(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Max</Label>
                <Input type="number" value={wMax} onChange={(e) => setWMax(e.target.value)} className="font-mono tabular-nums" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="default" size="default" onClick={save}>
            Save goals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
