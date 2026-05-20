import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Check, Flame, GraduationCap, Search } from "lucide-react";
import { AxiosError } from "axios";
import { CURRICULUM, TOTAL_TOPICS, CATEGORY_COLOR, CATEGORY_BG, type CurriculumPhase } from "../lib/career-curriculum";

// ===== Types =====
type TopicStats = {
  done: boolean;
  startedAt: string | null;
  completedAt: string | null;
};

type Stats = {
  doneCount: number;
  startedCount: number;
  streak: number;
  activity: { date: string; count: number }[];
  byTopicId: Record<string, TopicStats>;
};

// ===== Helpers =====
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

// =====================================================================
// MAIN
// =====================================================================
export default function Career() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get<Stats>("/career/stats");
      setStats(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overallPct = stats ? Math.round((stats.doneCount / TOTAL_TOPICS) * 100) : 0;

  // Find current phase (first phase that's not fully complete)
  const currentPhase = useMemo(() => {
    if (!stats) return null;
    for (const phase of CURRICULUM) {
      const doneInPhase = phase.topics.filter((t) => stats.byTopicId[t.id]?.done).length;
      if (doneInPhase < phase.topics.length) return phase;
    }
    return CURRICULUM[CURRICULUM.length - 1];
  }, [stats]);

  // Filtered phases for search
  const visiblePhases = useMemo(() => {
    if (!search.trim()) return CURRICULUM;
    const q = search.trim().toLowerCase();
    return CURRICULUM.map((p) => ({
      ...p,
      topics: p.topics.filter((t) => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
    })).filter((p) => p.topics.length > 0);
  }, [search]);

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Career
          </h1>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">AI Engineering</span>
        </div>
        {stats && stats.streak > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Flame className="h-3.5 w-3.5" style={{ color: "var(--color-warning)" }} />
            <span className="font-mono tabular-nums font-semibold">{stats.streak}</span>
            <span className="text-muted-foreground">day{stats.streak === 1 ? "" : "s"}</span>
          </div>
        )}
      </motion.div>

      {/* ===== Overall progress ===== */}
      <motion.div {...stagger(1)}>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Overall</div>
                <div className="text-3xl md:text-4xl font-semibold font-mono tracking-tight tabular-nums mt-1">
                  {stats?.doneCount ?? 0}
                  <span className="text-muted-foreground text-2xl">/{TOTAL_TOPICS}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Complete</div>
                <div className="text-3xl md:text-4xl font-semibold font-mono tracking-tight tabular-nums mt-1">
                  {overallPct}
                  <span className="text-muted-foreground text-2xl">%</span>
                </div>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${overallPct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} style={{ background: "var(--color-foreground)", height: "100%" }} />
            </div>
            {currentPhase && stats && stats.doneCount < TOTAL_TOPICS && (
              <div className="text-[10px] text-muted-foreground mt-3 font-medium">
                Current focus:{" "}
                <span className="text-foreground">
                  Phase {currentPhase.number} — {currentPhase.title}
                </span>
              </div>
            )}
            {stats && stats.doneCount === TOTAL_TOPICS && (
              <div className="text-xs mt-3 font-medium" style={{ color: "var(--color-income)" }}>
                Curriculum complete.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Search ===== */}
      <motion.div {...stagger(2)}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input className="pl-8" placeholder="Search topics..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </motion.div>

      {/* ===== Phases ===== */}
      {visiblePhases.length === 0 && (
        <motion.div {...stagger(3)}>
          <Card>
            <CardContent className="p-10 text-center">
              <div className="text-sm font-medium mb-1">No topics match.</div>
              <div className="text-sm text-muted-foreground">Try a different search.</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {visiblePhases.map((phase, i) => (
        <PhaseSection key={phase.number} phase={phase} stats={stats} index={i + 3} />
      ))}
    </div>
  );
}

// =====================================================================
// PhaseSection
// =====================================================================
function PhaseSection({ phase, stats, index }: { phase: CurriculumPhase; stats: Stats | null; index: number }) {
  const doneInPhase = stats ? phase.topics.filter((t) => stats.byTopicId[t.id]?.done).length : 0;
  const pct = phase.topics.length > 0 ? (doneInPhase / phase.topics.length) * 100 : 0;
  const isComplete = doneInPhase === phase.topics.length && phase.topics.length > 0;

  return (
    <motion.div {...stagger(index)} className="space-y-2">
      {/* Phase header */}
      <div className="flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">Phase {phase.number}</span>
          <span className="text-sm font-semibold tracking-tight truncate">{phase.title}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium hidden sm:inline">· {phase.subtitle}</span>
        </div>
        <span className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: isComplete ? "var(--color-income)" : "var(--color-foreground)" }}>
          {doneInPhase}
          <span className="text-muted-foreground">/{phase.topics.length}</span>
        </span>
      </div>

      {/* Phase progress bar */}
      <div className="h-1 rounded-full overflow-hidden mx-1" style={{ background: "var(--color-muted)" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: isComplete ? "var(--color-income)" : "var(--color-foreground)", height: "100%" }} />
      </div>

      {/* Topic list */}
      <Card>
        <CardContent className="p-0">
          {phase.topics.map((topic, ti) => {
            const ts = stats?.byTopicId[topic.id];
            const done = ts?.done ?? false;
            const started = !!ts?.startedAt;
            return (
              <Link key={topic.id} to={`/career/${topic.id}`} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors ${ti !== phase.topics.length - 1 ? "border-b border-border" : ""}`}>
                {/* Number */}
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums w-8 text-right flex-shrink-0">{topic.number.toString().padStart(3, "0")}</span>

                {/* Done indicator */}
                <div className="flex-shrink-0">
                  {done ? (
                    <div className="h-4 w-4 rounded-full flex items-center justify-center" style={{ background: "var(--color-income)" }}>
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </div>
                  ) : started ? (
                    <div className="h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--color-warning)" }} />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-foreground/30" />
                  )}
                </div>

                {/* Title */}
                <span className={`flex-1 text-sm truncate transition-colors ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{topic.title}</span>

                {/* Category tag */}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 uppercase tracking-wider"
                  style={{
                    color: CATEGORY_COLOR[topic.category],
                    background: CATEGORY_BG[topic.category],
                    borderColor: `color-mix(in oklch, ${CATEGORY_COLOR[topic.category]}, transparent 70%)`,
                  }}
                >
                  {topic.category}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
