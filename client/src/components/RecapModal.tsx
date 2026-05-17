import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "../lib/api";
import { AxiosError } from "axios";
import { toast } from "sonner";

// ===== Types =====
type Category = "food" | "transport" | "bills" | "shopping" | "entertainment" | "health" | "education" | "other";

type Summary = {
  total: number;
  count: number;
  avgPerDay: number;
  avgPerActiveDay: number;
  daysWithExpenses: number;
  daysInRange: number;
  byCategory: { category: Category; amount: number; count: number }[];
  byDay: { date: string; amount: number }[];
  topExpenses: {
    _id: string;
    name: string;
    amount: number;
    category: Category;
    walletNameSnapshot: string;
    date: string;
  }[];
};

type Period = "week" | "month";

// ===== Helpers =====
const fmtEGP = (n: number) => `${Math.round(n).toLocaleString("en-US")} L.E`;
const todayISO = () => new Date().toISOString().slice(0, 10);

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

// ===== Component =====
export function RecapModal({ open, onOpenChange, period }: { open: boolean; onOpenChange: (next: boolean) => void; period: Period }) {
  const [anchor, setAnchor] = useState(todayISO());
  const [data, setData] = useState<Summary | null>(null);
  const [prevData, setPrevData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset anchor when modal opens
  useEffect(() => {
    if (open) setAnchor(todayISO());
  }, [open, period]);

  // ----- Range computation -----
  const range = useMemo(() => {
    if (period === "week") {
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
  }, [period, anchor]);

  const prevRange = useMemo(() => {
    if (period === "week") {
      const mon = mondayOfWeek(anchor);
      const prevMon = shiftDay(mon, -7);
      const prevSun = shiftDay(prevMon, 6);
      return { from: prevMon, to: prevSun };
    }
    const d = new Date(anchor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }, [period, anchor]);

  // ----- Load data -----
  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [cur, prev] = await Promise.all([api.get<Summary>("/payments/summary", { params: range }), api.get<Summary>("/payments/summary", { params: prevRange })]);
      setData(cur.data);
      setPrevData(prev.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open, range, prevRange]);

  useEffect(() => {
    void load();
  }, [load]);

  // ----- Label -----
  const label = useMemo(() => {
    if (period === "week") {
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
  }, [period, anchor, range]);

  const prev = () => {
    if (period === "week") setAnchor(shiftDay(anchor, -7));
    else {
      const d = new Date(anchor);
      d.setUTCMonth(d.getUTCMonth() - 1);
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const next = () => {
    if (period === "week") setAnchor(shiftDay(anchor, 7));
    else {
      const d = new Date(anchor);
      d.setUTCMonth(d.getUTCMonth() + 1);
      setAnchor(d.toISOString().slice(0, 10));
    }
  };

  // ----- Trend -----
  const trend = useMemo(() => {
    if (!data || !prevData) return null;
    if (prevData.total === 0) return null;
    const pct = Math.round(((data.total - prevData.total) / prevData.total) * 100);
    return { pct, up: data.total >= prevData.total };
  }, [data, prevData]);

  const maxCategoryAmount = data?.byCategory[0]?.amount ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[820px] sm:!max-w-[820px] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">{period === "week" ? "Weekly recap" : "Monthly recap"}</DialogTitle>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{period === "week" ? "Weekly recap" : "Monthly recap"}</div>
              <div className="text-base font-semibold tracking-tight mt-0.5">{label}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={next} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <AnimatePresence mode="wait">
            <motion.div key={`${period}-${anchor}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
              {loading && !data ? (
                <LoadingState />
              ) : !data || data.count === 0 ? (
                <EmptyState period={period} />
              ) : (
                <>
                  {/* Headline total */}
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total spent</div>
                      <div className="text-4xl md:text-5xl font-semibold font-mono tracking-tighter tabular-nums mt-1" style={{ color: "var(--color-expense)" }}>
                        {fmtEGP(data.total)}
                      </div>
                    </div>
                    {trend && (
                      <div className="flex flex-col items-end">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">vs last {period}</div>
                        <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: trend.up ? "var(--color-expense)" : "var(--color-income)" }}>
                          {trend.up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          <span className="font-mono tabular-nums">
                            {trend.up ? "+" : ""}
                            {trend.pct}%
                          </span>
                          <span className="text-muted-foreground ml-1 font-mono text-xs">({fmtEGP(prevData!.total)})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Transactions" value={data.count.toString()} />
                    <StatCard label="Avg / day" value={fmtEGP(data.avgPerDay)} />
                    <StatCard label="Active days" value={`${data.daysWithExpenses} / ${data.daysInRange}`} />
                    <StatCard label="Biggest" value={data.topExpenses[0] ? fmtEGP(data.topExpenses[0].amount) : "—"} />
                  </div>

                  {/* Spending over time chart */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Spending over time</div>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={data.byDay} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                              tickFormatter={(v: string) => {
                                const d = new Date(v);
                                return period === "week" ? d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) : d.getUTCDate().toString();
                              }}
                              stroke="var(--color-border)"
                            />
                            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v: number) => v.toString()} stroke="var(--color-border)" width={40} />
                            <Tooltip
                              cursor={{ fill: "color-mix(in oklch, var(--color-muted-foreground), transparent 90%)" }}
                              contentStyle={{
                                background: "var(--color-card)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                              labelFormatter={(label) => {
                                const d = new Date(label as string);
                                return d.toLocaleDateString("en-US", {
                                  weekday: "long",
                                  month: "short",
                                  day: "numeric",
                                  timeZone: "UTC",
                                });
                              }}
                              formatter={(v) => [fmtEGP(Number(v)), "Spent"]}
                            />
                            <Area type="monotone" dataKey="amount" stroke="var(--color-expense)" strokeWidth={2} fill="url(#expenseGrad)" animationDuration={500} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category breakdown */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">By category</div>
                      <div className="space-y-3">
                        {data.byCategory.map((c, i) => {
                          const pct = data.total > 0 ? Math.round((c.amount / data.total) * 100) : 0;
                          const widthPct = Math.max((c.amount / maxCategoryAmount) * 100, 4);
                          return (
                            <motion.div key={c.category} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}>
                              <div className="flex items-baseline justify-between mb-1 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="text-xs font-medium capitalize px-2 py-0.5 rounded"
                                    style={{
                                      color: `var(--color-cat-${c.category})`,
                                      background: `var(--color-cat-${c.category}-bg)`,
                                    }}
                                  >
                                    {c.category}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono tabular-nums">{c.count}×</span>
                                </div>
                                <div className="flex items-baseline gap-2 flex-shrink-0">
                                  <span className="text-sm font-semibold font-mono tabular-nums">{fmtEGP(c.amount)}</span>
                                  <span className="text-xs text-muted-foreground font-mono tabular-nums w-9 text-right">{pct}%</span>
                                </div>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ duration: 0.6, delay: i * 0.04 + 0.1, ease: [0.16, 1, 0.3, 1] }} style={{ background: `var(--color-cat-${c.category})`, height: "100%" }} />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Top expenses */}
                  {data.topExpenses.length > 0 && (
                    <Card>
                      <CardContent className="p-5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Top expenses</div>
                        <div className="space-y-1">
                          {data.topExpenses.map((e, i) => (
                            <motion.div key={e._id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.04 }} className="flex items-center justify-between gap-3 py-2 border-b last:border-0 border-border">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xs font-mono tabular-nums text-muted-foreground w-4">#{i + 1}</span>
                                <span
                                  className="text-[11px] font-medium capitalize px-2 py-0.5 rounded border flex-shrink-0"
                                  style={{
                                    color: `var(--color-cat-${e.category})`,
                                    background: `var(--color-cat-${e.category}-bg)`,
                                    borderColor: `color-mix(in oklch, var(--color-cat-${e.category}), transparent 70%)`,
                                  }}
                                >
                                  {e.category}
                                </span>
                                <span className="text-sm font-medium text-foreground truncate">{e.name}</span>
                                <span className="hidden md:inline-flex flex-shrink-0">
                                  <span className="text-[11px] font-medium rounded border border-foreground/40 text-foreground/80 px-2 py-0.5">{e.walletNameSnapshot}</span>
                                </span>
                              </div>
                              <div className="text-sm font-semibold font-mono tabular-nums flex-shrink-0" style={{ color: "var(--color-expense)" }}>
                                {fmtEGP(e.amount)}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold font-mono tabular-nums mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="py-12 text-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} className="text-sm text-muted-foreground">
        Crunching numbers…
      </motion.div>
    </div>
  );
}

function EmptyState({ period }: { period: Period }) {
  return (
    <div className="py-16 text-center">
      <div className="text-base font-medium mb-1">No expenses this {period}</div>
      <div className="text-sm text-muted-foreground">Use the arrows above to look at a different {period}.</div>
    </div>
  );
}
