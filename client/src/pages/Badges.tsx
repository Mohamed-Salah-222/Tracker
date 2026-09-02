import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Award, Flame, Lock } from "lucide-react";
import { toast } from "sonner";
import { todayISO } from "../lib/today";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { dayCount, loadBadges, streakError, towards, type Badge, type BadgeBoard } from "../lib/streak";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: Math.min(i, 8) * 0.03 } });

const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const compact = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toLocaleString("en-US"));

/**
 * Eight weeks of days, oldest column first.
 *
 * The same shape as the dashboard heatmap on purpose: it is the same idea, one square
 * per day, and a second visual language for it would make both harder to read.
 */
function UsageGrid({ days }: { days: { date: string; used: boolean }[] }) {
  const columns = useMemo(() => {
    const out: { date: string; used: boolean }[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  return (
    <div className="flex gap-1" aria-hidden>
      {columns.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((day) => (
            <span key={day.date} title={`${day.date}${day.used ? ": used" : ": not opened"}`} className={`h-3 w-3 rounded-[3px] ${day.used ? "bg-foreground" : "border border-border bg-muted"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div className={`flex flex-col rounded-xl border p-3 ${badge.earned ? "border-foreground bg-card" : "border-border bg-card/60"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${badge.earned ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>
          {badge.earned ? <Award className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
        </span>
        {!badge.earned && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{badge.progress}%</span>}
      </div>

      <div className={`mt-2 text-[13px] font-semibold leading-tight ${badge.earned ? "" : "text-muted-foreground"}`}>{badge.label}</div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{badge.detail}</p>

      <div className="mt-auto pt-2">
        {badge.earned ? (
          <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{badge.earnedOn ? dayLabel(badge.earnedOn) : ""}</p>
        ) : (
          <>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${badge.progress}%` }} />
            </div>
            <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {compact(badge.value)} of {compact(badge.threshold)} {badge.unit}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Badges
//
// Keeping the tracker is a habit like any other, and it was the only one the app did
// not measure. The streak counts days the app was used at all; everything below it is
// measured from what was actually logged, across every page.
//
// Nothing here can be un-earned. Every measure is a lifetime figure, so a badge
// survives the run that earned it: the point is a record of what you did.
// =====================================================================
export default function Badges() {
  const [data, setData] = useState<BadgeBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "earned" | "close">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadBadges(todayISO()));
    } catch (e) {
      toast.error(streakError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** "Close" is anything unearned that is at least a third of the way there. */
  const groups = useMemo(() => {
    if (!data) return [];
    return data.groups
      .map((group) => ({
        ...group,
        badges: group.badges.filter((b) => (filter === "earned" ? b.earned : filter === "close" ? !b.earned && b.progress >= 33 : true)),
      }))
      .filter((group) => group.badges.length > 0);
  }, [data, filter]);

  if (loading) {
    return (
      <div className="w-full max-w-[980px] space-y-4">
        <Skeleton className="h-[188px] rounded-xl" />
        <Skeleton className="h-[240px] rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const nextStreak = data.next.streak;
  const filters: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.total },
    { key: "earned", label: "Earned", count: data.earned },
    { key: "close", label: "Close", count: data.badges.filter((b) => !b.earned && b.progress >= 33).length },
  ];

  return (
    <div className="w-full max-w-[980px] space-y-4">
      <motion.header {...fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Award className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Badges</h1>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {data.earned} of {data.total} earned
        </span>
      </motion.header>

      {/* ===== The streak itself ===== */}
      <motion.section {...stagger(1)} aria-label="Your streak">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Flame className="h-3 w-3" aria-hidden />
                  Current streak
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-semibold leading-none tabular-nums">{data.current}</span>
                  <span className="text-sm text-muted-foreground">{data.current === 1 ? "day" : "days"}</span>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {data.usedToday ? "Counted for today." : data.current > 0 ? "Today is not counted yet. Log anything and it will be." : "Log anything today to start a run."}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-right">
                {[
                  { label: "Best run", value: dayCount(data.longest) },
                  { label: "Days used", value: String(data.daysUsed) },
                  { label: "Since", value: data.firstDay ? dayLabel(data.firstDay).replace(/, \d{4}$/, "") : "-" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {nextStreak && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  {/* Measured against the best run, not the current one, which is why
                      this number can be ahead of the big one above it. */}
                  <span className="text-muted-foreground">
                    Next up: <span className="font-medium text-foreground">{nextStreak.label}</span>
                    {data.longest > data.current && <span> · best run so far</span>}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {data.longest} / {nextStreak.threshold}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${towards(nextStreak, data.longest)}%` }} />
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">The last 8 weeks</div>
              <UsageGrid days={data.recent} />
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== Filter ===== */}
      <motion.div {...stagger(2)} className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              filter === f.key ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            <span className="font-mono tabular-nums opacity-70">{f.count}</span>
          </button>
        ))}
      </motion.div>

      {/* ===== Every group ===== */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">Nothing here yet.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Keep logging and these fill in on their own.</p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group, i) => (
          <motion.section key={group.key} {...stagger(3 + i)} aria-label={group.label}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h2>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {group.earned}/{group.total}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.badges.map((badge) => (
                <BadgeCard key={badge.key} badge={badge} />
              ))}
            </div>
          </motion.section>
        ))
      )}
    </div>
  );
}
