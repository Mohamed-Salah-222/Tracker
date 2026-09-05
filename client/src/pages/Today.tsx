import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { TaskRow } from "../components/TaskRow";
import SleepCard from "../components/SleepCard";
import { TaskWhenDialog } from "../components/TaskWhen";
import { AheadCard } from "../components/AheadCard";
import JournalCard from "../components/JournalCard";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListChecks, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { fullDate, getApiError, relativeDay, shiftDay, taskDay, weekdayLong, type Task } from "../lib/tasks";
import { useSettings } from "../lib/useSettings";

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

/** Monochrome burst: the palette is black and white, so the confetti is too. */
function spawnConfetti(originEl: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const shades = ["#18181b", "#52525b", "#a1a1aa", "#d4d4d8"];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("div");
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const dist = 50 + Math.random() * 40;
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:6px;height:6px;border-radius:1px;background:${shades[i % shades.length]};pointer-events:none;z-index:9999;transform:translate(-50%,-50%);transition:transform 800ms cubic-bezier(0.4,0,0.6,1),opacity 800ms ease-out;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 850);
  }
}

// =====================================================================
// MAIN
// =====================================================================
export default function Today() {
  const { enabled } = useSettings();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [movingAll, setMovingAll] = useState(false);

  const celebrationAnchor = useRef<HTMLDivElement>(null);
  const allDoneFired = useRef(false);

  // Mirrors `tasks` so optimistic edits can read the current value synchronously.
  const tasksRef = useRef<Task[]>([]);
  const writeTasks = useCallback((next: Task[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const isToday = selectedDate === todayISO();

  /**
   * The time and reminder editor. One dialog for whichever row asked for it, rather
   * than one mounted per task.
   */
  const [whenFor, setWhenFor] = useState<Task | null>(null);
  const saveWhen = async (patch: { time: string | null; remindAt: string | null }) => {
    if (!whenFor) return;
    const target = whenFor;
    writeTasks(tasksRef.current.map((t) => (t._id === target._id ? { ...t, ...patch, remindedAt: null } : t)));
    try {
      await api.patch(`/tasks/${target._id}`, patch);
    } catch (e) {
      toast.error(getApiError(e));
      void load();
    }
  };


  // ----- Load -----
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Viewing today seeds that day's anchor task first, so the habit tracker
      // always has something to measure. The date comes from the browser because
      // "today" means the user's local calendar day, not the server's UTC one.
      const isCurrentDay = selectedDate === todayISO();
      const r = isCurrentDay ? await api.post<Task[]>("/tasks/ensure-daily", { date: selectedDate }) : await api.get<Task[]>("/tasks/day", { params: { date: selectedDate } });
      writeTasks(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, writeTasks]);

  const loadOverdue = useCallback(async () => {
    try {
      const r = await api.get<Task[]>("/tasks/overdue", { params: { today: todayISO() } });
      setOverdue(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadOverdue();
  }, [loadOverdue]);

  // ----- Derived -----
  /**
   * The day in the order it happens.
   *
   * Anything with a time comes first, earliest first; everything else keeps the order
   * it was added in. A list that ignores the times it was given is not a plan for the
   * day, it is just a list.
   */
  const incomplete = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .slice()
        .sort((a, b) => {
          if (a.time && b.time) return a.time.localeCompare(b.time);
          if (a.time) return -1;
          if (b.time) return 1;
          return 0;
        }),
    [tasks],
  );
  const completed = useMemo(() => tasks.filter((t) => t.done), [tasks]);
  const total = tasks.length;
  const doneCount = completed.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (allDone && !allDoneFired.current) {
      allDoneFired.current = true;
      if (celebrationAnchor.current) spawnConfetti(celebrationAnchor.current);
    }
    if (!allDone) allDoneFired.current = false;
  }, [allDone]);

  // ----- Mutations (optimistic) -----
  const patchTask = useCallback(
    async (task: Task, patch: Partial<Pick<Task, "title" | "done" | "date">>, opts?: { removeFromDay?: boolean }) => {
      const before = tasksRef.current;
      writeTasks(opts?.removeFromDay ? before.filter((t) => t._id !== task._id) : before.map((t) => (t._id === task._id ? { ...t, ...patch } : t)));
      try {
        await api.patch(`/tasks/${task._id}`, patch);
      } catch (e) {
        toast.error(getApiError(e));
        writeTasks(before);
      }
    },
    [writeTasks],
  );

  const toggle = useCallback((task: Task) => void patchTask(task, { done: !task.done }), [patchTask]);
  const rename = useCallback((task: Task, newTitle: string) => void patchTask(task, { title: newTitle }), [patchTask]);

  const move = useCallback(
    (task: Task) => {
      const target = shiftDay(selectedDate, 1);
      void patchTask(task, { date: target }, { removeFromDay: true });
    },
    [patchTask, selectedDate],
  );

  const confirmDelete = useCallback(async () => {
    const task = pendingDelete;
    setPendingDelete(null);
    if (!task) return;
    const before = tasksRef.current;
    writeTasks(before.filter((t) => t._id !== task._id));
    try {
      await api.delete(`/tasks/${task._id}`);
    } catch (e) {
      toast.error(getApiError(e));
      writeTasks(before);
    }
  }, [pendingDelete, writeTasks]);

  const add = async () => {
    const clean = title.trim();
    if (!clean || adding) return;
    setAdding(true);
    try {
      const r = await api.post<Task>("/tasks", { title: clean, date: selectedDate });
      writeTasks([...tasksRef.current, r.data]);
      setTitle("");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setAdding(false);
    }
  };

  // ----- Overdue -----
  const overdueVisible = isToday ? overdue : [];

  const pullOverdueTask = async (task: Task) => {
    setOverdue((list) => list.filter((t) => t._id !== task._id));
    try {
      await api.patch(`/tasks/${task._id}`, { date: selectedDate });
      writeTasks([...tasksRef.current, { ...task, date: selectedDate }]);
    } catch (e) {
      toast.error(getApiError(e));
      void loadOverdue();
    }
  };

  const pullAllOverdue = async () => {
    if (overdueVisible.length === 0 || movingAll) return;
    setMovingAll(true);
    const ids = overdueVisible.map((t) => t._id);
    const snapshot = overdueVisible;
    setOverdue([]);
    try {
      await api.post("/tasks/bulk-move", { ids, date: selectedDate });
      writeTasks([...tasksRef.current, ...snapshot.map((t) => ({ ...t, date: selectedDate }))]);
      toast.success(`Moved ${ids.length} task${ids.length === 1 ? "" : "s"} to today`);
    } catch (e) {
      toast.error(getApiError(e));
      void loadOverdue();
    } finally {
      setMovingAll(false);
    }
  };

  // =====================================================================
  return (
    <div className="w-full max-w-[720px] space-y-4">
      {/* ===== Date navigation ===== */}
      <motion.nav {...fadeUp} aria-label="Select day" className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Previous day" onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <button
          type="button"
          onClick={() => setSelectedDate(todayISO())}
          disabled={isToday}
          aria-label={isToday ? "Showing today" : `Showing ${fullDate(selectedDate)}. Jump to today`}
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-medium transition-colors enabled:hover:border-border enabled:hover:bg-muted/60 disabled:cursor-default"
        >
          <span className="truncate">{fullDate(selectedDate)}</span>
          {!isToday && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jump to today</span>}
        </button>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Next day" onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </motion.nav>

      {/* ===== Hero ===== */}
      <motion.section {...stagger(1)} aria-label="Day summary">
        <Card>
          <CardContent className="px-4 py-0 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isToday ? "Today" : relativeDay(selectedDate)}</div>
                <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{weekdayLong(selectedDate)}</h1>
                <div className="mt-0.5 text-sm text-muted-foreground">{fullDate(selectedDate)}</div>
              </div>
              <div className="shrink-0 text-right" ref={celebrationAnchor}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Done</div>
                <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                  {doneCount}
                  <span className="text-muted-foreground">/{total}</span>
                </div>
              </div>
            </div>

            {total > 0 && (
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  {allDone ? (
                    <>
                      <Sparkles className="h-3 w-3" aria-hidden />
                      <span className="font-medium">All done{isToday ? " for today" : ""}.</span>
                    </>
                  ) : (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {pct}% · {incomplete.length} left
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== Last night ===== */}
      {enabled("sleep") && (
        <motion.section {...stagger(2)} aria-label="Sleep">
          <SleepCard date={selectedDate} />
        </motion.section>
      )}

      {/* ===== Overdue ===== */}
      <AnimatePresence>
        {overdueVisible.length > 0 && (
          <motion.section {...stagger(2)} exit={{ opacity: 0, height: 0 }} aria-label="Overdue tasks">
            <Card style={{ boxShadow: "inset 3px 0 0 0 var(--color-foreground)" }}>
              <CardContent className="px-4 py-0 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                    <TriangleAlert className="h-3 w-3" aria-hidden />
                    Overdue · {overdueVisible.length}
                  </h2>
                  <Button variant="default" size="sm" className="h-8" disabled={movingAll} onClick={() => void pullAllOverdue()}>
                    Move all to today
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Left unfinished on earlier days.</p>
                <div className="mt-2 space-y-0.5">
                  <AnimatePresence initial={false}>
                    {overdueVisible.map((t) => (
                      <TaskRow
                        key={t._id}
                        task={t}
                        showDate
                        moveLabel="Move to today"
                        onToggle={(task) => {
                          setOverdue((l) => l.filter((x) => x._id !== task._id));
                          void api.patch(`/tasks/${task._id}`, { done: true }).catch((e) => {
                            toast.error(getApiError(e));
                            void loadOverdue();
                          });
                        }}
                        onRename={(task, newTitle) => {
                          setOverdue((l) => l.map((x) => (x._id === task._id ? { ...x, title: newTitle } : x)));
                          void api.patch(`/tasks/${task._id}`, { title: newTitle }).catch((e) => {
                            toast.error(getApiError(e));
                            void loadOverdue();
                          });
                        }}
                        onMove={(task) => void pullOverdueTask(task)}
                        onDelete={(task) => {
                          setOverdue((l) => l.filter((x) => x._id !== task._id));
                          void api.delete(`/tasks/${task._id}`).catch((e) => {
                            toast.error(getApiError(e));
                            void loadOverdue();
                          });
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ===== Add ===== */}
      <motion.section {...stagger(3)} aria-label="Add a task">
        <Card>
          <CardContent className="px-4 py-0 sm:px-5">
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isToday ? "What needs doing today?" : `Add to ${relativeDay(selectedDate)}…`}
                aria-label="New task title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add();
                }}
                className="h-11 text-base sm:text-sm"
              />
              <Button variant="default" size="default" className="h-11 shrink-0 px-4" onClick={add} disabled={!title.trim() || adding} aria-label="Add task">
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== List ===== */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : total === 0 ? (
        <motion.div {...stagger(4)}>
          <Card>
            <CardContent className="px-6 py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-base font-semibold">{isToday ? "Nothing planned for today" : `Nothing planned for ${relativeDay(selectedDate)}`}</div>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Add one above, or{" "}
                <Link to="/tasks" className="underline underline-offset-2 hover:text-foreground">
                  plan the month
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {incomplete.length > 0 && (
            <motion.section {...stagger(4)} className="space-y-1.5" aria-label="Remaining tasks">
              <h2 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Up next · {incomplete.length}</h2>
              <Card>
                <CardContent className="px-2 py-0">
                  <AnimatePresence initial={false}>
                    {incomplete.map((t) => (
                      <TaskRow key={t._id} task={t} onToggle={toggle} onRename={rename} onMove={move} onDelete={setPendingDelete} onSetWhen={setWhenFor} moveLabel={isToday ? "Move to tomorrow" : "Move to next day"} />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {completed.length > 0 && (
            <motion.section {...stagger(5)} className="space-y-1.5" aria-label="Completed tasks">
              <h2 className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Check className="h-3 w-3" aria-hidden />
                Done · {completed.length}
              </h2>
              <Card>
                <CardContent className="px-2 py-0">
                  <AnimatePresence initial={false}>
                    {completed.map((t) => (
                      <TaskRow key={t._id} task={t} onToggle={toggle} onRename={rename} onDelete={setPendingDelete} onSetWhen={setWhenFor} />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </>
      )}

      {/* ===== What is coming ===== */}
      {isToday && (
        <motion.section {...stagger(5)} aria-label="Coming up">
          <AheadCard today={selectedDate} />
        </motion.section>
      )}

      {/* ===== The day in your own words ===== */}
      {enabled("journal") && (
        <motion.section {...stagger(6)} aria-label="Journal">
          <JournalCard key={selectedDate} date={selectedDate} />
        </motion.section>
      )}

      {/* ===== Link out ===== */}
      <div className="flex justify-center pt-1">
        <Link to="/tasks" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Open the month calendar
        </Link>
      </div>

      {whenFor && <TaskWhenDialog task={whenFor} open onOpenChange={(o) => !o && setWhenFor(null)} onSave={saveWhen} />}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” on {pendingDelete ? fullDate(taskDay(pendingDelete)) : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
