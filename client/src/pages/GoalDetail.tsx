import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, GripVertical, MessageSquarePlus, Plus, Target } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { goalPercent, goals } from "../lib/goals";
import type { GoalTask, GoalTaskStatus, InBodyEntry } from "../lib/goals";

type MoneyTransaction = {
  id: string;
  date: string;
  amount: number;
};

function moneyStorageKey(goalId: string) {
  return `life-tracker-money-${goalId}`;
}

function loadMoneyTransactions(goalId: string | undefined, fallback: MoneyTransaction[]) {
  if (!goalId || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(moneyStorageKey(goalId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(
      (item): item is MoneyTransaction =>
        item &&
        typeof item.id === "string" &&
        typeof item.date === "string" &&
        typeof item.amount === "number",
    );
  } catch {
    return fallback;
  }
}

function inBodyStorageKey(goalId: string) {
  return `life-tracker-inbody-${goalId}`;
}

function loadInBodyEntries(goalId: string | undefined, fallback: InBodyEntry[]) {
  if (!goalId || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(inBodyStorageKey(goalId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(
      (item): item is InBodyEntry =>
        item &&
        typeof item.id === "string" &&
        typeof item.date === "string" &&
        typeof item.weightKg === "number" &&
        typeof item.fatPct === "number" &&
        typeof item.musclePct === "number" &&
        typeof item.waterPct === "number" &&
        typeof item.boneKg === "number",
    );
  } catch {
    return fallback;
  }
}

function latestInBody(entries: InBodyEntry[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function bodyProgress(startWeight: number, targetWeight: number, startFat: number | undefined, targetFat: number | undefined, latest: InBodyEntry | undefined) {
  const currentWeight = latest?.weightKg ?? startWeight;
  const totalToLose = startWeight - targetWeight;
  const weightProgress = totalToLose > 0 ? Math.min(Math.max((startWeight - currentWeight) / totalToLose, 0), 1) : 0;

  if (typeof startFat !== "number" || typeof targetFat !== "number" || !latest) {
    return Math.round(weightProgress * 100);
  }

  const fatToLose = startFat - targetFat;
  const fatProgress = fatToLose > 0 ? Math.min(Math.max((startFat - latest.fatPct) / fatToLose, 0), 1) : 0;
  return Math.round(((weightProgress + fatProgress) / 2) * 100);
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

const PROGRESS_GREEN = "#16a34a";
const BOARD_COLUMNS: { id: GoalTaskStatus; title: string; description: string }[] = [
  { id: "planning", title: "Planning", description: "Not started yet" },
  { id: "working", title: "Working On It", description: "Currently moving" },
  { id: "completed", title: "Completed", description: "Done and verified" },
];

function taskStatus(task: GoalTask): GoalTaskStatus {
  return task.status ?? (task.done ? "completed" : "planning");
}

function ticketName(task: GoalTask) {
  let name = task.title;
  const splitters = [" (", " - ", " -- ", " -> ", " and rotate ", " across "];
  const cutAt = splitters
    .map((splitter) => name.indexOf(splitter))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];
  if (cutAt) name = name.slice(0, cutAt);
  return name
    .replace(/^Add cascade delete:\s*/, "Cascade delete: ")
    .replace(/^Apply Settings course defaults$/, "Settings course defaults")
    .replace(/^Restrict CORS to an actual origin allowlist$/, "CORS origin allowlist")
    .replace(/^Reconsider JWT storage$/, "JWT storage strategy")
    .trim();
}

export default function GoalDetail() {
  const { goalId } = useParams();
  const goal = goals.find((item) => item.id === goalId);
  const [tasks, setTasks] = useState<GoalTask[]>(() => goal?.tasks ?? []);
  const [moneyTransactions, setMoneyTransactions] = useState<MoneyTransaction[]>(() => loadMoneyTransactions(goalId, goal?.money?.transactions ?? []));
  const [inBodyEntries, setInBodyEntries] = useState<InBodyEntry[]>(() => loadInBodyEntries(goalId, goal?.weight?.logs ?? []));
  const moneyCurrent = useMemo(() => (goal?.kind === "money" ? (goal.money?.current ?? 0) + moneyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) : 0), [goal, moneyTransactions]);

  useEffect(() => {
    setTasks(goal?.tasks ?? []);
    setMoneyTransactions(loadMoneyTransactions(goalId, goal?.money?.transactions ?? []));
    setInBodyEntries(loadInBodyEntries(goalId, goal?.weight?.logs ?? []));
  }, [goal, goalId]);

  useEffect(() => {
    if (goal?.kind !== "money" || !goalId || typeof window === "undefined") return;
    window.localStorage.setItem(moneyStorageKey(goalId), JSON.stringify(moneyTransactions));
  }, [goal?.kind, goalId, moneyTransactions]);

  useEffect(() => {
    if (goal?.kind !== "weight" || !goalId || typeof window === "undefined") return;
    window.localStorage.setItem(inBodyStorageKey(goalId), JSON.stringify(inBodyEntries));
  }, [goal?.kind, goalId, inBodyEntries]);

  const percent = useMemo(() => {
    if (!goal) return 0;
    if (goal.kind === "project") {
      const done = tasks.filter((task) => taskStatus(task) === "completed").length;
      return tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    }
    if (goal.kind === "money" && goal.money) {
      return Math.round(Math.min(moneyCurrent / goal.money.target, 1) * 100);
    }
    if (goal.kind === "weight" && goal.weight) {
      return bodyProgress(goal.weight.start, goal.weight.target, goal.weight.fatPct, goal.weight.targetFatMax, latestInBody(inBodyEntries));
    }
    return goalPercent(goal);
  }, [goal, inBodyEntries, moneyCurrent, tasks]);

  if (!goal) {
    return (
      <div className="w-full max-w-[900px] mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
            <div className="text-lg font-semibold">Goal not found</div>
            <Link to="/goals" className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Back to Goals
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Icon = goal.icon;

  return (
    <div className="w-full max-w-[1500px] mx-auto space-y-5">
      <motion.div {...fadeUp} className="flex flex-col gap-4">
        <Link to="/goals" className="self-start -ml-2 inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Goals
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center border border-neutral-200 bg-neutral-950 text-white shadow-sm">
              <Icon className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">Goal</div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1 truncate">{goal.title}</h1>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Progress</div>
            <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight">{percent}%</div>
          </div>
        </div>
      </motion.div>

      <motion.div {...stagger(1)}>
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold">Goal Status</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{goal.subtitle}</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            <ProgressBar percent={percent} />
          </CardContent>
        </Card>
      </motion.div>

      {goal.kind === "project" && <ProjectGoal tasks={tasks} setTasks={setTasks} />}
      {goal.kind === "money" && goal.money && <MoneyGoal baseCurrent={goal.money.current} current={moneyCurrent} setTransactions={setMoneyTransactions} target={goal.money.target} currency={goal.money.currency} transactions={moneyTransactions} />}
      {goal.kind === "weight" && goal.weight && <WeightGoal entries={inBodyEntries} setEntries={setInBodyEntries} start={goal.weight.start} target={goal.weight.target} targetMin={goal.weight.targetMin} targetMax={goal.weight.targetMax} unit={goal.weight.unit} startFat={goal.weight.fatPct} targetFatMin={goal.weight.targetFatMin} targetFatMax={goal.weight.targetFatMax} />}
    </div>
  );
}

function ProjectGoal({ tasks, setTasks }: { tasks: GoalTask[]; setTasks: Dispatch<SetStateAction<GoalTask[]>> }) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const done = tasks.filter((task) => taskStatus(task) === "completed").length;

  const moveTask = (taskId: string, status: GoalTaskStatus) => {
    setTasks((current) => current.map((item) => (item.id === taskId ? { ...item, status, done: status === "completed" } : item)));
  };

  const handleDrop = (status: GoalTaskStatus) => {
    if (!draggedTaskId) return;
    moveTask(draggedTaskId, status);
    setDraggedTaskId(null);
  };

  return (
    <motion.div {...stagger(2)} className="space-y-3">
      <Card className="overflow-hidden border-neutral-200 bg-neutral-950 text-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Project Board</h2>
              <p className="text-xs text-white/60 mt-1">{done}/{tasks.length} tickets completed. Drag tickets between lanes to update progress.</p>
            </div>
            <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
              <Plus className="h-4 w-4" />
              Add Ticket
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <CardContent className="p-3 md:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {BOARD_COLUMNS.map((column) => {
              const columnTasks = tasks.filter((task) => taskStatus(task) === column.id);
              const isCompletedColumn = column.id === "completed";
              const isActiveDrop = draggedTaskId !== null;
              const titleTone = isCompletedColumn ? "text-green-700" : "text-neutral-950";
              const railTone = isCompletedColumn ? "bg-green-600" : "bg-neutral-950";
              const countTone = isCompletedColumn ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 bg-white text-neutral-500";

              return (
                <div
                  key={column.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(column.id)}
                  className={`min-h-[560px] rounded-2xl border p-3 transition-colors ${isActiveDrop ? "border-neutral-300 bg-neutral-100" : "border-neutral-200 bg-[#f7f7f8]"}`}
                >
                  <div className="mb-3 rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-5 w-1 rounded-full ${railTone}`} />
                        <h3 className={`text-sm font-bold tracking-tight ${titleTone}`}>{column.title}</h3>
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-500">{column.description}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-[11px] font-mono font-semibold ${countTone}`}>{columnTasks.length}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {columnTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => setDraggedTaskId(null)}
                        title={task.title}
                        className={`group rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md ${draggedTaskId === task.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-neutral-300 group-hover:text-neutral-500" />
                          <div className="min-w-0 flex-1">
                            <div className={`overflow-hidden text-[13px] font-medium leading-snug tracking-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${isCompletedColumn ? "text-neutral-500 line-through" : "text-neutral-950"}`}>{ticketName(task)}</div>
                            <div className="mt-3 flex items-center justify-end">
                              <Button variant="outline" size="sm" className="h-7 shrink-0 border-neutral-200 bg-white px-2.5 text-neutral-700 hover:bg-neutral-100">
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                {task.threadCount > 0 && <span className="font-mono tabular-nums text-neutral-950">{task.threadCount}</span>}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {columnTasks.length === 0 && <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/70 px-4 text-center text-xs font-medium text-neutral-400">Drop tickets here</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MoneyGoal({
  baseCurrent,
  current,
  setTransactions,
  target,
  currency,
  transactions,
}: {
  baseCurrent: number;
  current: number;
  setTransactions: Dispatch<SetStateAction<MoneyTransaction[]>>;
  target: number;
  currency: string;
  transactions: MoneyTransaction[];
}) {
  const [amount, setAmount] = useState("");
  const left = Math.max(target - current, 0);
  const fmt = (value: number) => (currency === "$" ? `$${value.toLocaleString("en-US")}` : `${value.toLocaleString("en-US")} LE`);
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  const addTransaction = (direction: 1 | -1) => {
    const value = Number(amount || 0);
    if (!Number.isFinite(value) || value <= 0) return;
    const signedAmount = direction * value;
    setTransactions((items) => [
      {
        id: `${Date.now()}-${items.length}`,
        date: new Date().toISOString(),
        amount: signedAmount,
      },
      ...items,
    ]);
    setAmount("");
  };

  return (
    <motion.div {...stagger(2)} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
      <div className="space-y-3">
        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Savings Balance</h2>
                <p className="text-xs text-muted-foreground mt-1">Log money every time you add to or deduct from this bank account.</p>
              </div>
              <div className="text-left lg:text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current</div>
                <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight text-neutral-950">{fmt(current)}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
              <Input inputMode="decimal" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={currency === "$" ? "Amount in $" : "Amount in LE"} className="h-10" />
              <Button type="button" onClick={() => addTransaction(1)} className="h-10 bg-neutral-950 text-white hover:bg-neutral-800">
                Add Money
              </Button>
              <Button type="button" variant="outline" onClick={() => addTransaction(-1)} className="h-10 border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100">
                Deduct
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Balance History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Graph updates from the transaction log.</p>
              </div>
              <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-mono font-semibold text-neutral-600">{transactions.length} logs</span>
            </div>
            <MoneyGraph baseCurrent={baseCurrent} transactions={transactions} target={target} format={fmt} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <StatPanel rows={[["Current", fmt(current)], ["Target", fmt(target)], ["Left", fmt(left)]]} />
        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-0">
            <div className="border-b border-neutral-200 bg-neutral-950 px-4 py-3 text-white">
              <h3 className="text-sm font-semibold">Transaction Log</h3>
              <p className="text-xs text-white/60 mt-0.5">Newest entries first.</p>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {sortedTransactions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No money logged yet.</div>
              ) : (
                sortedTransactions.map((transaction) => {
                  const isPositive = transaction.amount > 0;
                  return (
                    <div key={transaction.id} className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0">
                      <div>
                        <div className="text-sm font-semibold text-neutral-950">{isPositive ? "Added" : "Deducted"}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(transaction.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                      </div>
                      <div className={`font-mono text-sm font-semibold tabular-nums ${isPositive ? "text-green-700" : "text-neutral-500"}`}>
                        {isPositive ? "+" : "-"}
                        {fmt(Math.abs(transaction.amount))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function MoneyGraph({ baseCurrent, transactions, target, format }: { baseCurrent: number; transactions: MoneyTransaction[]; target: number; format: (value: number) => string }) {
  const width = 720;
  const height = 220;
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = baseCurrent;
  const points = [{ label: "Start", value: running }, ...ordered.map((transaction) => {
    running += transaction.amount;
    return { label: new Date(transaction.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: running };
  })];
  const max = Math.max(target, ...points.map((point) => point.value), 1);
  const min = Math.min(0, ...points.map((point) => point.value));
  const range = Math.max(max - min, 1);
  const plotted = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / range) * height;
    return { ...point, x, y };
  });
  const line = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const targetY = height - ((target - min) / range) * height;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = height - tick * height;
          return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
        })}
        <line x1="0" x2={width} y1={targetY} y2={targetY} stroke="#16a34a" strokeDasharray="6 6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={line} fill="none" stroke="#18181b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {plotted.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="4" fill="#18181b">
            <title>{`${point.label}: ${format(point.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Start: {format(baseCurrent)}</span>
        <span>Target: {format(target)}</span>
      </div>
    </div>
  );
}

function WeightGoal({
  entries,
  setEntries,
  start,
  target,
  targetMin,
  targetMax,
  unit,
  startFat,
  targetFatMin,
  targetFatMax,
}: {
  entries: InBodyEntry[];
  setEntries: Dispatch<SetStateAction<InBodyEntry[]>>;
  start: number;
  target: number;
  targetMin?: number;
  targetMax?: number;
  unit: string;
  startFat?: number;
  targetFatMin?: number;
  targetFatMax?: number;
}) {
  const newest = latestInBody(entries);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weightKg: "",
    fatPct: "",
    musclePct: "",
    waterPct: "",
    boneKg: "",
  });
  const value = newest?.weightKg ?? start;
  const fat = newest?.fatPct ?? startFat ?? 0;
  const lost = Math.max(start - value, 0);
  const left = Math.max(value - target, 0);
  const progress = bodyProgress(start, target, startFat, targetFatMax, newest);
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const weightRange = targetMin && targetMax ? `${targetMin}-${targetMax} ${unit}` : `${target} ${unit}`;
  const fatRange = targetFatMin && targetFatMax ? `${targetFatMin}-${targetFatMax}%` : `${targetFatMax ?? 20}%`;

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const addEntry = () => {
    const next = {
      id: `${Date.now()}-${entries.length}`,
      date: form.date || new Date().toISOString().slice(0, 10),
      weightKg: Number(form.weightKg),
      fatPct: Number(form.fatPct),
      musclePct: Number(form.musclePct),
      waterPct: Number(form.waterPct),
      boneKg: Number(form.boneKg),
    };
    if ([next.weightKg, next.fatPct, next.musclePct, next.waterPct, next.boneKg].some((item) => !Number.isFinite(item) || item <= 0)) return;
    setEntries((items) => [next, ...items]);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      weightKg: "",
      fatPct: "",
      musclePct: "",
      waterPct: "",
      boneKg: "",
    });
  };

  return (
    <motion.div {...stagger(2)} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
      <div className="space-y-3">
        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">InBody Log</h2>
                <p className="text-xs text-muted-foreground mt-1">Add a new scan whenever you measure again. The goal is {weightRange} and {fatRange} body fat.</p>
              </div>
              <div className="text-left lg:text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Latest</div>
                <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight text-neutral-950">{value.toFixed(1)} {unit}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 lg:grid-cols-6 gap-2">
              <Input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} className="h-10 col-span-2 lg:col-span-1" />
              <Input inputMode="decimal" type="number" min="0" value={form.weightKg} onChange={(event) => updateForm("weightKg", event.target.value)} placeholder="Weight kg" className="h-10" />
              <Input inputMode="decimal" type="number" min="0" value={form.fatPct} onChange={(event) => updateForm("fatPct", event.target.value)} placeholder="Fat %" className="h-10" />
              <Input inputMode="decimal" type="number" min="0" value={form.musclePct} onChange={(event) => updateForm("musclePct", event.target.value)} placeholder="Muscle %" className="h-10" />
              <Input inputMode="decimal" type="number" min="0" value={form.waterPct} onChange={(event) => updateForm("waterPct", event.target.value)} placeholder="Water %" className="h-10" />
              <Input inputMode="decimal" type="number" min="0" value={form.boneKg} onChange={(event) => updateForm("boneKg", event.target.value)} placeholder="Bone kg" className="h-10" />
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={addEntry} className="h-10 bg-neutral-950 text-white hover:bg-neutral-800">
                Add Scan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Body Composition History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Weight and body-fat trend from every saved scan.</p>
              </div>
              <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-mono font-semibold text-neutral-600">{entries.length} scans</span>
            </div>
            <InBodyGraph entries={entries} targetWeight={target} targetFat={targetFatMax ?? 20} unit={unit} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <StatPanel rows={[["Current", `${value.toFixed(1)} ${unit}`], ["Fat", `${fat.toFixed(1)}%`], ["Target Weight", weightRange], ["Target Fat", fatRange], ["Lost", `${lost.toFixed(1)} ${unit}`], ["Left", `${left.toFixed(1)} ${unit}`], ["Progress", `${progress}%`]]} />
        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-0">
            <div className="border-b border-neutral-200 bg-neutral-950 px-4 py-3 text-white">
              <h3 className="text-sm font-semibold">Scan Log</h3>
              <p className="text-xs text-white/60 mt-0.5">Newest scans first.</p>
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {sortedEntries.map((entry) => (
                <div key={entry.id} className="border-b border-neutral-200 px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-neutral-950">{new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-neutral-950">{entry.weightKg.toFixed(1)} {unit}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span>Fat {entry.fatPct.toFixed(1)}%</span>
                    <span>Muscle {entry.musclePct.toFixed(1)}%</span>
                    <span>Water {entry.waterPct.toFixed(1)}%</span>
                    <span>Bone {entry.boneKg.toFixed(1)} kg</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function InBodyGraph({ entries, targetWeight, targetFat, unit }: { entries: InBodyEntry[]; targetWeight: number; targetFat: number; unit: string }) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <MetricSparkline
        label="Weight"
        values={ordered.map((entry) => ({ label: entry.date, value: entry.weightKg }))}
        target={targetWeight}
        suffix={` ${unit}`}
      />
      <MetricSparkline
        label="Body Fat"
        values={ordered.map((entry) => ({ label: entry.date, value: entry.fatPct }))}
        target={targetFat}
        suffix="%"
      />
    </div>
  );
}

function MetricSparkline({ label, values, target, suffix }: { label: string; values: { label: string; value: number }[]; target: number; suffix: string }) {
  const width = 520;
  const height = 190;
  const max = Math.max(target, ...values.map((item) => item.value), 1);
  const min = Math.min(target, ...values.map((item) => item.value), 0);
  const range = Math.max(max - min, 1);
  const plotted = values.map((item, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((item.value - min) / range) * height;
    return { ...item, x, y };
  });
  const line = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const targetY = height - ((target - min) / range) * height;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold text-neutral-950">{label}</h4>
        <span className="text-[11px] font-mono text-green-700">Target {target}{suffix}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = height - tick * height;
          return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
        })}
        <line x1="0" x2={width} y1={targetY} y2={targetY} stroke="#16a34a" strokeDasharray="6 6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={line} fill="none" stroke="#18181b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {plotted.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="4" fill="#18181b">
            <title>{`${point.label}: ${point.value}${suffix}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function StatPanel({ rows }: { rows: [string, string][] }) {
  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-mono font-semibold tabular-nums text-neutral-950">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 rounded-full overflow-hidden bg-muted">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(percent, 100)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ backgroundColor: PROGRESS_GREEN }} />
    </div>
  );
}
