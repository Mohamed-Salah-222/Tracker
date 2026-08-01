import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { ArrowLeft, GripVertical, MessageSquarePlus, Plus, Target, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { todayISO } from "../lib/today";
import { formatMoney, goalIcon, type Goal, type GoalTask, type GoalTaskStatus, type InBodyEntry, type MoneyTransaction } from "../lib/goals";

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

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
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
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!goalId) return;
    try {
      const r = await api.get<Goal>(`/goals/${goalId}`);
      setGoal(r.data);
    } catch (e) {
      // A missing goal is the empty state below, not an error worth shouting about.
      if (e instanceof AxiosError && e.response?.status === 404) setGoal(null);
      else toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="w-full max-w-[900px]">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading goal…</CardContent>
        </Card>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="w-full max-w-[900px]">
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

  const percent = goal.percent;

  return (
    <div className="w-full max-w-[1500px] space-y-5">
      <motion.div {...fadeUp} className="flex flex-col gap-4">
        <Link to="/goals" className="self-start -ml-2 inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Goals
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center border border-neutral-200 bg-neutral-950 text-white shadow-sm">
              {createElement(goalIcon(goal.icon), { className: "h-6 w-6", strokeWidth: 2.2 })}
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

      {goal.kind === "project" && <ProjectGoal goal={goal} setGoal={setGoal} />}
      {goal.kind === "money" && goal.money && <MoneyGoal goal={goal} setGoal={setGoal} />}
      {goal.kind === "weight" && goal.weight && <WeightGoal goal={goal} setGoal={setGoal} />}
    </div>
  );
}

type SectionProps = { goal: Goal; setGoal: (goal: Goal) => void };

