import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { getApiError } from "../lib/food";

// A year of history and every habit's whole life. Only wanted when asked for, so it
// stays out of the bundle until the button is pressed.
const DashboardRecapModal = lazy(() => import("../components/DashboardRecapModal"));
import { todayISO } from "../lib/today";
import {
  BarChart3,
  Beef,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Dumbbell,
  Flame,
  HandHeart,
  History,
  FolderKanban,
  Footprints,
  Languages,
  ListChecks,
  Moon,
  Pill,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";

type Day = {
  iso: string;
  label: string;
  day: number;
  weekend: boolean;
  week: number;
  active: boolean;
};

type DailyCell = {
  date: string;
  checked: boolean;
  completed: boolean;
  editable: boolean;
  state?: "done" | "excused" | null;
  detail?: string | null;
  value?: number;
  target?: number;
};

type AmountCell = {
  date: string;
  amount: number;
  checked: boolean;
  completed: boolean;
  editable: boolean;
  target: number;
  weekend: boolean;
  state?: "done" | "excused" | null;
  detail?: string | null;
};

type TrackerCellState = "done" | "excused" | null;

type TrackerRow = {
  id: string;
  label: string;
  description: string;
  icon: string;
  kind: "daily-check" | "target-count" | "steps-count" | "work-money";
  percent: number;
  goal: number;
  actual: number;
  left: number;
  doneCount?: number;
  cells: DailyCell[] | AmountCell[];
};

type DashboardResponse = {
  today: string;
  month: {
    key: string;
    label: string;
    start: string;
    end: string;
    days: Day[];
  };
  metrics: {
    overallPercent: number;
    completedRows: number;
    totalRows: number;
    totalGoal: number;
    totalActual: number;
    goalsLeft: number;
    gymCount: number;
    workHours: number;
    /** percent is null for a day still to come, or one where everything was skipped. */
    dayProgress: { date: string; day: number; label: string; percent: number | null; done: number; judged: number; skipped: number; future: boolean }[];
    earliestMonth: string;
  };
  kitchen?: {
    tracked: number;
    out: number;
    low: number;
    /** Free-text lines on the to-buy list that are not tracked foods. */
    manual: number;
    toBuy: number;
    items: { id: string; kind: "stock" | "manual"; label: string; detail: string; status: "out" | "low" | "ok" | "manual"; done: boolean }[];
  };
  rows: TrackerRow[];
};

type AmountEdit = {
  row: TrackerRow;
  cell: DailyCell | AmountCell;
  title: string;
  label: string;
  placeholder: string;
  target: number;
};

const LEGACY_VISIBILITY_KEY = "lifetracker.dashboard.visibleRows.v5";
/**
 * What to hide, rather than what to show. The old list named every row it wanted, so
 * a habit created afterwards was missing from the grid with nothing to explain why,
 * and it still named projectMedical and projectGym months after those were renamed.
 */
const TRACKER_HIDDEN_KEY = "lifetracker.dashboard.hiddenRows.v1";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const iconMap = {
  moon: Moon,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
  hands: HandHeart,
  languages: Languages,
  "calendar-check": CalendarCheck,
  "list-checks": ListChecks,
  "folder-kanban": FolderKanban,
  pill: Pill,
  footprints: Footprints,
  "briefcase-business": BriefcaseBusiness,
  beef: Beef,
  droplet: Droplets,
  flame: Flame,
  "check-square": CheckSquare,
};

const ACCENT_TONE = { base: "#18181b", dark: "#000000", soft: "#d4d4d4", faint: "#f5f5f5", ring: "#a3a3a3" };
const ROW_CHROME = { base: "#262626", dark: "#171717" };

// Every row currently shares one accent; kept as a function so per-row tones can
// come back without touching the call sites.
function trackerTone() {
  return ACCENT_TONE;
}

function readHiddenRows(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRACKER_HIDDEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
    }
    // Nothing hidden by default. The old allow-list is dropped rather than inverted:
    // it cannot be inverted without knowing every row, and it named keys that no
    // longer exist.
    window.localStorage.removeItem(LEGACY_VISIBILITY_KEY);
    return [];
  } catch {
    return [];
  }
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyToNumber(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return year * 12 + month;
}

function displayNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function getCell(row: TrackerRow, date: string) {
  return row.cells.find((cell) => cell.date === date);
}

function isAmountCell(cell: DailyCell | AmountCell): cell is AmountCell {
  return "amount" in cell;
}

function formatAnalysisValue(row: TrackerRow, value: number) {
  if (row.id === "work") return `$${displayNumber(value)}`;
  return displayNumber(value);
}

