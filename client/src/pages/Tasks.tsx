import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2, Plus, Check } from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type Task = {
  _id: string;
  title: string;
  date: string;
  done: boolean;
};

// ===== Helpers =====
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayISO = () => new Date().toISOString().slice(0, 10);

function isWeekend(iso: string) {
  const dow = new Date(iso).getUTCDay();
  return dow === 0 || dow === 6;
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
export default function Tasks() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Task[]>("/tasks/month", { params: { year, month } });
      setTasks(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Build calendar grid (Monday-start)
  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startDow = firstOfMonth.getUTCDay(); // 0=Sun
    const lead = startDow === 0 ? 6 : startDow - 1; // Monday-start
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < lead; i++) out.push({ iso: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d));
      out.push({ iso: dt.toISOString().slice(0, 10), day: d });
    }
    while (out.length % 7 !== 0) out.push({ iso: null, day: null });
    return out;
  }, [year, month]);

  const tasksByDate: Record<string, Task[]> = {};
  for (const t of tasks) {
    const k = t.date.slice(0, 10);
    (tasksByDate[k] ||= []).push(t);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
  };

  const today = todayISO();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.done).length;

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Tasks</h1>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
      </motion.div>

      {/* ===== Range nav + headline ===== */}
      <motion.div {...stagger(1)} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium ml-2 truncate">{monthLabel}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Progress</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${year}-${month}-${completedTasks}-${totalTasks}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums"
              style={{ color: totalTasks > 0 && completedTasks === totalTasks ? "var(--color-income)" : "var(--color-foreground)" }}
            >
              {completedTasks}
              <span className="text-muted-foreground">/{totalTasks}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ===== Calendar ===== */}
      <motion.div {...stagger(2)}>
        <Card>
          <CardContent className="p-3 md:p-4">
            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((c, i) => {
                if (!c.iso) return <div key={`pad-${i}`} />;
                return <DayCell key={c.iso} iso={c.iso} day={c.day!} tasks={tasksByDate[c.iso] ?? []} isToday={c.iso === today} weekend={isWeekend(c.iso)} index={i} onClick={() => setPickedDate(c.iso)} />;
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Day dialog ===== */}
      {pickedDate && <DayDialog date={pickedDate} tasks={tasksByDate[pickedDate] ?? []} onClose={() => setPickedDate(null)} onChanged={load} />}
    </div>
  );
}

// =====================================================================
// DayCell
// =====================================================================
function DayCell({ iso, day, tasks, isToday, weekend, index, onClick }: { iso: string; day: number; tasks: Task[]; isToday: boolean; weekend: boolean; index: number; onClick: () => void }) {
  const delay = Math.min(index * 0.012, 0.4);

  const hasIncomplete = tasks.some((t) => !t.done);
  const allDone = tasks.length > 0 && !hasIncomplete;

  let bg = "var(--color-card)";
  let borderColor = "var(--color-border)";
  if (weekend) bg = "var(--color-off-weekend-bg)";
  if (isToday) borderColor = "var(--color-foreground)";

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -1, boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08)" }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`rounded-md border p-1.5 md:p-2 cursor-pointer flex flex-col text-left overflow-hidden relative md:min-h-[92px] aspect-square md:aspect-auto ${isToday ? "border-[1.5px]" : ""}`}
      style={{ background: bg, borderColor }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] md:text-xs font-semibold font-mono text-muted-foreground leading-none">{day}</span>
        {allDone && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }} className="flex-shrink-0 w-3 h-3 rounded-full flex items-center justify-center" style={{ background: "var(--color-income)" }}>
            <Check className="h-2 w-2 text-white" strokeWidth={3} />
          </motion.span>
        )}
        {!allDone && tasks.length > 0 && <span className="text-[9px] md:text-[10px] font-mono tabular-nums text-muted-foreground leading-none">{tasks.filter((t) => !t.done).length}</span>}
      </div>

      {/* Task previews — desktop shows up to 3, mobile shows count */}
      <div className="hidden md:flex flex-col gap-0.5 mt-0.5 overflow-hidden">
        {tasks.slice(0, 3).map((t) => (
          <div key={t._id} className={`text-[10px] leading-tight truncate flex items-center gap-1 ${t.done ? "line-through text-muted-foreground/60" : "text-foreground"}`}>
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: t.done ? "var(--color-muted-foreground)" : "var(--color-foreground)" }} />
            {t.title}
          </div>
        ))}
        {tasks.length > 3 && <div className="text-[10px] text-muted-foreground font-medium mt-0.5">+{tasks.length - 3} more</div>}
      </div>

      {/* Mobile dot indicators */}
      <div className="md:hidden flex flex-wrap gap-0.5 mt-auto">
        {tasks.slice(0, 6).map((t) => (
          <span key={t._id} className="w-1.5 h-1.5 rounded-full" style={{ background: t.done ? "var(--color-muted-foreground)" : "var(--color-foreground)" }} />
        ))}
        {tasks.length > 6 && <span className="text-[8px] text-muted-foreground leading-none">+{tasks.length - 6}</span>}
      </div>
    </motion.button>
  );
}

// =====================================================================
// DayDialog
// =====================================================================
function DayDialog({ date, tasks, onClose, onChanged }: { date: string; tasks: Task[]; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const label = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const add = async () => {
    if (!title.trim() || adding) return;
    setAdding(true);
    try {
      await api.post("/tasks", { title: title.trim(), date });
      setTitle("");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (t: Task) => {
    try {
      await api.patch(`/tasks/${t._id}`, { done: !t.done });
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/tasks/${id}`);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const completedCount = tasks.filter((t) => t.done).length;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="!max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between gap-3 flex-wrap">
            <span>{label}</span>
            {tasks.length > 0 && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground font-normal">
                {completedCount}/{tasks.length} done
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Add input */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Add task</Label>
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs doing?"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add();
                }}
                autoFocus
              />
              <Button variant="default" size="default" onClick={add} disabled={!title.trim() || adding}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-1">
            {tasks.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-sm text-muted-foreground">No tasks yet.</div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {tasks.map((t, i) => (
                  <motion.div key={t._id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, delay: i * 0.03 }} className="flex items-center gap-3 py-2 group rounded-md hover:bg-muted/40 px-2 -mx-2 transition-colors">
                    <Checkbox checked={t.done} onCheckedChange={() => toggle(t)} />
                    <span className={`flex-1 text-sm transition-all ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => del(t._id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
