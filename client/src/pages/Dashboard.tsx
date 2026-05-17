import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Wallet as WalletIcon, CreditCard, CheckSquare, Dumbbell, Droplet, ArrowRight, Flame, Snowflake, AlertCircle, Cake, Eye, EyeOff } from "lucide-react";

// ====================================================================
// TYPES
// ====================================================================
type SparkPoint = { date: string; value: number };

type Task = {
  _id: string;
  title: string;
  date: string;
  done: boolean;
};

type Wallet = { _id: string; name: string; balance: number };

type Expense = {
  _id: string;
  name: string;
  amount: number;
  category: string;
  walletNameSnapshot: string;
  date: string;
};

type FridgeItem = { _id: string; foodNameSnapshot: string; count: number };

type WorkoutSession = {
  _id: string;
  type: "A" | "B" | "rest";
  completedAt: string | null;
  warmupDone: boolean;
  finisherDone: boolean;
  walkMinutes: number;
};

type Dash = {
  today: string;
  income: { monthTotal: number; todayAmount: number; sparkline: SparkPoint[] };
  payments: {
    walletTotal: number;
    spentToday: number;
    spentMonth: number;
    wallets: Wallet[];
    recentExpenses: Expense[];
    sparkline: SparkPoint[];
  };
  tasksToday: { list: Task[]; done: number; total: number };
  tasksUpcoming: { list: Task[] };
  calories: {
    todayCal: number;
    todayProtein: number;
    todayCarbs: number;
    todayFat: number;
    waterTodayMl: number;
    isCheat: boolean;
    sparkline: SparkPoint[];
  };
  goal: {
    caloriesTarget: number;
    caloriesBuffer: number;
    proteinMin: number;
    proteinMax: number;
    waterMin: number;
    waterTarget: number;
    waterMax: number;
  };
  fridge: { items: FridgeItem[]; total: number; emptyCount: number };
  workout: {
    session: WorkoutSession | null;
    suggested: "A" | "B" | null;
    setsDone: number;
    setsTotal: number;
    streak: number;
  };
};

// ====================================================================
// HELPERS
// ====================================================================
const fmtUSD = (n: number) => `$${n.toFixed(2)}`;
const fmtEGP = (n: number) => `${Math.round(n).toLocaleString("en-US")} L.E`;

// Mask money values when hidden. Length roughly matches what the real
// number would look like so the layout doesn't jump.
const maskUSD = () => "$•••••";
const maskEGP = () => "•••••• L.E";
const maskedOrUSD = (n: number, hidden: boolean) => (hidden ? maskUSD() : fmtUSD(n));
const maskedOrEGP = (n: number, hidden: boolean) => (hidden ? maskEGP() : fmtEGP(n));
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

function workoutLabel(type: "A" | "B" | "rest") {
  if (type === "A") return "Workout A · Upper";
  if (type === "B") return "Workout B · Lower";
  return "Rest day";
}

// Motion presets
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// ====================================================================
// MAIN
// ====================================================================
type OpenCard = "targets" | "tasks" | "workout" | "fridge" | "income" | "payments" | null;

const MONEY_HIDDEN_KEY = "dashboard:money-hidden";