// =====================================================================
// Project
// =====================================================================
function ProjectGoal({ goal, setGoal }: SectionProps) {
  const tasks = useMemo(() => goal.tasks ?? [], [goal.tasks]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const done = tasks.filter((task) => task.status === "completed").length;

  const moveTask = async (taskId: string, status: GoalTaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;

    // Optimistic: dragging should land instantly. The server response replaces
    // this, and a failure reverts it rather than leaving the board lying.
    const previous = goal;
    setGoal({ ...goal, tasks: tasks.map((item) => (item.id === taskId ? { ...item, status, done: status === "completed" } : item)) });
    try {
      const r = await api.patch<Goal>(`/goals/${goal.id}/tasks/${taskId}`, { status });
      setGoal(r.data);
    } catch (e) {
      setGoal(previous);
      toast.error(getApiError(e));
    }
  };

  const handleDrop = (status: GoalTaskStatus) => {
    if (!draggedTaskId) return;
    void moveTask(draggedTaskId, status);
    setDraggedTaskId(null);
  };

  const deleteTask = async (taskId: string) => {
    try {
      const r = await api.delete<Goal>(`/goals/${goal.id}/tasks/${taskId}`);
      setGoal(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const bumpThreads = async (task: GoalTask) => {
    try {
      const r = await api.patch<Goal>(`/goals/${goal.id}/tasks/${task.id}`, { threadCount: task.threadCount + 1 });
      setGoal(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
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
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="border-white/20 bg-white/10 text-white hover:bg-white/15">
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
              const columnTasks = tasks.filter((task) => task.status === column.id);
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
                            <div className="mt-3 flex items-center justify-end gap-1.5">
                              <Button variant="outline" size="sm" onClick={() => void bumpThreads(task)} className="h-7 shrink-0 border-neutral-200 bg-white px-2.5 text-neutral-700 hover:bg-neutral-100">
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                {task.threadCount > 0 && <span className="font-mono tabular-nums text-neutral-950">{task.threadCount}</span>}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => void deleteTask(task.id)} className="h-7 shrink-0 border-neutral-200 bg-white px-2 text-neutral-500 hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
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

      <AddTicketDialog goalId={goal.id} open={addOpen} onOpenChange={setAddOpen} onSaved={setGoal} />
    </motion.div>
  );
}

function AddTicketDialog({ goalId, open, onOpenChange, onSaved }: { goalId: string; open: boolean; onOpenChange: (b: boolean) => void; onSaved: (goal: Goal) => void }) {
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSection("");
  }, [open]);

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return toast.error("Title required");
    setSaving(true);
    try {
      const r = await api.post<Goal>(`/goals/${goalId}/tasks`, { title: cleanTitle, section: section.trim() });
      onSaved(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Section (optional)</Label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Pages" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Adding…" : "Add Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Money
// =====================================================================
function MoneyGoal({ goal, setGoal }: SectionProps) {
  const money = goal.money!;
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const transactions = useMemo(() => money.transactions ?? [], [money.transactions]);
  const left = Math.max(money.target - money.current, 0);
  const fmt = (value: number) => formatMoney(money.currency, value);
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  const addTransaction = async (direction: 1 | -1) => {
    const value = Number(amount || 0);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter an amount greater than 0");
    setSaving(true);
    try {
      const r = await api.post<Goal>(`/goals/${goal.id}/contributions`, { amount: direction * value });
      setGoal(r.data);
      setAmount("");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async (transactionId: string) => {
    try {
      const r = await api.delete<Goal>(`/goals/${goal.id}/contributions/${transactionId}`);
      setGoal(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
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
                <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight text-neutral-950">{fmt(money.current)}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
              <Input inputMode="decimal" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Amount in ${money.currency}`} className="h-10" />
              <Button type="button" disabled={saving} onClick={() => void addTransaction(1)} className="h-10 bg-neutral-950 text-white hover:bg-neutral-800">
                Add Money
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void addTransaction(-1)} className="h-10 border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100">
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
            <MoneyGraph baseCurrent={money.startingAmount} transactions={transactions} target={money.target} format={fmt} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <StatPanel rows={[["Current", fmt(money.current)], ["Target", fmt(money.target)], ["Left", fmt(left)]]} />
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
                      <div className="flex items-center gap-2">
                        <div className={`font-mono text-sm font-semibold tabular-nums ${isPositive ? "text-green-700" : "text-neutral-500"}`}>
                          {isPositive ? "+" : "-"}
                          {fmt(Math.abs(transaction.amount))}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void removeTransaction(transaction.id)} className="h-7 px-2 text-neutral-400 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
  // Running balance after each transaction, oldest first. Accumulated in a plain
  // loop rather than a mutation captured by a .map() closure: the value is a pure
  // function of the props, so it belongs in the render pass, not in state.
  const points = useMemo(() => {
    const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const series = [{ label: "Start", value: baseCurrent }];
    let running = baseCurrent;
    for (const transaction of ordered) {
      running += transaction.amount;
      series.push({ label: new Date(transaction.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: running });
    }
    return series;
  }, [baseCurrent, transactions]);
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

// =====================================================================
// Weight
// =====================================================================
const EMPTY_SCAN = { date: todayISO(), weightKg: "", fatPct: "", musclePct: "", waterPct: "", boneKg: "" };

function WeightGoal({ goal, setGoal }: SectionProps) {
  const weight = goal.weight!;
  const entries = useMemo(() => weight.logs ?? [], [weight.logs]);
  const [form, setForm] = useState(EMPTY_SCAN);
  const [saving, setSaving] = useState(false);

  const newest = entries[0];
  const value = newest?.weightKg ?? weight.start;
  const fat = newest?.fatPct ?? weight.fatPct ?? 0;
  const hasWeight = value != null;
  const startWeight = weight.start ?? newest?.weightKg ?? null;
  const lost = startWeight != null && value != null ? Math.max(startWeight - value, 0) : 0;
  const left = value != null ? Math.max(value - weight.target, 0) : weight.target;
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const weightRange = weight.targetMin && weight.targetMax ? `${weight.targetMin}-${weight.targetMax} ${weight.unit}` : `${weight.target} ${weight.unit}`;
  const fatRange = weight.targetFatMin && weight.targetFatMax ? `${weight.targetFatMin}-${weight.targetFatMax}%` : `${weight.targetFatMax ?? 20}%`;

  const updateForm = (field: keyof typeof form, next: string) => {
    setForm((current) => ({ ...current, [field]: next }));
  };

  const addEntry = async () => {
    const weightKg = Number(form.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) return toast.error("Weight must be greater than 0");

    // Composition fields are optional: send only the ones actually filled in
    // rather than turning a blank box into a zero the trend would then plot.
    const body: Record<string, unknown> = { date: form.date || todayISO(), weightKg };
    for (const field of ["fatPct", "musclePct", "waterPct", "boneKg"] as const) {
      if (form[field] === "") continue;
      const parsed = Number(form[field]);
      if (!Number.isFinite(parsed) || parsed < 0) return toast.error(`${field} must be a non-negative number`);
      body[field] = parsed;
    }

    setSaving(true);
    try {
      const r = await api.post<Goal>(`/goals/${goal.id}/weight-logs`, body);
      setGoal(r.data);
      setForm({ ...EMPTY_SCAN, date: todayISO() });
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entryId: string) => {
    try {
      const r = await api.delete<Goal>(`/goals/${goal.id}/weight-logs/${entryId}`);
      setGoal(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
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
                <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight text-neutral-950">{hasWeight ? `${value.toFixed(1)} ${weight.unit}` : "No scan"}</div>
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
              <Button type="button" disabled={saving} onClick={() => void addEntry()} className="h-10 bg-neutral-950 text-white hover:bg-neutral-800">
                {saving ? "Saving…" : "Add Scan"}
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
            <InBodyGraph entries={entries} targetWeight={weight.target} targetFat={weight.targetFatMax ?? 20} unit={weight.unit} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <StatPanel
          rows={[
            ["Current", hasWeight ? `${value.toFixed(1)} ${weight.unit}` : "No scan"],
            ["Fat", `${fat.toFixed(1)}%`],
            ["Target Weight", weightRange],
            ["Target Fat", fatRange],
            ["Lost", `${lost.toFixed(1)} ${weight.unit}`],
            ["Left", `${left.toFixed(1)} ${weight.unit}`],
            ["Progress", `${goal.percent}%`],
          ]}
        />
        <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <CardContent className="p-0">
            <div className="border-b border-neutral-200 bg-neutral-950 px-4 py-3 text-white">
              <h3 className="text-sm font-semibold">Scan Log</h3>
              <p className="text-xs text-white/60 mt-0.5">Newest scans first.</p>
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {sortedEntries.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No scans logged yet.</div>
              ) : (
                sortedEntries.map((entry) => (
                  <div key={entry.id} className="border-b border-neutral-200 px-4 py-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-neutral-950">{new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-sm font-semibold tabular-nums text-neutral-950">{entry.weightKg.toFixed(1)} {weight.unit}</div>
                        <Button variant="ghost" size="sm" onClick={() => void removeEntry(entry.id)} className="h-7 px-2 text-neutral-400 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      <span>Fat {formatPct(entry.fatPct)}</span>
                      <span>Muscle {formatPct(entry.musclePct)}</span>
                      <span>Water {formatPct(entry.waterPct)}</span>
                      <span>Bone {entry.boneKg == null ? "—" : `${entry.boneKg.toFixed(1)} kg`}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function formatPct(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function InBodyGraph({ entries, targetWeight, targetFat, unit }: { entries: InBodyEntry[]; targetWeight: number; targetFat: number; unit: string }) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <MetricSparkline label="Weight" values={ordered.map((entry) => ({ label: entry.date, value: entry.weightKg }))} target={targetWeight} suffix={` ${unit}`} />
      <MetricSparkline
        label="Body Fat"
        // Weigh-ins without a body-fat reading are skipped rather than plotted as 0.
        values={ordered.filter((entry) => entry.fatPct != null).map((entry) => ({ label: entry.date, value: entry.fatPct as number }))}
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
