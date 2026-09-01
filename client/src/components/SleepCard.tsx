import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Moon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import {
  QUALITY_LABELS,
  clockLabel,
  deleteNight,
  durationLabel,
  isNight,
  loadNight,
  loadSleep,
  parseClock,
  regularityLabel,
  saveNight,
  sleepError,
  type SleepNight,
  type SleepSummary,
} from "../lib/sleep";

/** Twelve hours is the top of the chart. Longer nights are drawn full height. */
const CHART_CEILING = 720;
const STRIP_NIGHTS = 14;

/**
 * The nights, as a strip.
 *
 * A bar per night with the target band drawn behind them, so a run of short sleep
 * reads as a dip below a line rather than as a column of numbers. A night with no
 * entry is a gap, not a zero: the two mean completely different things and drawing
 * them the same would invent perfect records for days you forgot to log.
 *
 * Read only, deliberately. The bars used to be buttons that moved the whole page to
 * that date, which read as the day changing at random when all you did was tap a
 * chart. Nothing else on this page navigates by being touched, and the date stepper
 * at the top is the one place that changes the day.
 */
function NightStrip({ summary, selected }: { summary: SleepSummary; selected: string }) {
  const nights = summary.nights.slice(-STRIP_NIGHTS);
  const top = (v: number) => `${Math.min(100, (v / CHART_CEILING) * 100)}%`;

  return (
    <div className="relative mt-3 h-16 w-full" aria-hidden>
      {/* The band you are aiming for, behind everything. */}
      <div
        className="absolute inset-x-0 rounded-sm bg-muted"
        style={{ bottom: top(summary.band.min), height: `calc(${top(summary.band.max)} - ${top(summary.band.min)})` }}
      />
      <div className="absolute inset-0 flex items-end gap-[3px]">
        {nights.map((night) => {
          const isSelected = night.date === selected;
          const height = isNight(night) ? top(night.minutes) : "3px";
          const tone = !isNight(night) ? "bg-border" : night.inBand ? "bg-foreground" : "bg-muted-foreground/45";
          return (
            <div key={night.date} className="relative flex h-full flex-1 items-end" title={`${night.date}${isNight(night) ? `: ${durationLabel(night.minutes)}` : ": not logged"}`}>
              <span className={`w-full rounded-sm ${tone} ${isSelected ? "ring-1 ring-foreground ring-offset-1 ring-offset-card" : ""}`} style={{ height }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QualityPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          // Tapping the current score clears it, since "I did not say" is a real answer.
          onClick={() => onChange(value === n ? null : n)}
          aria-pressed={value === n}
          aria-label={`Quality ${n}, ${QUALITY_LABELS[n]}`}
          className={`h-8 flex-1 rounded-md border text-[11px] font-semibold transition-colors ${
            value !== null && n <= value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {n}
        </button>
      ))}
      <span className="ml-1 w-12 shrink-0 text-[11px] text-muted-foreground">{value === null ? "" : QUALITY_LABELS[value]}</span>
    </div>
  );
}

// =====================================================================
// SleepCard
//
// Sleep was a tick box for a range written into its own label, so a five hour night
// and a nine hour night recorded identically. This logs the two clock times and works
// the rest out: duration, whether it landed in the band, and how much the bedtime
// moves from night to night.
// =====================================================================
export default function SleepCard({ date, onSaved }: { date: string; onSaved?: () => void }) {
  const [summary, setSummary] = useState<SleepSummary | null>(null);
  const [night, setNight] = useState<SleepNight | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bed, setBed] = useState("23:30");
  const [wake, setWake] = useState("07:00");
  const [quality, setQuality] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, n] = await Promise.all([loadSleep(date, 30), loadNight(date)]);
      setSummary(s);
      setNight(n);
      setEditing(false);
    } catch (e) {
      toast.error(sleepError(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Opening the form on a blank night starts from the last one logged rather than a
   * fixed 23:30. Bedtimes barely move, so the usual edit is a couple of minutes.
   */
  const lastLogged = useMemo(() => (summary ? [...summary.nights].reverse().find(isNight) : undefined), [summary]);

  const openEditor = () => {
    const seed = night ?? lastLogged;
    setBed(clockLabel(seed?.bedMinutes ?? 1410));
    setWake(clockLabel(seed?.wakeMinutes ?? 420));
    setQuality(night?.quality ?? null);
    setNote(night?.note ?? "");
    setEditing(true);
  };

  const preview = useMemo(() => {
    const b = parseClock(bed);
    const w = parseClock(wake);
    if (b === null || w === null) return null;
    const mins = (w - b + 1440) % 1440;
    return mins === 0 ? null : mins;
  }, [bed, wake]);

  const save = async () => {
    if (preview === null) return toast.error("Check the two times");
    setSaving(true);
    try {
      const saved = await saveNight({ date, bedTime: bed, wakeTime: wake, quality, note: note.trim() });
      setNight(saved);
      setEditing(false);
      setSummary(await loadSleep(date, 30));
      onSaved?.();
    } catch (e) {
      toast.error(sleepError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteNight(date);
      setNight(null);
      setEditing(false);
      setSummary(await loadSleep(date, 30));
      onSaved?.();
    } catch (e) {
      toast.error(sleepError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-[184px] rounded-xl" />;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Moon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sleep</h2>
          </div>
          {night && !editing && (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEditor} aria-label="Edit this night">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove()} disabled={saving} aria-label="Delete this night">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bed</Label>
                <Input type="time" value={bed} onChange={(e) => setBed(e.target.value)} className="h-11 font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Woke</Label>
                <Input type="time" value={wake} onChange={(e) => setWake(e.target.value)} className="h-11 font-mono tabular-nums" />
              </div>
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{preview === null ? "Check the two times" : `${durationLabel(preview)} in bed`}</p>
            <QualityPicker value={quality} onChange={setQuality} />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Woke up twice, hot room" className="h-10" />
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" className="h-9 flex-1" onClick={() => void save()} disabled={saving}>
                Save night
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : night ? (
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold leading-none tabular-nums">{durationLabel(night.minutes)}</span>
              <span className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${night.inBand ? "bg-foreground text-background" : "border border-border-strong text-muted-foreground"}`}>
                {night.inBand ? "in range" : night.minutes < (summary?.band.min ?? 0) ? "short" : "long"}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {clockLabel(night.bedMinutes)} to {clockLabel(night.wakeMinutes)}
              {night.quality !== null && <span className="font-sans"> · felt {QUALITY_LABELS[night.quality]}</span>}
            </p>
            {night.note && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{night.note}</p>}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">No night logged.</p>
            <Button variant="outline" size="sm" className="mt-2 h-9" onClick={openEditor}>
              Log this night
            </Button>
          </div>
        )}

        {summary && summary.logged > 0 && (
          <>
            <NightStrip summary={summary} selected={date} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {summary.avgMinutes !== null && <span>avg {durationLabel(summary.avgMinutes)}</span>}
              {summary.avgBedMinutes !== null && <span>· bed ~{clockLabel(summary.avgBedMinutes)}</span>}
              <span className="font-sans">· {regularityLabel(summary.bedSpread)}</span>
              <span>
                · {summary.inBandCount}/{summary.logged} in range
              </span>
              {summary.streak > 1 && <span>· {summary.streak} night streak</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
