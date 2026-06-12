import { useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { Check, ChevronLeft, ChevronRight, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type ItemLog = { name: string; amount: string; cal: number; p: number; c: number; f: number };
type Meal = "breakfast" | "lunch" | "dinner" | "snack";
type DayBucket = {
  date: string;
  isCheat: boolean;
  cal: number;
  p: number;
  c: number;
  f: number;
  water: number;
  byMeal: Record<Meal, ItemLog[]>;
};
type Goal = {
  caloriesTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
} | null;
type Report = {
  startDate: string;
  endDate: string;
  days: DayBucket[];
  totals: { cal: number; p: number; c: number; f: number; water: number };
  avg: { cal: number; p: number; c: number; f: number; water: number };
  daysWithLogs: number;
  cheatDayCount: number;
  goal: Goal;
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

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

function buildReportText(r: Report): string {
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const lines: string[] = [];

  lines.push(`WEEK: ${fmtDate(r.startDate)} - ${fmtDate(r.endDate)}`);
  lines.push("");

  lines.push("WEEK TOTALS");
  lines.push(`  ${r0(r.totals.cal)} cal - P ${r1(r.totals.p)}g - C ${r1(r.totals.c)}g - F ${r1(r.totals.f)}g`);
  lines.push(`  Water: ${(r.totals.water / 1000).toFixed(1)}L`);
  lines.push("");
  lines.push(`AVG/DAY (over ${r.daysWithLogs} day${r.daysWithLogs === 1 ? "" : "s"} with logs)`);
  lines.push(`  ${r0(r.avg.cal)} cal - P ${r1(r.avg.p)}g - C ${r1(r.avg.c)}g - F ${r1(r.avg.f)}g`);
  lines.push(`  Water: ${(r.avg.water / 1000).toFixed(1)}L`);
  if (r.cheatDayCount > 0) {
    lines.push(`Cheat days this week: ${r.cheatDayCount}`);
  }
  lines.push("");
  lines.push("---------------------");
  lines.push("");

  const meals: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
  for (const d of r.days) {
    lines.push(`${fmtDate(d.date)}${d.isCheat ? "  [CHEAT]" : ""}`);
    lines.push(`  Total: ${r0(d.cal)} cal - P ${r1(d.p)}g - C ${r1(d.c)}g - F ${r1(d.f)}g - ${(d.water / 1000).toFixed(1)}L water`);

    for (const m of meals) {
      const items = d.byMeal[m];
      const mealLabel = m.charAt(0).toUpperCase() + m.slice(1);
      if (items.length === 0) {
        lines.push(`  ${mealLabel}: Skipped`);
        continue;
      }
      lines.push(`  ${mealLabel}:`);
      for (const it of items) {
        lines.push(`    - ${it.name} (${it.amount})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function CoachReportModal({
  open,
  onOpenChange,
  anchorDate,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  anchorDate: string;
}) {
  const [anchor, setAnchor] = useState(anchorDate);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setAnchor(anchorDate);
  }, [open, anchorDate]);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Report>("/calories/coach-report", { params: { startDate: anchor } });
      setReport(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [anchor]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const text = useMemo(() => (report ? buildReportText(report) : ""), [report]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const prev = () => setAnchor(shiftDay(anchor, -7));
  const next = () => setAnchor(shiftDay(anchor, 7));

  const rangeLabel = report
    ? `${new Date(report.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} - ${new Date(report.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
    : "Loading...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[680px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Coach report</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={next} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium ml-2">{rangeLabel}</span>
          </div>
          <Button variant="outline" size="sm" onClick={copy} disabled={!text}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre
          className="flex-1 overflow-y-auto text-[12px] leading-relaxed font-mono whitespace-pre-wrap rounded-md p-4 border"
          style={{ background: "var(--color-muted)", borderColor: "var(--color-border)" }}
        >
          {text || "Loading..."}
        </pre>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
