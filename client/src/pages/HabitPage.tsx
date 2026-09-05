import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, PauseCircle, PlayCircle, Settings2 } from "lucide-react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { HabitHeatmap } from "../components/HabitHeatmap";
import { HabitScheduleDialog } from "../components/HabitScheduleDialog";
import { habitError, type HabitDef } from "../lib/habits";
import { loadHabitStats, type HabitStats } from "../lib/habitStats";
import { useSettings } from "../lib/useSettings";

const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } };
const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: Math.min(i, 6) * 0.04 } });

const WINDOWS = [
  { days: 90, label: "3m" },
  { days: 180, label: "6m" },
  { days: 365, label: "1y" },
];

// =====================================================================
// HabitPage
//
// A habit gets a page. The app could show every habit for one day and one month of
// every habit, and never one habit over time, which is why a streak on the dashboard
// was a number with nothing behind it and worth removing. Here the number has a year
// of squares under it saying how it was earned.
// =====================================================================
export default function HabitPage() {
  const { key } = useParams<{ key: string }>();
  const { settings } = useSettings();
  const today = todayISO();

  const [habit, setHabit] = useState<HabitDef | null>(null);
  const [stats, setStats] = useState<HabitStats | null>(null);
  const [window, setWindow] = useState(365);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const data = await loadHabitStats(key, today, window);
      setHabit(data.habit);
      setStats(data.stats);
    } catch {
      setMissing(true);
    }
  }, [key, today, window]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    if (!habit) return;
    try {
      await api.patch(`/habits/${habit._id}`, patch);
      await load();
      return true;
    } catch (e) {
      toast.error(habitError(e));
      return false;
    }
  };

  /** A week away is the common case, so the button offers it and the dialog offers the rest. */
  const togglePause = async () => {
    if (!habit) return;
    if (habit.pausedUntil) {
      if (await save({ pausedUntil: null })) toast.success(`${habit.label} is back on`);
      return;
    }
    const until = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (await save({ pausedUntil: until })) toast.success(`Paused until ${until}`);
  };

  if (missing) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">There is no habit by that name.</CardContent>
        </Card>
      </div>
    );
  }

  if (!habit || !stats) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const paused = habit.pausedUntil !== null && habit.pausedUntil >= today;
  const unit = stats.unit === "week" ? "week" : "day";

  return (
    <div className="space-y-4">
      <BackLink />

      {/* ===== Who it is ===== */}
      <motion.header {...fadeUp} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{habit.label}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {habit.scheduleLabel}
            {habit.type === "count" && habit.dailyTarget > 0 ? ` · ${habit.dailyTarget} ${habit.unit || "a day"}` : ""}
            {stats.since ? ` · since ${stats.since}` : ""}
          </p>
          {habit.description && <p className="mt-1 text-[12px] text-muted-foreground">{habit.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label={paused ? "Resume this habit" : "Pause this habit"} title={paused ? `Paused until ${habit.pausedUntil}` : "Pause for a week"} onClick={togglePause}>
            {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Change how often" onClick={() => setEditing(true)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </motion.header>

      {paused && (
        <motion.p {...stagger(1)} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px]">
          Paused until <span className="font-mono tabular-nums">{habit.pausedUntil}</span>. These days are not counted against you.
        </motion.p>
      )}

      {/* ===== The numbers ===== */}
      <motion.section {...stagger(1)} aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`Current ${unit}s`} value={stats.current} />
        <Stat label={`Best ${unit}s`} value={stats.best} />
        <Stat label="Kept" value={`${stats.rate}%`} sub={`${stats.done + stats.excused} of ${stats.expected || stats.done + stats.excused + stats.missed}`} />
        <Stat label="Last 30 days" value={`${stats.last30}%`} />
      </motion.section>

      {/* ===== The shape of it ===== */}
      <motion.section {...stagger(2)} aria-label="History">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
              <div className="flex gap-1">
                {WINDOWS.map((w) => (
                  <Button key={w.days} variant={window === w.days ? "default" : "outline"} size="sm" className="h-7 px-2 text-[11px]" onClick={() => setWindow(w.days)}>
                    {w.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <HabitHeatmap days={stats.days} startsOn={settings.week.startsOn} />
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== Week by week, when the week is the unit ===== */}
      {stats.unit === "week" && (
        <motion.section {...stagger(3)} aria-label="Weeks">
          <Card>
            <CardContent className="p-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent weeks</h2>
              <div className="mt-2 divide-y divide-border">
                {stats.weeks
                  .slice(-8)
                  .reverse()
                  .map((week) => (
                    <div key={week.start} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                      <span className="font-mono tabular-nums text-muted-foreground">week of {week.start}</span>
                      <span className={week.kept ? "font-semibold" : "text-muted-foreground"}>
                        {week.done} of {week.target}
                        {week.kept ? " · kept" : ""}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </motion.section>
      )}

      {/* ===== What you said about it ===== */}
      {stats.notes.length > 0 && (
        <motion.section {...stagger(4)} aria-label="Notes">
          <Card>
            <CardContent className="p-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h2>
              <div className="mt-2 divide-y divide-border">
                {stats.notes.slice(0, 20).map((n) => (
                  <div key={n.date} className="py-2">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{n.date}</span>
                    <p className="text-[12px]">{n.note}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.section>
      )}

      <HabitScheduleDialog habit={editing ? habit : null} onClose={() => setEditing(false)} onSaved={load} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/habits" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" /> Habits
    </Link>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">{value}</p>
        {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
