import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Plus, CalendarOff, Check, TrendingUp, TrendingDown } from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type Entry = {
  _id: string;
  date: string;
  minutes: number;
  ratePerMinute: number;
  amount: number;
};
type DayStatusValue = "vacation" | "sick" | "holiday";
type DayStatus = {
  _id: string;
  date: string;
  status: DayStatusValue;
  note?: string;
};
type RangeData = { entries: Entry[]; dayStatuses: DayStatus[]; total: number };
type View = "today" | "week" | "month";

// ===== Helpers =====
const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCompact = (n: number) => (n === 0 ? "—" : `$${Math.round(n)}`);
const todayISO = () => new Date().toISOString().slice(0, 10);
const isWeekend = (iso: string) => {
  const day = new Date(iso).getUTCDay();
  return day === 0 || day === 6;
};

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

function mondayOfWeek(iso: string) {
  const d = new Date(iso);
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ===== Motion variants =====
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// ===== Confetti reward =====
function spawnConfetti(originEl: HTMLElement) {
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const root = document.body;

  for (let i = 0; i < 14; i++) {
    const el = document.createElement("div");
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
    const dist = 40 + Math.random() * 30;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    el.style.cssText = `
      position: fixed;
      left: ${cx}px;
      top: ${cy}px;
      width: 6px;
      height: 6px;
      border-radius: 1px;
      background: var(--color-income);
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: transform 700ms cubic-bezier(0.4, 0, 0.6, 1), opacity 700ms ease-out;
    `;
    root.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 750);
  }
}