function monthGridTemplate(dayCount: number) {
  return `170px repeat(${dayCount}, minmax(32px, 1fr))`;
}

function monthGridMinWidth(dayCount: number) {
  return 170 + dayCount * 32;
}

function weekGroups(days: Day[]) {
  const groups: { week: number; days: Day[] }[] = [];
  for (const day of days) {
    const current = groups[groups.length - 1];
    if (!current || current.week !== day.week) groups.push({ week: day.week, days: [day] });
    else current.days.push(day);
  }
  return groups;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [amountEdit, setAmountEdit] = useState<AmountEdit | null>(null);
  const [amountValue, setAmountValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapMounted, setRecapMounted] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>(readHiddenRows);

  const load = useCallback(async () => {
    // The local calendar day travels with the request. Left to its own UTC clock the
    // server called it yesterday for the hours local time runs ahead, which moved the
    // highlighted day and made the calorie rule judge the wrong one.
    const params = new URLSearchParams({ today: todayISO() });
    if (monthKey) params.set("month", monthKey);
    const res = await api.get<DashboardResponse>(`/dashboard?${params.toString()}`);
    setData(res.data);
  }, [monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    window.localStorage.setItem(TRACKER_HIDDEN_KEY, JSON.stringify(hiddenIds));
  }, [hiddenIds]);

  // `data?.rows ?? []` built a fresh array on every render while data was null,
  // so it never matched as a dependency and every downstream useMemo recomputed.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const visibleRows = useMemo(() => {
    const shown = rows.filter((row) => !hiddenIds.includes(row.id));
    return shown.length ? shown : rows;
  }, [rows, hiddenIds]);

  const visibleStats = useMemo(() => {
    const totalGoal = visibleRows.reduce((sum, row) => sum + row.goal, 0);
    const totalActual = visibleRows.reduce((sum, row) => sum + Math.min(row.actual, row.goal), 0);
    const overallPercent = visibleRows.length ? Math.round(visibleRows.reduce((sum, row) => sum + Math.min(row.percent, 100), 0) / visibleRows.length) : 0;
    const completedRows = visibleRows.filter((row) => row.percent >= 100).length;
    const misses = visibleRows
      .filter((row) => row.left > 0)
      .map((row) => ({ id: row.id, label: row.label, left: row.left, percent: row.percent }))
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 5);
    const topHabits = [...visibleRows].sort((a, b) => b.percent - a.percent).slice(0, 10);
    return { totalGoal, totalActual, overallPercent, completedRows, misses, topHabits };
  }, [visibleRows]);

  /**
   * Recomputed here rather than taken from the server so hiding a row changes the
   * chart. Same rule as the server's copy: a skip is neutral and a day still to come
   * is not scored, because counting `checked` made a day of ten skips read 100%.
   */
  const dayProgress = useMemo<DashboardResponse["metrics"]["dayProgress"]>(() => {
    if (!data) return [];
    const localToday = todayISO();
    return data.month.days.map((day) => {
      let done = 0;
      let judged = 0;
      let skipped = 0;
      for (const row of visibleRows) {
        const cell = getCell(row, day.iso);
        if (!cell?.editable) continue;
        if (cell.state === "excused") {
          skipped++;
          continue;
        }
        judged++;
        if (cell.state === "done") done++;
      }
      const future = day.iso > localToday;
      return {
        date: day.iso,
        day: day.day,
        label: day.label,
        percent: future || judged === 0 ? null : Math.round((done / judged) * 100),
        done,
        judged,
        skipped,
        future,
      };
    });
  }, [data, visibleRows]);

  const dailyStats = useMemo(() => {
    if (!data) return { completed: 0, total: visibleRows.length };
    // The browser's local calendar day, not the server's UTC one: they disagree for
    // the hours local time runs ahead of UTC, which made this count yesterday's ticks.
    const localToday = todayISO();
    const todayInMonth = data.month.days.some((day) => day.iso === localToday);
    const date = todayInMonth ? localToday : null;
    if (!date) return { completed: 0, total: visibleRows.length };
    const completed = visibleRows.reduce((sum, row) => {
      const cell = getCell(row, date);
      return sum + (cell?.checked ? 1 : 0);
    }, 0);
    return { completed, total: visibleRows.length };
  }, [data, visibleRows]);

  const monthGroups = useMemo(() => (data ? weekGroups(data.month.days) : []), [data]);
  const monthWeekStartDates = useMemo(() => new Set(monthGroups.map((group) => group.days[0]?.iso).filter(Boolean)), [monthGroups]);

  const setCellState = async (row: TrackerRow, cell: DailyCell | AmountCell, state: TrackerCellState) => {
    if (!cell.editable) return;
    const nextChecked = state === "done" || state === "excused";
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((candidate) =>
          candidate.id === row.id
            ? {
                ...candidate,
                cells: candidate.cells.map((candidateCell) =>
                  candidateCell.date === cell.date
                    ? {
                        ...candidateCell,
                        checked: nextChecked,
                        completed: state === "done",
                        state,
                        ...(isAmountCell(candidateCell) ? { amount: state === "excused" ? 0 : candidateCell.amount } : {}),
                      }
                    : candidateCell,
                ),
              }
            : candidate,
        ),
      };
    });
    await api.put(`/dashboard/tracker/${row.id}/${cell.date}`, { checked: nextChecked, state, ...(isAmountCell(cell) ? { amount: state === "excused" ? 0 : cell.amount } : {}) });
    await load();
  };

  const openAmount = (row: TrackerRow, cell: DailyCell | AmountCell) => {
    const current = isAmountCell(cell) ? cell.amount : cell.value;
    setAmountValue(current ? String(current) : "");
    setAmountEdit({
      row,
      cell,
      // Named after the row rather than assuming every number row is Steps.
      title: row.kind === "work-money" ? "Log work" : `Log ${row.label}`,
      label: row.kind === "work-money" ? "Money made" : row.label,
      placeholder: row.kind === "work-money" ? "40" : String(isAmountCell(cell) ? cell.target : (cell.target ?? 1)),
      target: isAmountCell(cell) ? cell.target : cell.target ?? 1,
    });
  };

  const saveAmount = async () => {
    if (!amountEdit) return;
    const amount = Number(amountValue || 0);
    await api.put(`/dashboard/tracker/${amountEdit.row.id}/${amountEdit.cell.date}`, { checked: amount > 0, amount, state: amount > 0 ? "done" : null });
    setAmountEdit(null);
    await load();
  };

  const toggleVisible = (rowId: string) => {
    setHiddenIds((current) => (current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]));
  };

  if (!data) {
    return (
      <div className="w-full max-w-[1680px] flex flex-col gap-3 rounded-[18px] md:rounded-[24px] border border-border bg-card p-2.5 md:p-4" aria-busy="true" aria-label="Loading the tracker">
        <div className="flex items-end justify-between gap-3">
          <Skeleton className="h-10 w-56 rounded-lg" />
          <Skeleton className="h-8 w-64 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.15fr_0.8fr_230px_230px]">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  const isAtMinMonth = monthKeyToNumber(data.month.key) <= monthKeyToNumber(data.metrics.earliestMonth);

  return (
    <div className="w-full max-w-[1680px] md:max-h-[calc(100svh-3rem)] flex flex-col gap-3 overflow-visible md:overflow-hidden rounded-[18px] md:rounded-[24px] border border-border bg-card p-2.5 md:p-4 text-foreground shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <motion.div {...fadeUp} className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">Habit Tracker</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1 text-foreground">{data.month.label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-md border-border bg-card text-foreground shadow-sm hover:bg-muted" disabled={isAtMinMonth} onClick={() => setMonthKey(shiftMonth(data.month.key, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="h-8 rounded-md border border-border bg-card px-3.5 flex items-center text-xs font-semibold shadow-sm min-w-36 justify-center text-foreground">{data.month.label}</div>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-md border-border bg-card text-foreground shadow-sm hover:bg-muted" onClick={() => setMonthKey(shiftMonth(data.month.key, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 rounded-md border-border bg-card px-3 text-xs text-foreground shadow-sm hover:bg-muted"
            onClick={() => {
              setRecapMounted(true);
              setRecapOpen(true);
            }}
          >
            <History className="h-3.5 w-3.5" />
            Recap
          </Button>
          <Button variant="outline" className="h-8 rounded-md border-border bg-card px-3 text-xs text-foreground shadow-sm hover:bg-muted" onClick={() => setGoalsOpen(true)}>
            <Target className="h-3.5 w-3.5" />
            Goals
          </Button>
          <Button variant="outline" className="h-8 rounded-md border-border bg-card px-3 text-xs text-foreground shadow-sm hover:bg-muted" onClick={() => setPickerOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Trackers
          </Button>
        </div>
      </motion.div>

      <motion.div {...fadeUp} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.15fr_0.8fr_230px_230px] gap-3 items-stretch">
        <ChartPanel title="Daily Progress" icon={BarChart3}>
          <DailyProgressChart items={dayProgress} />
        </ChartPanel>
        <ChartPanel title="Weekly Blocks" icon={CalendarCheck}>
          <WeekStrip days={data.month.days} progress={dayProgress} />
        </ChartPanel>
        <ProgressDonut percent={visibleStats.overallPercent} completed={dailyStats.completed} total={dailyStats.total} />
        <KitchenRing kitchen={data.kitchen} />
      </motion.div>

      <motion.div {...fadeUp} className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_256px] gap-3 items-start">
        <Card className="overflow-hidden py-0 gap-0 rounded-xl min-w-0 border-border bg-card shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <CardContent className="p-0">
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="w-full" style={{ minWidth: monthGridMinWidth(data.month.days.length) }}>
                <div className="grid items-stretch border-b border-border bg-muted text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: monthGridTemplate(data.month.days.length) }}>
                  <div className="px-3 md:px-4 py-2 border-r border-white/10 bg-neutral-900 text-white row-span-3 flex items-center justify-center text-center text-sm md:text-base font-bold tracking-tight">My Habits</div>
                  {monthGroups.map((group) => (
                    <div key={group.week} className="h-7 flex items-center justify-center text-center border-r border-white/15 bg-neutral-800 text-white" style={{ gridColumn: `span ${group.days.length}` }}>
                      Week {group.week}
                    </div>
                  ))}
                  {data.month.days.map((day, index) => (
                    <div key={`${day.iso}-label`} className={`h-7 flex items-center justify-center border-r border-t border-white/15 text-[11px] font-semibold normal-case bg-neutral-700 text-neutral-50 ${index === 0 || monthWeekStartDates.has(day.iso) ? "border-l border-l-white/25" : ""} ${!day.active ? "opacity-70" : ""}`}>
                      {day.label.slice(0, 2)}
                    </div>
                  ))}
                  {data.month.days.map((day, index) => (
                    <div key={`${day.iso}-number`} className={`h-7 flex items-center justify-center border-r border-t border-white/15 text-[11px] font-semibold tabular-nums bg-neutral-600 text-neutral-50 ${index === 0 || monthWeekStartDates.has(day.iso) ? "border-l border-l-white/25" : ""} ${!day.active ? "opacity-70" : ""}`}>
                      {day.day}
                    </div>
                  ))}
                </div>
                {visibleRows.map((row) => (
                  <TrackerRowView key={row.id} row={row} days={data.month.days} weekGroups={monthGroups} onSetState={setCellState} onAmountClick={openAmount} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <AnalysisBlock rows={visibleRows} />
      </motion.div>

      <Dialog open={!!amountEdit} onOpenChange={(open) => !open && setAmountEdit(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{amountEdit?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{amountEdit?.label}</label>
            <Input inputMode="decimal" type="number" min="0" step={amountEdit?.row.kind === "work-money" ? "0.01" : "1"} value={amountValue} onChange={(event) => setAmountValue(event.target.value)} placeholder={amountEdit?.placeholder} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmountEdit(null)}>
              Cancel
            </Button>
            <Button onClick={saveAmount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoalsDialog open={goalsOpen} onOpenChange={setGoalsOpen} onSaved={load} />
      {recapMounted && (
        <Suspense fallback={null}>
          <DashboardRecapModal open={recapOpen} onOpenChange={setRecapOpen} />
        </Suspense>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Pick Trackers</DialogTitle>
          </DialogHeader>
          {/* Spelled out because a bare checkbox next to a habit name reads as
              "mark this done" rather than "show this row". */}
          <p className="-mt-1 text-xs text-muted-foreground">Choose which rows appear in the grid. This only changes what you see. It does not tick anything off.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => toggleVisible(row.id)} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50 transition-colors">
                <Checkbox checked={!hiddenIds.includes(row.id)} onCheckedChange={() => toggleVisible(row.id)} />
                <span className="text-sm font-medium">{row.label}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHiddenIds([])}>
              Reset
            </Button>
            <Button onClick={() => setPickerOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// GoalsDialog: edit the targets every row is measured against
// =====================================================================
type GoalsResponse = {
  caloriesTarget: number;
  proteinTarget: number;
  waterTargetMl: number;
  stepsTarget: number;
  workDayMoney: number;
  sleepMinMinutes: number;
  sleepMaxMinutes: number;
  monthlyByKind: Record<string, number>;
  editableKinds: { kind: string; label: string; monthly: number | null }[];
};

const DAILY_FIELDS: { key: keyof GoalsResponse & string; label: string; suffix: string }[] = [
  { key: "caloriesTarget", label: "Calories", suffix: "cal / day" },
  { key: "proteinTarget", label: "Protein", suffix: "g / day" },
  { key: "waterTargetMl", label: "Water", suffix: "ml / day" },
  { key: "stepsTarget", label: "Steps", suffix: "steps / day" },
  { key: "workDayMoney", label: "Work", suffix: "$ / weekday" },
];

const hoursOf = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);

function GoalsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const [goals, setGoals] = useState<GoalsResponse | null>(null);
  const [daily, setDaily] = useState<Record<string, string>>({});
  const [monthly, setMonthly] = useState<Record<string, string>>({});
  const [sleepMin, setSleepMin] = useState("6");
  const [sleepMax, setSleepMax] = useState("8");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.get<GoalsResponse>("/dashboard/goals");
        if (cancelled) return;
        setGoals(r.data);
        setDaily(Object.fromEntries(DAILY_FIELDS.map((f) => [f.key, String(r.data[f.key] ?? 0)])));
        // Blank means "every day of the month" rather than zero.
        setMonthly(Object.fromEntries(r.data.editableKinds.map((k) => [k.kind, k.monthly === null ? "" : String(k.monthly)])));
        setSleepMin(hoursOf(r.data.sleepMinMinutes));
        setSleepMax(hoursOf(r.data.sleepMaxMinutes));
      } catch (e) {
        toast.error(getApiError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async () => {
    if (!goals || saving) return;
    const body: Record<string, unknown> = {};

    for (const f of DAILY_FIELDS) {
      const n = Number(daily[f.key]);
      if (!Number.isFinite(n) || n < 0) return toast.error(`${f.label} must be zero or more`);
      body[f.key] = n;
    }

    const min = Number(sleepMin);
    const max = Number(sleepMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= 0) return toast.error("The sleep range must be hours");
    if (min > max) return toast.error("The shortest night cannot be longer than the longest");
    body.sleepMinMinutes = Math.round(min * 60);
    body.sleepMaxMinutes = Math.round(max * 60);

    const byKind: Record<string, number | null> = {};
    for (const k of goals.editableKinds) {
      const raw = (monthly[k.kind] ?? "").trim();
      if (raw === "") {
        byKind[k.kind] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return toast.error(`${k.label} must be zero or more`);
      byKind[k.kind] = n;
    }
    body.monthlyByKind = byKind;

    setSaving(true);
    try {
      await api.patch("/dashboard/goals", body);
      onOpenChange(false);
      onSaved();
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
          <DialogTitle>Goals</DialogTitle>
        </DialogHeader>

        {!goals ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Daily amounts</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">What counts as hitting it on a given day.</p>
              <div className="space-y-2">
                {DAILY_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm font-medium">{f.label}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={daily[f.key] ?? ""}
                      onChange={(e) => setDaily((d) => ({ ...d, [f.key]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${f.label} target`}
                      className="h-11 flex-1 font-mono tabular-nums"
                    />
                    <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{f.suffix}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sleep range</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">A night inside this counts. The old habit spelled it into its own label, where nothing could read it.</p>
              <div className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium">Hours</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={sleepMin}
                  onChange={(e) => setSleepMin(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Shortest night that counts"
                  className="h-11 flex-1 font-mono tabular-nums"
                />
                <span className="shrink-0 text-[11px] text-muted-foreground">to</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={sleepMax}
                  onChange={(e) => setSleepMax(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Longest night that counts"
                  className="h-11 flex-1 font-mono tabular-nums"
                />
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Days per month</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">How many days this month you mean to do it. Leave blank for every day.</p>
              <div className="space-y-2">
                {goals.editableKinds.map((k) => (
                  <div key={k.kind} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{k.label}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="every day"
                      value={monthly[k.kind] ?? ""}
                      onChange={(e) => setMonthly((m) => ({ ...m, [k.kind]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${k.label} days per month`}
                      className="h-11 w-32 shrink-0 text-right font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!goals || saving}>
            Save goals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ChartPanel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="py-0 rounded-xl h-full border-border bg-card shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-2.5 h-full">
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-2 text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span>{title}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function DailyProgressChart({ items }: { items: DashboardResponse["metrics"]["dayProgress"] }) {
  return (
    <PercentBarChart
      barWidth={8}
      plotHeight={68}
      items={items.map((item) => ({
        key: item.date,
        label: String(item.day),
        percent: item.percent,
        // A day at 100% off three judged habits is not the same as one off thirteen,
        // so the tooltip says which it was.
        title: item.future
          ? `${item.day}: still to come`
          : item.percent === null
            ? `${item.day}: nothing to judge${item.skipped ? `, ${item.skipped} skipped` : ""}`
            : `${item.day}: ${item.done} of ${item.judged} done${item.skipped ? `, ${item.skipped} skipped` : ""}`,
      }))}
    />
  );
}

/** A null percent is a day with nothing to judge; it draws a placeholder, not a bar. */
function PercentBarChart({ items, barWidth, plotHeight }: { items: { key: string; label: string; percent: number | null; title: string }[]; barWidth: number; plotHeight: number }) {
  const ticks = [100, 75, 50, 25, 0];
  const plotWidth = 620;
  const step = items.length > 0 ? plotWidth / items.length : plotWidth;
  const svgBarWidth = Math.min(barWidth * 2, step * 0.55);
  return (
    <div className="grid grid-cols-[34px_1fr] gap-2">
      <div className="flex flex-col justify-between text-[9px] text-muted-foreground tabular-nums pt-0.5" style={{ height: plotHeight }}>
        {ticks.map((tick) => (
          <span key={tick}>{tick}%</span>
        ))}
      </div>
      <div className="relative" style={{ height: plotHeight + 20 }}>
        <svg className="absolute left-0 right-0 top-0 w-full overflow-visible" style={{ height: plotHeight }} viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" role="img">
          {[0, 25, 50, 75, 100].map((tick) => (
            <line key={tick} x1="0" x2={plotWidth} y1={plotHeight - (tick / 100) * plotHeight} y2={plotHeight - (tick / 100) * plotHeight} stroke="#e5e5e5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {items.map((item, index) => {
            const x = step * index + step / 2 - svgBarWidth / 2;
            if (item.percent === null) {
              // A flat stub sitting on the baseline, so an unscored day reads as absent
              // rather than as a perfect one.
              return (
                <rect key={item.key} x={x} y={plotHeight - 2} width={svgBarWidth} height={2} rx="1" ry="1" fill="var(--color-border)">
                  <title>{item.title}</title>
                </rect>
              );
            }
            const clamped = Math.max(0, Math.min(100, item.percent));
            const heightPx = Math.max(2, Math.round((clamped / 100) * plotHeight));
            return (
              <rect key={item.key} x={x} y={plotHeight - heightPx} width={svgBarWidth} height={heightPx} rx="3" ry="3" fill={item.percent > 0 ? "var(--color-foreground)" : "var(--color-muted)"}>
                <title>{item.title}</title>
              </rect>
            );
          })}
        </svg>
        <div className="absolute left-0 right-0 bottom-0 flex gap-1.5">
          {items.map((item) => (
            <span key={item.key} className="flex-1 min-w-2 text-center text-[9px] tabular-nums text-muted-foreground">
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekStrip({ days, progress }: { days: Day[]; progress: DashboardResponse["metrics"]["dayProgress"] }) {
  // Averaged over the days that were actually judged. Treating an unscored day as a
  // zero dragged a week down for days that had not happened yet.
  const byWeek = days.reduce<Record<number, { total: number; count: number }>>((acc, day) => {
    const found = progress.find((item) => item.date === day.iso);
    acc[day.week] = acc[day.week] ?? { total: 0, count: 0 };
    if (found && found.percent !== null) {
      acc[day.week].total += found.percent;
      acc[day.week].count += 1;
    }
    return acc;
  }, {});
  const items = Object.entries(byWeek).map(([week, value]) => {
    const pct = value.count ? Math.round(value.total / value.count) : null;
    return { key: week, label: `W${week}`, percent: pct, title: pct === null ? `Week ${week}: nothing to judge yet` : `Week ${week}: ${pct}% over ${value.count} day${value.count === 1 ? "" : "s"}` };
  });
  return <PercentBarChart items={items} barWidth={16} plotHeight={82} />;
}

function ProgressDonut({ percent, completed, total }: { percent: number; completed: number; total: number }) {
  const size = 88;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (Math.min(percent, 100) / 100);
  return (
    <Card className="py-0 rounded-xl h-full border-border bg-card shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-2.5 h-full">
        <h3 className="text-xs font-semibold text-foreground">Overall Stats</h3>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e5e5" strokeWidth={stroke} />
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#18181b" strokeWidth={stroke} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold tracking-tight tabular-nums text-foreground">{percent}%</div>
          </div>
          <div className="space-y-2 text-xs min-w-0 flex-1 text-foreground">
            <SummaryLine label="Completed" value={`${completed}/${total}`} />
            <SummaryLine label="Left" value={`${Math.max(total - completed, 0)}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Restock ring: how much of what you keep at home is at or below its restock line.
 * A full ring means the shopping list is long, not that things are going well;
 * the number in the middle is "how many to buy".
 */
function KitchenRing({ kitchen }: { kitchen?: DashboardResponse["kitchen"] }) {
  const tracked = kitchen?.tracked ?? 0;
  // Everything you would put in a basket: low stock plus anything written on the
  // list by hand, which is the only place things without macros can live.
  const need = kitchen?.toBuy ?? 0;
  const items = (kitchen?.items ?? []).filter((i) => !i.done);
  const denom = tracked + (kitchen?.manual ?? 0);
  const size = 88;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (denom > 0 ? Math.min(need / denom, 1) : 0);

  return (
    <Card className="py-0 rounded-xl h-full border-border bg-card shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-2.5 h-full">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-foreground">Restock</h3>
          <Link to="/kitchen" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Kitchen
          </Link>
        </div>

        {denom === 0 ? (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Nothing tracked yet.{" "}
            <Link to="/kitchen" className="underline underline-offset-2 hover:text-foreground">
              Add the foods you keep at home
            </Link>{" "}
            to get restock reminders here.
          </p>
        ) : (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e5e5" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#18181b" strokeWidth={stroke} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{need}</span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">to buy</span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {need === 0 ? (
                <p className="text-[11px] text-muted-foreground">All {tracked} stocked.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {items.slice(0, 5).map((i) => (
                      <span
                        key={i.id}
                        title={i.detail || "on your to-buy list"}
                        className={`inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium ${
                          i.status === "out" ? "border-foreground bg-foreground text-background" : "border-border-strong text-foreground"
                        }`}
                      >
                        <span className="truncate">{i.label}</span>
                      </span>
                    ))}
                  </div>
                  {items.length > 5 && <div className="mt-1 text-[10px] text-muted-foreground">+{need - 5} more</div>}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function TrackerRowView({
  row,
  days,
  weekGroups,
  onSetState,
  onAmountClick,
}: {
  row: TrackerRow;
  days: Day[];
  weekGroups: { week: number; days: Day[] }[];
  onSetState: (row: TrackerRow, cell: DailyCell | AmountCell, state: TrackerCellState) => void;
  onAmountClick: (row: TrackerRow, cell: DailyCell | AmountCell) => void;
}) {
  const Icon = iconMap[row.icon as keyof typeof iconMap] ?? Target;
  const weekStartDates = new Set(weekGroups.map((group) => group.days[0]?.iso).filter(Boolean));
  const tone = trackerTone();
  return (
    <div className="grid items-center border-b border-border/70 last:border-b-0 transition-colors hover:brightness-[0.99]" style={{ gridTemplateColumns: monthGridTemplate(days.length) }} title={row.description}>
      <div className="h-full min-h-9 px-3 py-1.5 border-r border-white/10 text-white flex items-center gap-2 min-w-0" style={{ backgroundColor: ROW_CHROME.base }}>
        <div className="h-6 w-6 rounded-[4px] border border-white/45 bg-card/15 flex items-center justify-center shrink-0 text-white shadow-inner">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </div>
        <span className="font-semibold text-[12px] truncate">{row.label}</span>
      </div>
      {days.map((day, index) => {
        const cell = getCell(row, day.iso);
        return (
          <div
            key={day.iso}
            className={`h-full min-h-9 flex items-center justify-center border-r border-border/70 ${index === 0 || weekStartDates.has(day.iso) ? "border-l border-l-border-strong" : ""}`}
            style={{ backgroundColor: day.weekend ? tone.faint : "rgba(255,255,255,0.72)" }}
          >
            {cell ? <TrackerCell row={row} cell={cell} onSetState={onSetState} onAmountClick={onAmountClick} /> : null}
          </div>
        );
      })}
    </div>
  );
}

// A single click toggles, a double click marks "excused". Distinguishing them means
// holding the single-click action back until the double-click window closes, so the
// pending timer lives in a ref and is cleared on unmount, otherwise a cell clicked
// just before the month changes fires its toggle against an unmounted tree.
function useSingleOrDoubleClick(delayMs = 220) {
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    };
  }, []);

  return useCallback(
    (singleClick: () => void, doubleClick: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.detail === 1) {
        clickTimer.current = window.setTimeout(() => {
          clickTimer.current = null;
          singleClick();
        }, delayMs);
        return;
      }
      if (event.detail === 2) {
        if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
        doubleClick();
      }
    },
    [delayMs],
  );
}

function TrackerCell({
  row,
  cell,
  onSetState,
  onAmountClick,
}: {
  row: TrackerRow;
  cell: DailyCell | AmountCell;
  onSetState: (row: TrackerRow, cell: DailyCell | AmountCell, state: TrackerCellState) => void;
  onAmountClick: (row: TrackerRow, cell: DailyCell | AmountCell) => void;
}) {
  const tone = trackerTone();
  const handleCellClick = useSingleOrDoubleClick();

  const cellStyle = (targetCell: DailyCell | AmountCell) => {
    if (targetCell.state === "excused") return { backgroundColor: "#a3a3a3", borderColor: "#737373", color: "#ffffff" };
    if (targetCell.checked) return { backgroundColor: tone.base, borderColor: tone.dark, color: "#ffffff" };
    return { backgroundColor: targetCell.editable ? "#ffffff" : "#f5f5f5", borderColor: targetCell.editable ? tone.ring : "#d4d4d4", color: tone.dark };
  };

  if (row.kind === "steps-count" || row.kind === "work-money") {
    const raw = isAmountCell(cell) ? cell.amount : cell.value ?? 0;
    return (
      <button
        type="button"
        onClick={handleCellClick(() => cell.editable && onAmountClick(row, cell), () => cell.editable && onSetState(row, cell, cell.state === "excused" ? null : "excused"))}
        disabled={!cell.editable}
        title={`${cell.detail ?? "Log value"} · double-click for intentional skip`}
        className="h-5 w-5 rounded-[4px] border flex items-center justify-center transition-colors shadow-sm"
        style={cellStyle(cell)}
      >
        {cell.checked && <Check className="h-3 w-3" strokeWidth={3} />}
        {!cell.checked && raw > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.base }} />}
      </button>
    );
  }

  const dailyCell = cell as DailyCell;
  return (
    <button
      type="button"
      onClick={handleCellClick(() => onSetState(row, dailyCell, dailyCell.checked ? null : "done"), () => onSetState(row, dailyCell, dailyCell.state === "excused" ? null : "excused"))}
      disabled={!dailyCell.editable}
      title={`${dailyCell.detail ?? dailyCell.date} · double-click for intentional skip`}
      className="h-5 w-5 rounded-[4px] border flex items-center justify-center transition-colors shadow-sm"
      style={cellStyle(dailyCell)}
    >
      {dailyCell.checked && <Check className="h-3 w-3" strokeWidth={3} />}
      {!dailyCell.checked && !dailyCell.editable && <X className="h-2.5 w-2.5 text-muted-foreground/60" />}
    </button>
  );
}

/** Done, left and progress, one line per row. */
const ANALYSIS_COLUMNS = "64px 60px minmax(110px, 132px)";

function AnalysisBlock({ rows }: { rows: TrackerRow[] }) {
  return (
    <Card className="overflow-hidden py-0 gap-0 rounded-xl border-border bg-card shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-0">
        <div className="grid border-b border-white/10 bg-neutral-900 text-white text-[10px] font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: ANALYSIS_COLUMNS }}>
          <div className="h-7 flex items-center justify-center border-r border-white/20" style={{ gridColumn: "span 3" }}>
            Analysis
          </div>
          {["Done", "Left", "Progress"].map((label) => (
            <div key={label} className="h-14 flex items-center justify-center border-r border-t border-white/20 text-[9px]">
              {label}
            </div>
          ))}
        </div>
        {rows.map((row) => {
          const tone = trackerTone();
          return (
            <div key={row.id} className="grid border-b border-border/70 last:border-b-0" style={{ gridTemplateColumns: ANALYSIS_COLUMNS }}>
              <div className="min-h-9 px-2 py-1.5 border-r border-border/70 flex items-center justify-end text-[11px] tabular-nums font-semibold text-foreground" style={{ backgroundColor: tone.faint }}>
                {formatAnalysisValue(row, row.actual)}
              </div>
              <div className="min-h-9 px-2 py-1.5 border-r border-border/70 bg-card/80 flex items-center justify-end text-[11px] tabular-nums text-muted-foreground">
                {formatAnalysisValue(row, row.left)}
              </div>
              <div className="min-h-9 px-2 py-1.5 border-r border-border/70 bg-card/80 flex items-center gap-2">
                <ProgressBar percent={row.percent} color={tone.base} />
                <span className="w-8 text-right text-[11px] tabular-nums font-semibold" style={{ color: tone.dark }}>
                  {row.percent}%
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 min-w-0 flex-1 rounded-full overflow-hidden bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