export default function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [openCard, setOpenCard] = useState<OpenCard>(null);
  const [moneyHidden, setMoneyHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MONEY_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleMoneyHidden = useCallback(() => {
    setMoneyHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MONEY_HIDDEN_KEY, next ? "1" : "0");
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Dash>("/dashboard");
      setData(r.data);
    } catch {
      // toast handled at axios level if you have it
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="w-full max-w-[1100px] mx-auto py-8">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-sm text-muted-foreground">
          Loading dashboard…
        </motion.div>
      </div>
    );
  }

  const dateLabel = new Date(data.today).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Greeting based on hour
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Header ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{greeting}</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{dateLabel}</h1>
        </div>
        <div className="flex items-end gap-4">
          {data.workout.streak > 1 && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Workout streak</div>
              <div className="text-xl font-semibold font-mono tabular-nums tracking-tight flex items-baseline gap-1 justify-end mt-0.5">
                <Flame className="h-4 w-4 self-center" style={{ color: "var(--color-warning)" }} />
                {data.workout.streak}
                <span className="text-xs text-muted-foreground font-normal">days</span>
              </div>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={toggleMoneyHidden} aria-label={moneyHidden ? "Show money" : "Hide money"} title={moneyHidden ? "Show money" : "Hide money"}>
            {moneyHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>

      {/* ===== Bento grid =====
        Desktop layout (3 cols):
          [ TARGETS (2-col) ] [ TASKS (1-col, 2-row) ]
          [ WORKOUT ] [ FRIDGE ] [    "    ]
          [ INCOME ]  [ PAYMENTS ]
      */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:auto-rows-min">
        {/* Targets — big, spans 2 cols */}
        <motion.div {...stagger(1)} className="md:col-span-2">
          <TargetsCard data={data} onClick={() => setOpenCard("targets")} />
        </motion.div>

        {/* Tasks — tall, 1 col, spans 2 rows */}
        <motion.div {...stagger(2)} className="md:row-span-2">
          <TasksCard data={data} onClick={() => setOpenCard("tasks")} />
        </motion.div>

        {/* Workout — 1 col */}
        <motion.div {...stagger(3)}>
          <WorkoutCard data={data} onClick={() => setOpenCard("workout")} />
        </motion.div>

        {/* Fridge — 1 col */}
        <motion.div {...stagger(4)}>
          <FridgeCard data={data} onClick={() => setOpenCard("fridge")} />
        </motion.div>

        {/* Income */}
        <motion.div {...stagger(5)}>
          <IncomeCard data={data} onClick={() => setOpenCard("income")} hidden={moneyHidden} />
        </motion.div>

        {/* Payments */}
        <motion.div {...stagger(6)}>
          <PaymentsCard data={data} onClick={() => setOpenCard("payments")} hidden={moneyHidden} />
        </motion.div>

        {/* (Empty cell on the right to keep alignment when needed) */}
        <div className="hidden md:block" />
      </div>

      {/* ===== Modals ===== */}
      <TargetsModal open={openCard === "targets"} onClose={() => setOpenCard(null)} data={data} />
      <TasksModal open={openCard === "tasks"} onClose={() => setOpenCard(null)} data={data} />
      <WorkoutModal open={openCard === "workout"} onClose={() => setOpenCard(null)} data={data} />
      <FridgeModal open={openCard === "fridge"} onClose={() => setOpenCard(null)} data={data} />
      <IncomeModal open={openCard === "income"} onClose={() => setOpenCard(null)} data={data} hidden={moneyHidden} />
      <PaymentsModal open={openCard === "payments"} onClose={() => setOpenCard(null)} data={data} hidden={moneyHidden} />
    </div>
  );
}

// ====================================================================
// RING — Apple Watch style
// ====================================================================
function Ring({ pct, color, size = 96, strokeWidth = 10, trackColor = "var(--color-muted)", children }: { pct: number; color: string; size?: number; strokeWidth?: number; trackColor?: string; children?: React.ReactNode }) {
  const r = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * r;
  // Clamp to 0-100 for the visible arc; if overflow, show a second darker overlay
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = C * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {/* Progress */}
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: offset }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ====================================================================
// CARDS
// ====================================================================
function CardShell({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={onClick} className={`w-full text-left h-full ${className ?? ""}`}>
      <Card className="h-full hover:border-border-strong transition-colors">
        <CardContent className="p-4 md:p-5 h-full flex flex-col">{children}</CardContent>
      </Card>
    </motion.button>
  );
}

// ----- TargetsCard -----
function TargetsCard({ data, onClick }: { data: Dash; onClick: () => void }) {
  const { calories, goal } = data;
  const cheat = calories.isCheat;

  // Calorie percentage: 100% at target
  const calPct = goal.caloriesTarget > 0 ? (calories.todayCal / goal.caloriesTarget) * 100 : 0;
  let calColor = "var(--color-income)";
  if (cheat) calColor = "var(--color-muted-foreground)";
  else if (calories.todayCal > goal.caloriesTarget + goal.caloriesBuffer) calColor = "var(--color-expense)";
  else if (calories.todayCal > goal.caloriesTarget) calColor = "var(--color-warning)";

  // Protein: 100% at proteinMax
  const proteinPct = goal.proteinMax > 0 ? (calories.todayProtein / goal.proteinMax) * 100 : 0;
  const proteinInRange = calories.todayProtein >= goal.proteinMin && calories.todayProtein <= goal.proteinMax;
  const proteinColor = cheat ? "var(--color-muted-foreground)" : proteinInRange ? "var(--color-income)" : "var(--color-protein)";

  // Water: 100% at waterTarget
  const waterPct = goal.waterTarget > 0 ? (calories.waterTodayMl / goal.waterTarget) * 100 : 0;
  const waterAtMin = calories.waterTodayMl >= goal.waterMin;
  const waterInTarget = calories.waterTodayMl >= goal.waterTarget;
  const waterColor = cheat ? "var(--color-muted-foreground)" : waterInTarget ? "var(--color-income)" : waterAtMin ? "var(--color-water)" : "var(--color-water)";

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today's targets</span>
        {cheat && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex items-center gap-1"
            style={{
              color: "var(--color-meal-snack)",
              background: "var(--color-meal-snack-bg)",
              borderColor: "color-mix(in oklch, var(--color-meal-snack), transparent 70%)",
            }}
          >
            <Cake className="h-2.5 w-2.5" />
            Cheat
          </span>
        )}
      </div>

      <div className="flex-1 grid grid-cols-3 gap-2 items-center">
        {/* Calories */}
        <div className="flex flex-col items-center">
          <Ring pct={calPct} color={calColor}>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Cal</div>
            <div className="text-base font-semibold font-mono tabular-nums tracking-tight leading-tight" style={{ color: calColor }}>
              {round(calories.todayCal)}
            </div>
            <div className="text-[9px] text-muted-foreground font-mono tabular-nums leading-tight">/{goal.caloriesTarget}</div>
          </Ring>
        </div>

        {/* Protein */}
        <div className="flex flex-col items-center">
          <Ring pct={proteinPct} color={proteinColor}>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Protein</div>
            <div className="text-base font-semibold font-mono tabular-nums tracking-tight leading-tight" style={{ color: proteinColor }}>
              {round1(calories.todayProtein)}
            </div>
            <div className="text-[9px] text-muted-foreground font-mono tabular-nums leading-tight">/{goal.proteinMax}g</div>
          </Ring>
        </div>

        {/* Water */}
        <div className="flex flex-col items-center">
          <Ring pct={waterPct} color={waterColor}>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-0.5">
              <Droplet className="h-2 w-2" />
              Water
            </div>
            <div className="text-base font-semibold font-mono tabular-nums tracking-tight leading-tight" style={{ color: waterColor }}>
              {(calories.waterTodayMl / 1000).toFixed(1)}
            </div>
            <div className="text-[9px] text-muted-foreground font-mono tabular-nums leading-tight">/{(goal.waterTarget / 1000).toFixed(1)}L</div>
          </Ring>
        </div>
      </div>
    </CardShell>
  );
}

