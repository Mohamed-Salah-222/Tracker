import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { TaskRow } from "../components/TaskRow";
import { Check, ChevronLeft, ChevronRight, Plus, Sun, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAY_SHORT, dayLong, getApiError, isWeekend, shiftDay, taskDay, type Task } from "../lib/tasks";

// ===== Motion =====
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
export default function Tasks() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  // Mirrors `tasks` so optimistic edits inside the day dialog can read the current
  // value synchronously instead of refetching the whole month on every checkbox.
  const tasksRef = useRef<Task[]>([]);
  const writeTasks = useCallback((next: Task[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Task[]>("/tasks/month", { params: { year, month } });
      writeTasks(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [year, month, writeTasks]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<Task[]>("/tasks/overdue", { params: { today: todayISO() } })
      .then((r) => setOverdueCount(r.data.length))
      .catch(() => setOverdueCount(0));
  }, [tasks]);

  // Monday-start grid.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startDow = firstOfMonth.getUTCDay();
    const lead = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < lead; i++) out.push({ iso: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ iso: new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10), day: d });
    }
    while (out.length % 7 !== 0) out.push({ iso: null, day: null });
    return out;
  }, [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) (map[taskDay(t)] ||= []).push(t);
    return map;
  }, [tasks]);

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const step = (by: number) => {
    const m = month + by;
    if (m < 1) {
      setYear(year - 1);
      setMonth(12);
    } else if (m > 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(m);
  };

  const today = todayISO();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const daysPlanned = Object.keys(tasksByDate).length;

  const goToToday = () => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
    setPickedDate(todayISO());
  };

  // =====================================================================
  return (
    <div className="w-full max-w-[1100px] space-y-4">
      {/* ===== Header ===== */}
      <motion.header {...fadeUp} className="flex items-center justify-between gap-3">
        <h1 className="hidden text-xl font-semibold tracking-tight md:block">Tasks</h1>
        <h1 className="sr-only md:hidden">Tasks</h1>
        <div className="ml-auto flex items-center gap-2">
          {overdueCount > 0 && (
            <Link
              to="/today"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-foreground bg-foreground px-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              {overdueCount} overdue
            </Link>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={goToToday}>
            <Sun className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Today
          </Button>
        </div>
      </motion.header>

      {/* ===== Month nav + summary ===== */}
      <motion.section {...stagger(1)} aria-label="Month summary">
        <Card>
          <CardContent className="px-4 py-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav aria-label="Select month" className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(-1)} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => step(1)} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
                <div className="ml-1.5 min-w-0">
                  <div className="truncate text-base font-semibold tracking-tight">{monthLabel}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {total === 0 ? "No tasks" : `${daysPlanned} day${daysPlanned === 1 ? "" : "s"} planned`}
                  </div>
                </div>
              </nav>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Done</div>
                  <div className="font-mono text-xl font-semibold tabular-nums tracking-tight">
                    {done}
                    <span className="text-muted-foreground">/{total}</span>
                  </div>
                </div>
                <div className="h-9 w-24 self-center">
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                  <div className="mt-1 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{pct}%</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== Calendar ===== */}
      <motion.section {...stagger(2)} aria-label="Task calendar">
        <Card>
          <CardContent className="px-2 py-0 sm:px-3">
            <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1 pb-1 sm:gap-1.5">
                {Array.from({ length: 35 }, (_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-md md:aspect-auto md:h-[92px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 pb-1 sm:gap-1.5">
                {cells.map((c, i) =>
                  c.iso ? (
                    <DayCell key={c.iso} iso={c.iso} day={c.day!} tasks={tasksByDate[c.iso] ?? []} isToday={c.iso === today} weekend={isWeekend(c.iso)} onClick={() => setPickedDate(c.iso)} />
                  ) : (
                    <div key={`pad-${i}`} />
                  ),
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {!loading && total === 0 && (
        <motion.p {...stagger(3)} className="text-center text-sm text-muted-foreground">
          Nothing planned in {monthLabel}. Tap any day to add something{isCurrentMonth ? "" : ", or jump back to today"}.
        </motion.p>
      )}

      {pickedDate && (
        <DayDialog
          date={pickedDate}
          tasks={tasksByDate[pickedDate] ?? []}
          onClose={() => setPickedDate(null)}
          onLocalChange={writeTasks}
          readTasks={() => tasksRef.current}
        />
      )}
    </div>
  );
}

// =====================================================================
// DayCell
// =====================================================================
function DayCell({ iso, day, tasks, isToday, weekend, onClick }: { iso: string; day: number; tasks: Task[]; isToday: boolean; weekend: boolean; onClick: () => void }) {
  const left = tasks.filter((t) => !t.done).length;
  const allDone = tasks.length > 0 && left === 0;

  const summary = tasks.length === 0 ? "no tasks" : allDone ? `all ${tasks.length} done` : `${left} of ${tasks.length} left`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${dayLong(iso)}, ${summary}`}
      className={`relative flex aspect-square min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border p-1 text-left transition-colors hover:border-border-strong hover:bg-muted/50 md:aspect-auto md:min-h-[92px] md:p-2 ${
        isToday ? "border-[1.5px] border-foreground" : "border-border"
      } ${weekend ? "bg-muted/40" : "bg-card"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`font-mono text-[11px] leading-none md:text-xs ${isToday ? "font-bold text-foreground" : "font-semibold text-muted-foreground"}`}>{day}</span>
        {allDone ? (
          <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-foreground" aria-hidden>
            <Check className="h-2 w-2 text-background" strokeWidth={3.5} />
          </span>
        ) : (
          left > 0 && <span className="font-mono text-[9px] font-semibold leading-none tabular-nums text-foreground md:text-[10px]">{left}</span>
        )}
      </div>

      {/* Desktop: real titles. */}
      <div className="mt-1 hidden min-h-0 flex-col gap-0.5 overflow-hidden md:flex">
        {tasks.slice(0, 3).map((t) => (
          <div key={t._id} className={`flex items-center gap-1 truncate text-[10px] leading-tight ${t.done ? "text-muted-foreground/60 line-through" : "text-foreground"}`}>
            <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: t.done ? "var(--color-muted-foreground)" : "var(--color-foreground)" }} />
            <span className="truncate">{t.title}</span>
          </div>
        ))}
        {tasks.length > 3 && <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">+{tasks.length - 3} more</div>}
      </div>

      {/* Mobile: a compact bar showing how much of the day is cleared. */}
      {tasks.length > 0 && (
        <div className="mt-auto md:hidden">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${((tasks.length - left) / tasks.length) * 100}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}

// =====================================================================
// DayDialog
// =====================================================================
function DayDialog({
  date,
  tasks,
  onClose,
  onLocalChange,
  readTasks,
}: {
  date: string;
  tasks: Task[];
  onClose: () => void;
  onLocalChange: (next: Task[]) => void;
  readTasks: () => Task[];
}) {
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const done = tasks.filter((t) => t.done).length;

  /** Optimistic month-level edit; rolls back the whole list if the request fails. */
  const mutate = async (next: Task[], request: () => Promise<unknown>) => {
    const before = readTasks();
    onLocalChange(next);
    try {
      await request();
    } catch (e) {
      toast.error(getApiError(e));
      onLocalChange(before);
    }
  };

  const add = async () => {
    const clean = title.trim();
    if (!clean || adding) return;
    setAdding(true);
    try {
      const r = await api.post<Task>("/tasks", { title: clean, date });
      onLocalChange([...readTasks(), r.data]);
      setTitle("");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setAdding(false);
    }
  };

  const toggle = (t: Task) =>
    void mutate(
      readTasks().map((x) => (x._id === t._id ? { ...x, done: !t.done } : x)),
      () => api.patch(`/tasks/${t._id}`, { done: !t.done }),
    );

  const rename = (t: Task, newTitle: string) =>
    void mutate(
      readTasks().map((x) => (x._id === t._id ? { ...x, title: newTitle } : x)),
      () => api.patch(`/tasks/${t._id}`, { title: newTitle }),
    );

  const moveToNextDay = (t: Task) => {
    const next = shiftDay(date, 1);
    void mutate(
      readTasks().map((x) => (x._id === t._id ? { ...x, date: next } : x)),
      () => api.patch(`/tasks/${t._id}`, { date: next }),
    );
  };

  const doDelete = () => {
    const t = pendingDelete;
    setPendingDelete(null);
    if (!t) return;
    void mutate(
      readTasks().filter((x) => x._id !== t._id),
      () => api.delete(`/tasks/${t._id}`),
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="!max-w-[520px] !w-[calc(100vw-1.5rem)]">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{dayLong(date)}</span>
              {tasks.length > 0 && (
                <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                  {done}/{tasks.length} done
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              aria-label="New task title"
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              autoFocus
              className="h-11 text-base sm:text-sm"
            />
            <Button variant="default" size="default" className="h-11 shrink-0 px-4" onClick={add} disabled={!title.trim() || adding} aria-label="Add task">
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          <div className="-mx-1 max-h-[45svh] overflow-y-auto px-1">
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <AnimatePresence initial={false}>
                {tasks.map((t) => (
                  <TaskRow key={t._id} task={t} onToggle={toggle} onRename={rename} onMove={moveToNextDay} onDelete={setPendingDelete} moveLabel="Move to next day" />
                ))}
              </AnimatePresence>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>“{pendingDelete?.title}”. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={doDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
