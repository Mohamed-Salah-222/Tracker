import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Droplets, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";

type TimelineEvent = {
  id: string;
  start: string;
  end: string;
  title: string;
  details?: string[];
  waterLiters?: number;
  options?: string[];
  linkedTo?: string;
  linkedTitles?: Record<string, string>;
};

type TimelineTemplate = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  events: TimelineEvent[];
};

type TimelineDay = {
  date: string;
  templateId: string | null;
  template: TimelineTemplate | null;
  checkedEventIds: string[];
  optionChoices: Record<string, string>;
};

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function shiftDay(iso: string, amount: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(":").map(Number);
  const suffix = hourRaw >= 12 ? "pm" : "am";
  const hour = hourRaw % 12 || 12;
  return minuteRaw ? `${hour}:${String(minuteRaw).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

function formatRange(event: TimelineEvent) {
  return `${formatTime(event.start)} to ${formatTime(event.end)}`;
}

function waterLabel(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}L Water`;
}

function resolveTitle(event: TimelineEvent, choices: Record<string, string>) {
  if (!event.linkedTo) return event.title;
  const choice = choices[event.linkedTo];
  return choice && event.linkedTitles?.[choice] ? event.linkedTitles[choice] : event.title;
}

export default function Timeline() {
  const [templates, setTemplates] = useState<TimelineTemplate[]>([]);
  const [day, setDay] = useState<TimelineDay | null>(null);
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadDay = useCallback(async (targetDate: string) => {
    try {
      const res = await api.get<TimelineDay>("/timeline/day", { params: { date: targetDate } });
      setDay(res.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [templatesRes, dayRes] = await Promise.all([api.get<TimelineTemplate[]>("/timeline/templates"), api.get<TimelineDay>("/timeline/day", { params: { date } })]);
        if (!active) return;
        setTemplates(templatesRes.data);
        setDay(dayRes.data);
      } catch (e) {
        toast.error(getApiError(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [date]);

  const stats = useMemo(() => {
    const events = day?.template?.events ?? [];
    const water = events.reduce((sum, event) => sum + (event.waterLiters ?? 0), 0);
    const checked = day?.checkedEventIds.length ?? 0;
    return { total: events.length, checked, water };
  }, [day]);

  const pickTemplate = async (templateId: string) => {
    setSavingId(templateId);
    try {
      const res = await api.put<TimelineDay>("/timeline/day", { date, templateId });
      setDay(res.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSavingId(null);
    }
  };

  const toggleEvent = async (eventId: string, checked: boolean) => {
    if (!day?.template) return;
    setDay((current) =>
      current
        ? {
            ...current,
            checkedEventIds: checked ? Array.from(new Set([...current.checkedEventIds, eventId])) : current.checkedEventIds.filter((id) => id !== eventId),
          }
        : current,
    );
    try {
      const res = await api.patch<TimelineDay>(`/timeline/day/${date}/events/${eventId}`, { checked });
      setDay(res.data);
    } catch (e) {
      toast.error(getApiError(e));
      void loadDay(date);
    }
  };

  const chooseOption = async (eventId: string, choice: string) => {
    if (!day?.template) return;
    setDay((current) => (current ? { ...current, optionChoices: { ...current.optionChoices, [eventId]: choice } } : current));
    try {
      const res = await api.patch<TimelineDay>(`/timeline/day/${date}/options/${eventId}`, { choice });
      setDay(res.data);
    } catch (e) {
      toast.error(getApiError(e));
      void loadDay(date);
    }
  };

  return (
    <div className="w-full max-w-[1500px] space-y-4">
      <motion.div {...fadeUp} className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Time Line
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{dayLabel(date)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setDate((current) => shiftDay(current, -1))} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-9 rounded-xl px-3" onClick={() => setDate(todayISO())}>
            <CalendarDays className="h-4 w-4" />
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setDate((current) => shiftDay(current, 1))} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      <motion.div {...fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
        <Card className="border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <CardContent className="p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {templates.map((template) => {
                const active = day?.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => pickTemplate(template.id)}
                    disabled={savingId === template.id}
                    className={`min-h-24 rounded-2xl border p-3 text-left transition-all ${active ? "border-neutral-950 bg-neutral-950 text-white shadow-lg" : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{template.shortName}</div>
                      {active && (
                        <span className="rounded-full bg-white/15 p-1">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? "text-white/70" : "text-muted-foreground"}`}>{template.description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <CardContent className="grid h-full grid-cols-3 gap-2 p-3">
            <MiniStat label="Blocks" value={`${stats.checked}/${stats.total}`} />
            <MiniStat label="Water" value={waterLabel(stats.water)} />
            <MiniStat label="Plan" value={day?.template?.shortName ?? "None"} />
          </CardContent>
        </Card>
      </motion.div>

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">Loading timeline...</CardContent>
        </Card>
      ) : day?.template ? (
        <motion.div {...fadeUp} className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:p-5">
          <div className="relative space-y-3 md:space-y-0">
            <div className="pointer-events-none absolute left-4 top-3 bottom-3 hidden w-px bg-neutral-200 md:left-1/2 md:block" />
            {day.template.events.map((event, index) => (
              <TimelineItem key={event.id} event={event} index={index} checked={day.checkedEventIds.includes(event.id)} choices={day.optionChoices} onToggle={toggleEvent} onChoice={chooseOption} />
            ))}
          </div>
        </motion.div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Sparkles className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
            <div className="text-lg font-semibold">Pick a template for this day</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}

function TimelineItem({
  event,
  index,
  checked,
  choices,
  onToggle,
  onChoice,
}: {
  event: TimelineEvent;
  index: number;
  checked: boolean;
  choices: Record<string, string>;
  onToggle: (eventId: string, checked: boolean) => void;
  onChoice: (eventId: string, choice: string) => void;
}) {
  const left = index % 2 === 0;
  const title = resolveTitle(event, choices);
  return (
    <div className="relative grid grid-cols-[34px_minmax(0,1fr)] gap-3 py-2 md:grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] md:gap-0 md:py-3">
      <div className={`hidden md:block ${left ? "md:col-start-1 md:pr-6" : "md:col-start-3 md:pl-6"}`}>
        <EventCard event={event} title={title} checked={checked} choices={choices} onToggle={onToggle} onChoice={onChoice} align={left ? "right" : "left"} />
      </div>
      <div className="relative col-start-1 row-start-1 flex justify-center md:col-start-2">
        <div className={`z-10 mt-6 h-4 w-4 rounded-full border-4 ${checked ? "border-neutral-950 bg-white" : "border-neutral-300 bg-white"}`} />
      </div>
      <div className="col-start-2 row-start-1 md:hidden">
        <EventCard event={event} title={title} checked={checked} choices={choices} onToggle={onToggle} onChoice={onChoice} align="left" />
      </div>
      <div className={`hidden md:block ${left ? "md:col-start-3" : "md:col-start-1"}`} />
    </div>
  );
}

function EventCard({
  event,
  title,
  checked,
  choices,
  onToggle,
  onChoice,
  align,
}: {
  event: TimelineEvent;
  title: string;
  checked: boolean;
  choices: Record<string, string>;
  onToggle: (eventId: string, checked: boolean) => void;
  onChoice: (eventId: string, choice: string) => void;
  align: "left" | "right";
}) {
  const selected = event.options ? choices[event.id] : null;
  return (
    <Card className={`border-neutral-200 bg-white py-0 shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition-all ${checked ? "ring-2 ring-neutral-950/10" : ""}`}>
      <CardContent className="p-3.5">
        <div className={`flex gap-3 ${align === "right" ? "md:flex-row-reverse md:text-right" : ""}`}>
          <Checkbox checked={checked} onCheckedChange={(value) => onToggle(event.id, value === true)} className="mt-1 size-4 rounded-[5px] border-neutral-300 data-checked:border-neutral-950 data-checked:bg-neutral-950" />
          <div className="min-w-0 flex-1">
            <div className={`flex flex-wrap items-center gap-2 ${align === "right" ? "md:justify-end" : ""}`}>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-neutral-700">{formatRange(event)}</span>
              {event.waterLiters ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                  <Droplets className="h-3 w-3" />
                  {waterLabel(event.waterLiters)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-base font-semibold tracking-tight text-neutral-950">{title}</h2>
            {event.details?.length ? <p className="mt-1 text-xs text-muted-foreground">{event.details.join(" + ")}</p> : null}
            {event.linkedTo && !choices[event.linkedTo] ? <p className="mt-1 text-xs text-muted-foreground">Based on the 10pm block</p> : null}
            {event.options ? (
              <div className={`mt-3 flex flex-wrap gap-2 ${align === "right" ? "md:justify-end" : ""}`}>
                {event.options.map((option) => (
                  <button key={option} type="button" onClick={() => onChoice(event.id, option)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${selected === option ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"}`}>
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