// ====================================================================
// MAIN COMPONENT
// ====================================================================
export default function Income() {
  const [view, setView] = useState<View>("today");
  const [anchor, setAnchor] = useState(todayISO());
  const [rate, setRate] = useState<number | null>(null);
  const [data, setData] = useState<RangeData>({ entries: [], dayStatuses: [], total: 0 });
  const [sparklineData, setSparklineData] = useState<RangeData>({ entries: [], dayStatuses: [], total: 0 });
  const [markOffOpen, setMarkOffOpen] = useState(false);
  const [logDate, setLogDate] = useState(todayISO());
  const [minutes, setMinutes] = useState<string>("");

  // ----- Range computation -----
  const range = useMemo(() => {
    if (view === "today") return { from: anchor, to: anchor };
    if (view === "week") {
      const mon = mondayOfWeek(anchor);
      const sun = shiftDay(mon, 6);
      return { from: mon, to: sun };
    }
    const d = new Date(anchor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }, [view, anchor]);

  // Sparkline always shows last 14 days from today
  const sparklineRange = useMemo(() => {
    const today = todayISO();
    return { from: shiftDay(today, -13), to: today };
  }, []);

  // ----- Data loading -----
  const loadAll = useCallback(async () => {
    try {
      const rateReq = api.get<{ ratePerMinute: number } | null>("/income/rate");

      let mainReq;
      if (view === "month") {
        const d = new Date(anchor);
        mainReq = api.get<RangeData>("/income/month", {
          params: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 },
        });
      } else {
        mainReq = api.get<RangeData>("/income/range", { params: range });
      }

      const sparkReq = api.get<RangeData>("/income/range", { params: sparklineRange });

      const [r, main, spark] = await Promise.all([rateReq, mainReq, sparkReq]);
      setRate(r.data?.ratePerMinute ?? null);
      setData(main.data);
      setSparklineData(spark.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [view, anchor, range, sparklineRange]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ----- Lookup maps -----
  const entriesByDate = useMemo(() => {
    const m: Record<string, Entry> = {};
    for (const e of data.entries) m[e.date.slice(0, 10)] = e;
    return m;
  }, [data.entries]);

  const statusByDate = useMemo(() => {
    const m: Record<string, DayStatus> = {};
    for (const s of data.dayStatuses) m[s.date.slice(0, 10)] = s;
    return m;
  }, [data.dayStatuses]);

  const sparkByDate = useMemo(() => {
    const m: Record<string, { entry?: Entry; status?: DayStatus }> = {};
    for (const e of sparklineData.entries) {
      const k = e.date.slice(0, 10);
      m[k] = { ...(m[k] || {}), entry: e };
    }
    for (const s of sparklineData.dayStatuses) {
      const k = s.date.slice(0, 10);
      m[k] = { ...(m[k] || {}), status: s };
    }
    return m;
  }, [sparklineData]);

  // ----- Derived stats -----
  const workingDays = data.entries.length;
  const offDays = data.dayStatuses.length;
  const avg = workingDays > 0 ? data.total / workingDays : 0;
  const totalMinutes = data.entries.reduce((s, e) => s + e.minutes, 0);
  const todayEntry = view === "today" ? entriesByDate[anchor] : undefined;
  const todayMinutes = todayEntry?.minutes ?? 0;

  // Off-day breakdown
  useMemo(() => {
    const counts: Record<DayStatusValue, number> = { vacation: 0, sick: 0, holiday: 0 };
    for (const s of data.dayStatuses) counts[s.status]++;
    return counts;
  }, [data.dayStatuses]);

  // ----- Header label -----
  const headerLabel = useMemo(() => {
    if (view === "today") {
      return new Date(anchor).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    }
    if (view === "week") {
      const mon = new Date(range.from);
      const sun = new Date(range.to);
      const sameMonth = mon.getUTCMonth() === sun.getUTCMonth();
      const left = mon.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const right = sun.toLocaleDateString("en-US", {
        month: sameMonth ? undefined : "short",
        day: "numeric",
        timeZone: "UTC",
      });
      return `${left} – ${right}`;
    }
    return new Date(anchor).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [view, anchor, range]);

  // ----- Navigation (also syncs logDate) -----
  const setAnchorAndLog = (iso: string) => {
    setAnchor(iso);
    setLogDate(iso);
  };

  const prev = () => {
    if (view === "today") setAnchorAndLog(shiftDay(anchor, -1));
    else if (view === "week") setAnchorAndLog(shiftDay(anchor, -7));
    else {
      const d = new Date(anchor);
      d.setUTCMonth(d.getUTCMonth() - 1);
      setAnchorAndLog(d.toISOString().slice(0, 10));
    }
  };
  const next = () => {
    if (view === "today") setAnchorAndLog(shiftDay(anchor, 1));
    else if (view === "week") setAnchorAndLog(shiftDay(anchor, 7));
    else {
      const d = new Date(anchor);
      d.setUTCMonth(d.getUTCMonth() + 1);
      setAnchorAndLog(d.toISOString().slice(0, 10));
    }
  };
  const goToday = () => setAnchorAndLog(todayISO());

  const switchView = (v: View) => {
    setView(v);
    setAnchorAndLog(todayISO());
  };

  // ----- Live preview -----
  const livePreview = rate && minutes && !isNaN(+minutes) && +minutes > 0 ? fmtMoney(+minutes * rate) : "$0.00";
  const livePreviewActive = !!(rate && minutes && !isNaN(+minutes) && +minutes > 0);

  // ----- Submit -----
  const submitEntry = async (originBtn: HTMLElement | null) => {
    const m = parseFloat(minutes);
    if (!m || m <= 0) return toast.error("Enter minutes");
    if (rate == null) return toast.error("Set your rate first");
    try {
      const res = await api.post<Entry>("/income/entry", { date: logDate, minutes: m });
      setMinutes("");
      toast.success(`Logged ${fmtMoney(res.data.amount)}`);
      if (originBtn) spawnConfetti(originBtn);
      void loadAll();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Income</h1>
          <ViewSwitcher view={view} onChange={switchView} />
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
          <RatePill rate={rate} onSaved={loadAll} />
        </div>
      </motion.div>

      {/* ===== Range nav + headline ===== */}
      <motion.div {...stagger(1)} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={next} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium ml-2 truncate">{headerLabel}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{view === "today" ? "Today" : view === "week" ? "This week" : "This month"}</div>
          <AnimatePresence mode="wait">
            <motion.div key={`${view}-${data.total}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums" style={{ color: data.total > 0 ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
              {fmtMoney(data.total)}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ===== Body: two columns ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
        {/* Main column */}
        <div className="space-y-5 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={view + anchor} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              {view === "today" && <TodayView dayKey={anchor} entry={entriesByDate[anchor]} status={statusByDate[anchor]} onChanged={loadAll} />}
              {view === "week" && <WeekView range={range} entriesByDate={entriesByDate} statusByDate={statusByDate} onChanged={loadAll} />}
              {view === "month" && (
                <MonthView
                  anchor={anchor}
                  entriesByDate={entriesByDate}
                  statusByDate={statusByDate}
                  onPickDay={(d) => {
                    setView("today");
                    setAnchorAndLog(d);
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Sparkline */}
          <Sparkline sparkByDate={sparkByDate} todayIso={todayISO()} />

          {/* Log form */}
          <LogSessionForm rate={rate} logDate={logDate} setLogDate={setLogDate} minutes={minutes} setMinutes={setMinutes} livePreview={livePreview} livePreviewActive={livePreviewActive} onSubmit={submitEntry} onMarkOff={() => setMarkOffOpen(true)} />
        </div>

        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-3">
            <SidebarMain label={view === "today" ? "Today's amount" : view === "week" ? "Week total" : "Month total"} value={fmtMoney(data.total)} hasValue={data.total > 0} />
            <div className="grid grid-cols-2 gap-3">
              {view === "today" ? (
                <>
                  <SidebarStat label="Minutes" value={todayMinutes.toString()} />
                  <SidebarStat label="Rate" value={rate != null ? `$${rate.toFixed(2)}` : "—"} />
                </>
              ) : (
                <>
                  <SidebarStat label="Work days" value={workingDays.toString()} />
                  <SidebarStat label={view === "week" ? "Minutes" : "Avg/day"} value={view === "week" ? totalMinutes.toString() : workingDays > 0 ? fmtMoney(avg) : "—"} />
                </>
              )}
            </div>
            {view !== "today" && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Breakdown</div>
                  <BreakdownRow label="Working days" value={workingDays.toString()} />
                  <BreakdownRow label="Days off" value={offDays.toString()} />
                  <BreakdownRow label="Total minutes" value={totalMinutes.toString()} />
                </CardContent>
              </Card>
            )}
          </div>
        </aside>
      </div>

      <MarkOffDialog open={markOffOpen} onOpenChange={setMarkOffOpen} defaultDate={logDate} onSaved={loadAll} />
    </div>
  );
}

// ====================================================================
// SUB-COMPONENTS
// ====================================================================

function SidebarMain({ label, value, hasValue }: { label: string; value: string; hasValue: boolean }) {
  return (
    <motion.div {...stagger(2)}>
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <AnimatePresence mode="wait">
            <motion.div key={value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-2xl font-semibold font-mono mt-1.5 tracking-tight tabular-nums" style={{ color: hasValue ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
              {value}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div {...stagger(3)}>
      <Card>
        <CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="text-lg font-semibold font-mono mt-1 tabular-nums">{value}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold font-mono tabular-nums">{value}</span>
    </div>
  );
}

function ViewSwitcher({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const views: View[] = ["today", "week", "month"];
  return (
    <div className="inline-flex p-[3px] bg-muted rounded-md gap-[2px] relative">
      {views.map((v) => (
        <button key={v} onClick={() => onChange(v)} className={`relative h-[26px] px-3 text-[13px] font-medium rounded-[4px] transition-colors capitalize ${view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {view === v && <motion.div layoutId="viewSwitcherActive" className="absolute inset-0 bg-card rounded-[4px] shadow-sm" style={{ zIndex: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
          <span className="relative z-10">{v}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------- Today ----------------
function TodayView({ dayKey, entry, status, onChanged }: { dayKey: string; entry?: Entry; status?: DayStatus; onChanged: () => void }) {
  return <DayCard dayKey={dayKey} entry={entry} status={status} onChanged={onChanged} size="lg" />;
}

// ---------------- Week ----------------
function WeekView({ range, entriesByDate, statusByDate, onChanged }: { range: { from: string; to: string }; entriesByDate: Record<string, Entry>; statusByDate: Record<string, DayStatus>; onChanged: () => void }) {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(shiftDay(range.from, i));

  return (
    <div className="space-y-2">
      {days.map((d, i) => (
        <motion.div key={d} {...stagger(i)}>
          <DayCard dayKey={d} entry={entriesByDate[d]} status={statusByDate[d]} onChanged={onChanged} size="md" />
        </motion.div>
      ))}
    </div>
  );
}

// ---------------- Month ----------------
function MonthView({ anchor, entriesByDate, statusByDate, onPickDay }: { anchor: string; entriesByDate: Record<string, Entry>; statusByDate: Record<string, DayStatus>; onPickDay: (iso: string) => void }) {
  const { cells, lead } = useMemo(() => {
    const d = new Date(anchor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const lead = firstDow === 0 ? 6 : firstDow - 1;

    const cells: { iso: string; day: number }[] = [];
    for (let day = 1; day <= last; day++) {
      const iso = new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
      cells.push({ iso, day });
    }
    return { cells, lead };
  }, [anchor]);

  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAY_SHORT.map((w) => (
            <div key={w} className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground py-1">
              {w}
            </div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {cells.map((cell, i) => {
            const entry = entriesByDate[cell.iso];
            const status = statusByDate[cell.iso];
            const weekend = isWeekend(cell.iso);
            return <MonthDayCell key={cell.iso} day={cell.day} iso={cell.iso} entry={entry} status={status} weekend={weekend} index={i} onClick={() => onPickDay(cell.iso)} />;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthDayCell({ day, entry, status, weekend, index, onClick }: { day: number; iso: string; entry?: Entry; status?: DayStatus; weekend: boolean; index: number; onClick: () => void }) {
  const delay = Math.min(index * 0.012, 0.4);

  let bg = "var(--color-card)";
  let borderColor = "var(--color-border)";
  if (entry) {
    borderColor = "color-mix(in oklch, var(--color-income), transparent 70%)";
  } else if (status) {
    bg = `var(--color-off-${status.status}-bg)`;
    borderColor = `color-mix(in oklch, var(--color-off-${status.status}), transparent 80%)`;
  } else if (weekend) {
    // Weekend distinct style: subtle diagonal hatching effect via lighter bg
    bg = "var(--color-off-weekend-bg)";
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -1, boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08)" }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="aspect-square md:min-h-[52px] rounded-md border p-1 md:p-1.5 cursor-pointer flex flex-col justify-between text-left overflow-hidden relative"
      style={{ background: bg, borderColor }}
    >
      <span className="text-[10px] md:text-[12px] font-medium md:font-semibold font-mono text-muted-foreground leading-none">{day}</span>
      {entry ? (
        <span className="text-[11px] md:text-[13px] font-semibold font-mono leading-none truncate" style={{ color: "var(--color-income)" }}>
          {fmtCompact(entry.amount)}
        </span>
      ) : status ? (
        <span className="text-[9px] md:text-[11px] font-medium leading-none capitalize truncate" style={{ color: `var(--color-off-${status.status})` }}>
          {status.status.slice(0, 3)}
        </span>
      ) : weekend ? (
        <>
          <span className="hidden md:inline text-[10px] font-medium leading-none text-muted-foreground/70">Weekend</span>
          <span className="md:hidden text-[8px] font-medium leading-none text-muted-foreground/70">W.E</span>
        </>
      ) : null}
    </motion.button>
  );
}

// ---------------- Day Card (Today + Week rows) ----------------
function DayCard({ dayKey, entry, status, onChanged, size }: { dayKey: string; entry?: Entry; status?: DayStatus; onChanged: () => void; size: "md" | "lg" }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [markOffOpen, setMarkOffOpen] = useState(false);
  const [mins, setMins] = useState(entry?.minutes.toString() ?? "");

  const weekend = isWeekend(dayKey);

  const handleEditOpen = (next: boolean) => {
    if (next) setMins(entry?.minutes.toString() ?? "");
    setEditOpen(next);
  };

  const saveEntry = async () => {
    if (!entry) return;
    const n = parseFloat(mins);
    if (!n || n <= 0) return toast.error("Invalid minutes");
    try {
      await api.patch(`/income/entry/${entry._id}`, { minutes: n });
      setEditOpen(false);
      toast.success("Updated");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const delEntry = async () => {
    if (!entry) return;
    try {
      await api.delete(`/income/entry/${entry._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const delStatus = async () => {
    try {
      await api.put("/income/day-status", { date: dayKey, status: null });
      toast.success("Removed");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const isOffDay = !entry && !!status;
  const showActions = !!entry || !!status;

  const dateObj = new Date(dayKey);
  const dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const dayName = WEEKDAY_LONG[(dateObj.getUTCDay() + 6) % 7];
  const dayNum = dateObj.getUTCDate();
  const weekdayShort = WEEKDAY_SHORT[(dateObj.getUTCDay() + 6) % 7];

  // ----- LG (Today) -----
  if (size === "lg") {
    const bgStyle = status && !entry ? { background: `var(--color-off-${status.status}-bg)`, borderColor: `color-mix(in oklch, var(--color-off-${status.status}), transparent 70%)` } : weekend && !entry && !status ? { background: "var(--color-off-weekend-bg)" } : {};

    return (
      <>
        <Card className="w-full" style={bgStyle}>
          <CardContent className="p-6 md:p-8 min-h-[180px] md:min-h-[220px]">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">{status && <StatusTag status={status.status} />}</div>
                <div className="text-sm font-medium mt-0.5 text-muted-foreground">
                  {dayName}, {dateLabel.split(",")[1].trim()}
                </div>
              </div>
              {showActions && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => (isOffDay ? setMarkOffOpen(true) : handleEditOpen(true))}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {entry ? (
              <>
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="text-5xl md:text-6xl font-semibold font-mono tracking-tighter tabular-nums" style={{ color: "var(--color-income)" }}>
                  {fmtMoney(entry.amount)}
                </motion.div>
                <div className="flex items-baseline gap-3 mt-3 text-sm text-muted-foreground">
                  <span className="font-mono tabular-nums">{entry.minutes} min</span>
                  <span className="opacity-50">×</span>
                  <span className="font-mono tabular-nums">${entry.ratePerMinute.toFixed(2)}/min</span>
                </div>
              </>
            ) : status ? (
              <>
                <div className="text-4xl md:text-5xl font-semibold tracking-tight" style={{ color: `var(--color-off-${status.status})` }}>
                  Day off
                </div>
                <div className="text-sm mt-2 text-muted-foreground">No income logged.</div>
              </>
            ) : weekend ? (
              <div className="text-5xl md:text-6xl font-semibold font-mono tracking-tighter tabular-nums text-muted-foreground/40">Weekend</div>
            ) : (
              <>
                <div className="text-4xl md:text-5xl font-semibold font-mono tracking-tighter tabular-nums text-muted-foreground opacity-50">$0.00</div>
                <div className="text-sm mt-3 text-muted-foreground">Nothing logged yet. Log a session below.</div>
              </>
            )}
          </CardContent>
        </Card>

        <EditEntryDialog open={editOpen} onOpenChange={handleEditOpen} entry={entry} mins={mins} setMins={setMins} onSave={saveEntry} dateLabel={dateLabel} />
        <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} isOffDay={isOffDay} entry={entry} status={status} dateLabel={dateLabel} onConfirm={isOffDay ? delStatus : delEntry} />
        <MarkOffDialog open={markOffOpen} onOpenChange={setMarkOffOpen} defaultDate={dayKey} currentStatus={status?.status} lockDate onSaved={onChanged} />
      </>
    );
  }

  // ----- MD (Week row) -----
  const rowBg = status && !entry ? { background: `var(--color-off-${status.status}-bg)`, borderColor: `color-mix(in oklch, var(--color-off-${status.status}), transparent 80%)` } : weekend && !entry ? { background: "var(--color-off-weekend-bg)" } : {};

  return (
    <>
      <Card className="hover:border-border-strong transition-colors" style={rowBg}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="flex flex-col items-center w-10 flex-shrink-0">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{weekdayShort}</span>
                <span className="text-xl font-semibold font-mono mt-0.5 tabular-nums">{dayNum}</span>
              </div>
              <div className="min-w-0 flex-1">
                {entry ? (
                  <>
                    <div className="text-xl font-semibold font-mono tabular-nums" style={{ color: "var(--color-income)" }}>
                      {fmtMoney(entry.amount)}
                    </div>
                    <div className="text-xs font-mono tabular-nums mt-0.5 text-muted-foreground">{entry.minutes} min</div>
                  </>
                ) : status ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-semibold" style={{ color: `var(--color-off-${status.status})` }}>
                      Off
                    </div>
                    <StatusTag status={status.status} />
                  </div>
                ) : weekend ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-semibold text-muted-foreground">Weekend</div>
                    <WeekendTag />
                  </div>
                ) : (
                  <div className="text-xl font-semibold font-mono text-muted-foreground opacity-50">—</div>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {showActions ? (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => (isOffDay ? setMarkOffOpen(true) : handleEditOpen(true))}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setMarkOffOpen(true)}>
                  Mark off
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <EditEntryDialog open={editOpen} onOpenChange={handleEditOpen} entry={entry} mins={mins} setMins={setMins} onSave={saveEntry} dateLabel={dateLabel} />
      <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} isOffDay={isOffDay} entry={entry} status={status} dateLabel={dateLabel} onConfirm={isOffDay ? delStatus : delEntry} />
      <MarkOffDialog open={markOffOpen} onOpenChange={setMarkOffOpen} defaultDate={dayKey} currentStatus={status?.status} lockDate onSaved={onChanged} />
    </>
  );
}

function StatusTag({ status }: { status: DayStatusValue }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded font-medium capitalize" style={{ color: `var(--color-off-${status})`, background: `var(--color-off-${status}-bg)` }}>
      {status}
    </span>
  );
}

function WeekendTag() {
  return <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-dashed border-border">weekend</span>;
}

// ---------------- Sparkline ----------------
function Sparkline({ sparkByDate, todayIso }: { sparkByDate: Record<string, { entry?: Entry; status?: DayStatus }>; todayIso: string }) {
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(shiftDay(todayIso, -i));

  const values = days.map((d) => sparkByDate[d]?.entry?.amount ?? 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const workingDays = values.filter((v) => v > 0).length;

  // Trend: first 7 days vs last 7 days
  const firstHalf = values.slice(0, 7).reduce((s, v) => s + v, 0);
  const secondHalf = values.slice(7).reduce((s, v) => s + v, 0);
  const trendUp = secondHalf >= firstHalf;
  const trendPct = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;

  return (
    <motion.div {...stagger(3)}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last 14 days</div>
              <div className="text-sm font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="font-mono tabular-nums">{fmtMoney(total)}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono tabular-nums text-muted-foreground">{workingDays} working days</span>
                {firstHalf > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium ml-1" style={{ color: trendUp ? "var(--color-income)" : "var(--color-off-sick)" }}>
                    {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="font-mono">
                      {trendUp ? "+" : ""}
                      {trendPct}%
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ background: "var(--color-income)" }} />
                <span>Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-muted-foreground/40" />
                <span>Off</span>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-1.5 h-28">
            {days.map((d, i) => {
              const v = sparkByDate[d]?.entry?.amount ?? 0;
              const s = sparkByDate[d]?.status;
              const isToday = d === todayIso;
              const heightPct = v > 0 ? Math.max((v / max) * 100, 6) : s ? 8 : 4;

              let bg = "var(--color-border)";
              if (v > 0) bg = "var(--color-income)";
              else if (s) bg = "color-mix(in oklch, var(--color-muted-foreground), transparent 60%)";

              const label = v > 0 ? `${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${fmtMoney(v)}` : s ? `${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${s.status}` : `${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: —`;

              return (
                <div key={d} className="flex-1 flex flex-col justify-end h-full relative group" title={label}>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      height: `${heightPct}%`,
                      background: bg,
                      transformOrigin: "bottom",
                      outline: isToday ? "2px solid var(--color-foreground)" : "none",
                      outlineOffset: "1px",
                    }}
                    className="rounded-t-sm group-hover:opacity-80 transition-opacity"
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-mono text-muted-foreground">
            <span>14d ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------- Log session form ----------------
function LogSessionForm({ rate, logDate, setLogDate, minutes, setMinutes, livePreview, livePreviewActive, onSubmit, onMarkOff }: { rate: number | null; logDate: string; setLogDate: (s: string) => void; minutes: string; setMinutes: (s: string) => void; livePreview: string; livePreviewActive: boolean; onSubmit: (originBtn: HTMLElement | null) => void; onMarkOff: () => void }) {
  return (
    <motion.div {...stagger(4)}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              Log session
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onMarkOff}>
              <CalendarOff className="h-3 w-3 mr-1.5" />
              Mark day off
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-[140px_120px_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Minutes</Label>
              <Input type="number" min="0" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" className="font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Amount</Label>
              <motion.div key={livePreview} initial={{ opacity: 0.5, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="h-9 flex items-center text-base font-semibold font-mono tabular-nums" style={{ color: livePreviewActive ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
                {livePreview}
              </motion.div>
            </div>
            <Button variant="default" size="default" onClick={(e) => onSubmit(e.currentTarget)} className="col-span-2 md:col-span-1 h-9">
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </div>
          {rate == null && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-warning)" }} />
              Set your rate first (top right)
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------- Dialogs ----------------
function EditEntryDialog({ open, onOpenChange, entry, mins, setMins, onSave, dateLabel }: { open: boolean; onOpenChange: (next: boolean) => void; entry?: Entry; mins: string; setMins: (s: string) => void; onSave: () => void; dateLabel: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {dateLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Minutes</Label>
          <Input type="number" value={mins} onChange={(e) => setMins(e.target.value)} className="font-mono" />
          {entry && <p className="text-xs text-muted-foreground">Rate locked at ${entry.ratePerMinute.toFixed(2)}/min.</p>}
        </div>
        <DialogFooter>
          <Button variant="default" size="default" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ open, onOpenChange, isOffDay, entry, status, dateLabel, onConfirm }: { open: boolean; onOpenChange: (next: boolean) => void; isOffDay: boolean; entry?: Entry; status?: DayStatus; dateLabel: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isOffDay ? "Remove off-day mark?" : "Delete this entry?"}</AlertDialogTitle>
          <AlertDialogDescription>{isOffDay ? `${dateLabel} will no longer be marked as ${status?.status}.` : `${entry?.minutes} min — ${entry && fmtMoney(entry.amount)}. Soft delete; recoverable.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" size="default" onClick={onConfirm}>
            {isOffDay ? "Remove" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MarkOffDialog({ open, onOpenChange, defaultDate, currentStatus, lockDate = false, onSaved }: { open: boolean; onOpenChange: (next: boolean) => void; defaultDate: string; currentStatus?: DayStatusValue; lockDate?: boolean; onSaved: () => void }) {
  const [pickedDate, setPickedDate] = useState(defaultDate);
  const [status, setStatus] = useState<DayStatusValue>(currentStatus ?? "vacation");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPickedDate(defaultDate);
      setStatus(currentStatus ?? "vacation");
    }
    onOpenChange(next);
  };

  const save = async () => {
    try {
      await api.put("/income/day-status", { date: pickedDate, status });
      toast.success("Day marked");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const clear = async () => {
    try {
      await api.put("/income/day-status", { date: pickedDate, status: null });
      toast.success("Cleared");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const options: { value: DayStatusValue; label: string }[] = [
    { value: "vacation", label: "Vacation" },
    { value: "sick", label: "Sick" },
    { value: "holiday", label: "Holiday" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark day off</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} disabled={lockDate} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <div className="grid grid-cols-3 gap-2">
              {options.map((opt) => {
                const active = status === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setStatus(opt.value)} className={`h-9 px-3 rounded-md text-sm font-medium border flex items-center justify-center gap-1.5 transition-all ${active ? "border-foreground" : "border-border hover:border-border-strong"}`} style={active ? { background: `var(--color-off-${opt.value}-bg)`, color: `var(--color-off-${opt.value})` } : {}}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: `var(--color-off-${opt.value})` }} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          {currentStatus && (
            <Button variant="ghost" size="default" onClick={clear}>
              Clear
            </Button>
          )}
          <Button variant="default" size="default" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Rate Pill ----------------
function RatePill({ rate, onSaved }: { rate: number | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (next) setValue(rate?.toString() ?? "");
    setOpen(next);
  };

  const save = async () => {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) return toast.error("Invalid rate");
    try {
      await api.post("/income/rate", { ratePerMinute: n });
      toast.success("Rate updated");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={() => handleOpenChange(true)} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-border bg-card text-xs font-medium hover:border-border-strong hover:bg-muted transition-colors">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: rate != null ? "var(--color-income)" : "var(--color-muted-foreground)" }} />
        {rate != null ? (
          <>
            <span className="font-mono tabular-nums">${rate.toFixed(2)}</span>
            <span className="text-muted-foreground">/min</span>
          </>
        ) : (
          <span>Set rate</span>
        )}
      </motion.button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Per-minute rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Rate per minute (USD)</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
            <p className="text-xs text-muted-foreground">Past entries keep their old rate.</p>
          </div>
          <DialogFooter>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
