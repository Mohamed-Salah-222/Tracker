import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Trash2, Plus, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AxiosError } from "axios";

// ===== Types =====
type Task = {
  _id: string;
  title: string;
  date: string;
  done: boolean;
};

// ===== Helpers =====
const todayISO = () => new Date().toISOString().slice(0, 10);

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
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

// ===== Confetti (reused pattern from Income) =====
function spawnConfetti(originEl: HTMLElement) {
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["var(--color-income)", "#22c55e", "#86efac"];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("div");
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const dist = 50 + Math.random() * 40;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    el.style.cssText = `
      position: fixed;
      left: ${cx}px;
      top: ${cy}px;
      width: 6px;
      height: 6px;
      border-radius: 1px;
      background: ${colors[i % colors.length]};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: transform 800ms cubic-bezier(0.4, 0, 0.6, 1), opacity 800ms ease-out;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 850);
  }
}

// =====================================================================
// MAIN
// =====================================================================
export default function Today() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const allDoneFiredRef = useRef(false);
  const celebrationAnchorRef = useRef<HTMLDivElement>(null);

  const today = todayISO();

  const load = useCallback(async () => {
    try {
      const r = await api.get<Task[]>("/tasks/day", { params: { date: today } });
      setTasks(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayLabel = useMemo(
    () =>
      new Date(today).toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }),
    [today],
  );
  const todayDateLabel = useMemo(
    () =>
      new Date(today).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    [today],
  );

  const incomplete = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);
  const doneCount = completed.length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  // Trigger celebration when transitioning to all-done
  useEffect(() => {
    if (allDone && !allDoneFiredRef.current) {
      allDoneFiredRef.current = true;
      if (celebrationAnchorRef.current) spawnConfetti(celebrationAnchorRef.current);
    }
    if (!allDone) {
      allDoneFiredRef.current = false;
    }
  }, [allDone]);

  const add = async () => {
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      await api.post("/tasks", { title: title.trim(), date: today });
      setTitle("");
      void load();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (t: Task) => {
    try {
      await api.patch(`/tasks/${t._id}`, { done: !t.done });
      void load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const moveToTomorrow = async (t: Task) => {
    try {
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const tomorrowISO = tomorrow.toISOString().slice(0, 10);
      await api.patch(`/tasks/${t._id}`, { date: tomorrowISO });
      toast.success(`Moved "${t.title}" to tomorrow`);
      void load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/tasks/${id}`);
      void load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <div className="w-full max-w-[720px] mx-auto space-y-5">
      {/* ===== Hero day card ===== */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-6 md:p-8">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex flex-col min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</div>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">{todayLabel}</h1>
                <div className="text-sm text-muted-foreground mt-1">{todayDateLabel}</div>
              </div>
              <div className="text-right flex-shrink-0" ref={celebrationAnchorRef}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Progress</div>
                <AnimatePresence mode="wait">
                  <motion.div key={`${doneCount}-${total}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-3xl md:text-4xl font-semibold font-mono tracking-tight tabular-nums mt-1" style={{ color: allDone ? "var(--color-income)" : "var(--color-foreground)" }}>
                    {total > 0 ? (
                      <>
                        {doneCount}
                        <span className="text-muted-foreground">/{total}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress bar */}
            {total > 0 && (
              <div className="mt-5">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: "var(--color-income)", height: "100%" }} />
                </div>
                <AnimatePresence mode="wait">
                  {allDone ? (
                    <motion.div key="all-done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="text-xs mt-2 font-medium flex items-center gap-1.5" style={{ color: "var(--color-income)" }}>
                      <Sparkles className="h-3 w-3" />
                      All done for today.
                    </motion.div>
                  ) : (
                    <motion.div key="progress" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="text-xs mt-2 text-muted-foreground font-mono tabular-nums">
                      {pct}% · {incomplete.length} {incomplete.length === 1 ? "task" : "tasks"} left
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Add task ===== */}
      <motion.div {...stagger(1)}>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                <Plus className="h-3 w-3" />
                Add task
              </Label>
              <div className="flex gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs doing today?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void add();
                  }}
                />
                <Button variant="default" size="default" onClick={add} disabled={!title.trim() || adding}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Tasks ===== */}
      {total === 0 ? (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-sm font-medium mb-1">Nothing planned for today.</div>
              <div className="text-sm text-muted-foreground">
                Add a task above or{" "}
                <Link to="/tasks" className="underline hover:text-foreground transition-colors">
                  plan from the Tasks page
                </Link>
                .
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Up next */}
          {incomplete.length > 0 && (
            <motion.div {...stagger(2)} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">Up next · {incomplete.length}</div>
              <Card>
                <CardContent className="p-2">
                  <AnimatePresence initial={false}>
                    {incomplete.map((t) => (
                      <TaskRow key={t._id} task={t} onToggle={toggle} onDelete={del} onMoveToTomorrow={moveToTomorrow} />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Done */}
          {completed.length > 0 && (
            <motion.div {...stagger(3)} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 flex items-center gap-2">
                <span>Done · {completed.length}</span>
              </div>
              <Card className="opacity-70">
                <CardContent className="p-2">
                  <AnimatePresence initial={false}>
                    {completed.map((t) => (
                      <TaskRow key={t._id} task={t} onToggle={toggle} onDelete={del} onMoveToTomorrow={moveToTomorrow} />
                    ))}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// TaskRow
// =====================================================================
function TaskRow({ task, onToggle, onDelete, onMoveToTomorrow }: { task: Task; onToggle: (t: Task) => void; onDelete: (id: string) => void; onMoveToTomorrow: (t: Task) => void }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="flex items-center gap-3 py-2 px-2 group rounded-md hover:bg-muted/40 transition-colors">
      <Checkbox checked={task.done} onCheckedChange={() => onToggle(task)} />
      <motion.span animate={task.done ? { opacity: 0.5 } : { opacity: 1 }} className={`flex-1 text-sm transition-all ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {task.title}
      </motion.span>
      {!task.done && (
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onMoveToTomorrow(task)} title="Move to tomorrow">
          <ArrowRight className="h-3 w-3" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete(task._id)} title="Delete">
        <Trash2 className="h-3 w-3" />
      </Button>
    </motion.div>
  );
}