// ----- TasksCard -----
function TasksCard({ data, onClick }: { data: Dash; onClick: () => void }) {
  const { tasksToday } = data;
  const allDone = tasksToday.total > 0 && tasksToday.done === tasksToday.total;
  const empty = tasksToday.total === 0;

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          <CheckSquare className="h-3 w-3" />
          Today's tasks
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: allDone ? "var(--color-income)" : "var(--color-foreground)" }}>
          {tasksToday.done}
        </span>
        <span className="text-lg text-muted-foreground font-mono tabular-nums">/ {tasksToday.total}</span>
      </div>

      <div className="flex-1 space-y-1.5 min-h-0">
        {empty && <div className="text-xs text-muted-foreground italic">No tasks for today.</div>}
        {!empty &&
          tasksToday.list.slice(0, 7).map((t) => (
            <div key={t._id} className="text-xs flex items-center gap-1.5 truncate">
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${t.done ? "" : "border border-foreground/40"}`} style={t.done ? { background: "var(--color-income)" } : {}} />
              <span className={`truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
            </div>
          ))}
        {tasksToday.list.length > 7 && <div className="text-[10px] text-muted-foreground font-mono tabular-nums pt-1">+{tasksToday.list.length - 7} more</div>}
      </div>
    </CardShell>
  );
}

// ----- WorkoutCard -----
function WorkoutCard({ data, onClick }: { data: Dash; onClick: () => void }) {
  const { workout } = data;
  const session = workout.session;
  const type = session?.type ?? workout.suggested ?? "A";
  const isRest = session?.type === "rest";
  const notStarted = !session;
  const completed = !!session?.completedAt;

  const pct = workout.setsTotal > 0 ? (workout.setsDone / workout.setsTotal) * 100 : 0;
  const color = type === "A" ? "var(--color-workout-a)" : type === "B" ? "var(--color-workout-b)" : "var(--color-workout-rest)";

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          <Dumbbell className="h-3 w-3" />
          Workout
        </span>
        {completed && (
          <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--color-income)" }}>
            Done
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="text-sm font-semibold tracking-tight" style={{ color }}>
            {notStarted ? `Suggested: ${workoutLabel(workout.suggested ?? "A")}` : workoutLabel(type)}
          </div>
          {!notStarted && !isRest && (
            <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
              {workout.setsDone}/{workout.setsTotal} sets
            </div>
          )}
          {!notStarted && isRest && session.walkMinutes > 0 && <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">{session.walkMinutes} min walk</div>}
        </div>

        {!notStarted && !isRest && (
          <div className="h-1.5 rounded-full overflow-hidden mt-3" style={{ background: "var(--color-muted)" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%" }} />
          </div>
        )}

        {notStarted && <div className="text-[10px] text-muted-foreground mt-2">Click to start</div>}
      </div>
    </CardShell>
  );
}

// ----- FridgeCard -----
function FridgeCard({ data, onClick }: { data: Dash; onClick: () => void }) {
  const { fridge } = data;
  const hasEmpty = fridge.emptyCount > 0;

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          <Snowflake className="h-3 w-3" />
          Fridge
        </span>
        {hasEmpty && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex items-center gap-1"
            style={{
              color: "var(--color-expense)",
              background: "var(--color-card)",
              borderColor: "color-mix(in oklch, var(--color-expense), transparent 60%)",
            }}
          >
            <AlertCircle className="h-2.5 w-2.5" />
            {fridge.emptyCount} empty
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: fridge.total > 0 ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>
            {fridge.total}
          </span>
          <span className="text-xs text-muted-foreground font-medium">portions</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {fridge.items.length} {fridge.items.length === 1 ? "item" : "items"}
        </div>
      </div>
    </CardShell>
  );
}

// ----- IncomeCard -----
function IncomeCard({ data, onClick, hidden }: { data: Dash; onClick: () => void; hidden: boolean }) {
  const { income } = data;

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          <WalletIcon className="h-3 w-3" />
          Income · month
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 flex-1">
        <div>
          <div className="text-2xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: "var(--color-income)" }}>
            {maskedOrUSD(income.monthTotal, hidden)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono tabular-nums mt-0.5">Today: {maskedOrUSD(income.todayAmount, hidden)}</div>
        </div>
        <div className="h-12 w-24 flex-shrink-0">
          {hidden ? (
            <div className="h-full w-full rounded-md" style={{ background: "var(--color-muted)" }} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={income.sparkline}>
                <defs>
                  <linearGradient id="dashIncomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="var(--color-income)" strokeWidth={1.5} fill="url(#dashIncomeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// ----- PaymentsCard -----
function PaymentsCard({ data, onClick, hidden }: { data: Dash; onClick: () => void; hidden: boolean }) {
  const { payments } = data;

  return (
    <CardShell onClick={onClick}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          <CreditCard className="h-3 w-3" />
          Payments · month
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 flex-1">
        <div>
          <div className="text-2xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: "var(--color-expense)" }}>
            {maskedOrEGP(payments.spentMonth, hidden)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono tabular-nums mt-0.5">Balance: {maskedOrEGP(payments.walletTotal, hidden)}</div>
        </div>
        <div className="h-12 w-24 flex-shrink-0">
          {hidden ? (
            <div className="h-full w-full rounded-md" style={{ background: "var(--color-muted)" }} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payments.sparkline}>
                <Bar dataKey="value" fill="var(--color-expense)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// ====================================================================
// MODALS
// ====================================================================
function BaseModal({ open, onClose, title, page, children, width = "[680px]" }: { open: boolean; onClose: () => void; title: string; page: string; children: React.ReactNode; width?: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`!max-w-${width} max-h-[92vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[64vh] overflow-y-auto">{children}</div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" size="default" onClick={onClose}>
            Close
          </Button>
          <Link to={page}>
            <Button variant="default" size="default">
              Open page <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Targets modal -----
function TargetsModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: Dash }) {
  const { calories, goal } = data;
  return (
    <BaseModal open={open} onClose={onClose} title="Today's targets" page="/calories" width="[640px]">
      <div className="space-y-4">
        {calories.isCheat && (
          <div
            className="text-xs rounded-md p-3 flex items-center gap-2 border"
            style={{
              background: "var(--color-meal-snack-bg)",
              borderColor: "color-mix(in oklch, var(--color-meal-snack), transparent 70%)",
              color: "var(--color-meal-snack)",
            }}
          >
            <Cake className="h-3 w-3" />
            Cheat day — goals are not enforced today.
          </div>
        )}
        <TargetBar label="Calories" value={round(calories.todayCal)} target={goal.caloriesTarget} buffer={goal.caloriesBuffer} unit="cal" variant="cap" muted={calories.isCheat} />
        <TargetBar label="Protein" value={round1(calories.todayProtein)} min={goal.proteinMin} target={goal.proteinMax} unit="g" variant="range" muted={calories.isCheat} />
        <TargetBar label="Water" value={calories.waterTodayMl / 1000} target={goal.waterTarget / 1000} min={goal.waterMin / 1000} unit="L" variant="hydration" muted={calories.isCheat} decimals={1} />

        <div className="border-t border-border pt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Macros</div>
          <div className="grid grid-cols-3 gap-3">
            <MacroStat label="Protein" value={`${round1(calories.todayProtein)}g`} color="var(--color-protein)" />
            <MacroStat label="Carbs" value={`${round1(calories.todayCarbs)}g`} color="var(--color-carbs)" />
            <MacroStat label="Fat" value={`${round1(calories.todayFat)}g`} color="var(--color-fat)" />
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

function TargetBar({ label, value, target, min, buffer, unit, variant, muted, decimals = 0 }: { label: string; value: number; target: number; min?: number; buffer?: number; unit: string; variant: "cap" | "range" | "hydration"; muted: boolean; decimals?: number }) {
  let color = "var(--color-foreground)";
  let pct = (value / target) * 100;

  if (muted) {
    color = "var(--color-muted-foreground)";
  } else if (variant === "cap") {
    const over = target + (buffer ?? 0);
    pct = Math.min((value / over) * 100, 100);
    if (value > over) color = "var(--color-expense)";
    else if (value > target) color = "var(--color-warning)";
    else if (value > 0) color = "var(--color-income)";
  } else if (variant === "range") {
    pct = Math.min((value / target) * 100, 100);
    const inRange = min !== undefined && value >= min && value <= target;
    color = inRange ? "var(--color-income)" : "var(--color-protein)";
  } else if (variant === "hydration") {
    pct = Math.min((value / target) * 100, 100);
    const aboveMin = min !== undefined && value >= min;
    const inTarget = value >= target;
    color = inTarget ? "var(--color-income)" : aboveMin ? "var(--color-water)" : "var(--color-water)";
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold font-mono tabular-nums" style={{ color }}>
            {decimals > 0 ? value.toFixed(decimals) : Math.round(value)}
          </span>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            / {decimals > 0 ? target.toFixed(decimals) : target} {unit}
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden relative" style={{ background: "var(--color-muted)" }}>
        {variant === "range" && min !== undefined && (
          <div
            className="absolute top-0 bottom-0 opacity-30"
            style={{
              left: `${(min / target) * 100}%`,
              width: `${((target - min) / target) * 100}%`,
              background: "var(--color-income)",
            }}
          />
        )}
        {variant === "hydration" && min !== undefined && (
          <div
            className="absolute top-0 bottom-0 opacity-20"
            style={{
              left: `${(min / target) * 100}%`,
              width: `${((target - min) / target) * 100}%`,
              background: "var(--color-income)",
            }}
          />
        )}
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%", position: "relative" }} />
      </div>
    </div>
  );
}

function MacroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md p-3" style={{ background: "var(--color-muted)" }}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="text-lg font-semibold font-mono tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ----- Tasks modal -----
function TasksModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: Dash }) {
  const { tasksToday, tasksUpcoming } = data;
  return (
    <BaseModal open={open} onClose={onClose} title="Tasks" page="/today">
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-baseline justify-between">
            <span>Today</span>
            <span className="font-mono tabular-nums normal-case tracking-normal">
              {tasksToday.done}/{tasksToday.total}
            </span>
          </div>
          {tasksToday.list.length === 0 && <div className="text-sm text-muted-foreground italic">No tasks today.</div>}
          <div className="space-y-1">
            {tasksToday.list.map((t) => (
              <div key={t._id} className="text-sm py-1.5 border-b border-border flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${t.done ? "" : "border border-foreground/40"}`} style={t.done ? { background: "var(--color-income)" } : {}} />
                <span className={t.done ? "line-through text-muted-foreground" : ""}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>

        {tasksUpcoming.list.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-baseline justify-between">
              <span>Next 7 days</span>
              <span className="font-mono tabular-nums normal-case tracking-normal">{tasksUpcoming.list.length}</span>
            </div>
            <div className="space-y-1">
              {tasksUpcoming.list.map((t) => (
                <div key={t._id} className="text-sm py-1.5 border-b border-border flex items-center justify-between gap-2">
                  <span className="truncate">{t.title}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums flex-shrink-0">
                    {new Date(t.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

// ----- Workout modal -----
function WorkoutModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: Dash }) {
  const { workout } = data;
  const session = workout.session;
  const type = session?.type ?? workout.suggested ?? "A";
  const completed = !!session?.completedAt;

  const color = type === "A" ? "var(--color-workout-a)" : type === "B" ? "var(--color-workout-b)" : "var(--color-workout-rest)";
  const bg = type === "A" ? "var(--color-workout-a-bg)" : type === "B" ? "var(--color-workout-b-bg)" : "var(--color-workout-rest-bg)";

  return (
    <BaseModal open={open} onClose={onClose} title="Workout" page="/workout" width="[560px]">
      <div className="space-y-4">
        <div className="rounded-md p-4 border" style={{ background: bg, borderColor: `color-mix(in oklch, ${color}, transparent 70%)` }}>
          <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>
            Today
          </div>
          <div className="text-xl font-semibold tracking-tight mt-1" style={{ color }}>
            {!session ? `Suggested: ${workoutLabel(workout.suggested ?? "A")}` : workoutLabel(type)}
          </div>
          {completed && (
            <div className="text-xs mt-1 font-medium" style={{ color: "var(--color-income)" }}>
              Completed
            </div>
          )}
        </div>

        {session && session.type !== "rest" && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">Sets done</span>
              <span className="text-sm font-semibold font-mono tabular-nums">
                {workout.setsDone}/{workout.setsTotal}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(workout.setsDone / workout.setsTotal) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%" }} />
            </div>
            {session && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <CheckPill label="Warmup" done={session.warmupDone} />
                <CheckPill label="Finisher" done={session.finisherDone} />
              </div>
            )}
          </div>
        )}

        {session && session.type === "rest" && (
          <div className="rounded-md p-3" style={{ background: "var(--color-muted)" }}>
            <div className="text-xs text-muted-foreground">Rest day walk</div>
            <div className="text-lg font-semibold font-mono tabular-nums mt-0.5">{session.walkMinutes > 0 ? `${session.walkMinutes} min` : "Not logged"}</div>
          </div>
        )}

        {workout.streak > 1 && (
          <div className="rounded-md p-3 flex items-center gap-2" style={{ background: "var(--color-muted)" }}>
            <Flame className="h-4 w-4" style={{ color: "var(--color-warning)" }} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Streak</div>
              <div className="text-sm font-semibold font-mono tabular-nums">{workout.streak} consecutive days</div>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

function CheckPill({ label, done }: { label: string; done: boolean }) {
  return (
    <div
      className="text-xs px-3 py-2 rounded-md border flex items-center justify-between"
      style={{
        background: done ? "var(--color-muted)" : "var(--color-card)",
        borderColor: "var(--color-border)",
      }}
    >
      <span className={done ? "line-through text-muted-foreground" : ""}>{label}</span>
      {done && (
        <span className="text-[10px] font-medium" style={{ color: "var(--color-income)" }}>
          Done
        </span>
      )}
    </div>
  );
}

// ----- Fridge modal -----
function FridgeModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: Dash }) {
  const { fridge } = data;
  return (
    <BaseModal open={open} onClose={onClose} title="Fridge" page="/fridge" width="[560px]">
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total</div>
            <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight">{fridge.total}</div>
          </div>
          {fridge.emptyCount > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Empty</div>
              <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: "var(--color-expense)" }}>
                {fridge.emptyCount}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Items</div>
          {fridge.items.length === 0 && <div className="text-sm text-muted-foreground italic">Fridge is empty.</div>}
          <div className="space-y-0">
            {fridge.items.map((i) => (
              <div key={i._id} className="text-sm py-1.5 border-b border-border flex items-center justify-between">
                <span className="truncate">{i.foodNameSnapshot}</span>
                <span className="font-mono tabular-nums font-semibold" style={{ color: i.count === 0 ? "var(--color-expense)" : "var(--color-foreground)" }}>
                  {i.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

// ----- Income modal -----
function IncomeModal({ open, onClose, data, hidden }: { open: boolean; onClose: () => void; data: Dash; hidden: boolean }) {
  const { income } = data;
  return (
    <BaseModal open={open} onClose={onClose} title="Income · this month" page="/income">
      <div className="space-y-4">
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Month</div>
            <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: "var(--color-income)" }}>
              {maskedOrUSD(income.monthTotal, hidden)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</div>
            <div className="text-xl font-semibold font-mono tabular-nums tracking-tight mt-1">{maskedOrUSD(income.todayAmount, hidden)}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Last 7 days</div>
          <div className="h-44">
            {hidden ? (
              <div className="h-full w-full rounded-md flex items-center justify-center text-xs text-muted-foreground" style={{ background: "var(--color-muted)" }}>
                Chart hidden
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={income.sparkline} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashIncomeFillBig" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} stroke="var(--color-border)" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={40} />
                  <Tooltip
                    cursor={{ stroke: "var(--color-border)" }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v) => [fmtUSD(Number(v)), "Income"]}
                    labelFormatter={(iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--color-income)" strokeWidth={2} fill="url(#dashIncomeFillBig)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

// ----- Payments modal -----
function PaymentsModal({ open, onClose, data, hidden }: { open: boolean; onClose: () => void; data: Dash; hidden: boolean }) {
  const { payments } = data;
  return (
    <BaseModal open={open} onClose={onClose} title="Payments" page="/payments">
      <div className="space-y-4">
        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Spent this month</div>
            <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight" style={{ color: "var(--color-expense)" }}>
              {maskedOrEGP(payments.spentMonth, hidden)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</div>
            <div className="text-xl font-semibold font-mono tabular-nums tracking-tight mt-1">{maskedOrEGP(payments.spentToday, hidden)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total balance</div>
            <div className="text-xl font-semibold font-mono tabular-nums tracking-tight mt-1">{maskedOrEGP(payments.walletTotal, hidden)}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Last 7 days · spending</div>
          <div className="h-36">
            {hidden ? (
              <div className="h-full w-full rounded-md flex items-center justify-center text-xs text-muted-foreground" style={{ background: "var(--color-muted)" }}>
                Chart hidden
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payments.sparkline} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} stroke="var(--color-border)" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={40} />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklch, var(--color-muted-foreground), transparent 90%)" }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v) => [fmtEGP(Number(v)), "Spent"]}
                    labelFormatter={(iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                  />
                  <Bar dataKey="value" fill="var(--color-expense)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {payments.wallets.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Wallets</div>
            <div className="space-y-0">
              {payments.wallets.map((w) => (
                <div key={w._id} className="text-sm py-1.5 border-b border-border flex items-center justify-between">
                  <span className="truncate">{w.name}</span>
                  <span className="font-mono tabular-nums font-semibold">{maskedOrEGP(w.balance, hidden)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {payments.recentExpenses.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Recent expenses</div>
            <div className="space-y-0">
              {payments.recentExpenses.map((e) => (
                <div key={e._id} className="text-sm py-1.5 border-b border-border flex items-center justify-between gap-3">
                  <span className="truncate">
                    {e.name}
                    <span className="text-muted-foreground text-xs ml-1">· {e.walletNameSnapshot}</span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold flex-shrink-0">{maskedOrEGP(e.amount, hidden)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
