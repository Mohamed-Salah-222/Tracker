import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { PAGE_LIMIT, PICKER_LIMIT, type Page } from "../lib/pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Check, Minus, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type KitchenUnit = "unit" | "g";

type Food = {
  _id: string;
  name: string;
  category: string;
  entryMode: "perUnit" | "perGram";
  /** Stored field is still `trackInFridge`; it holds live data on existing foods. */
  trackInFridge: boolean;
  unitLabel?: string;
};

type KitchenItem = {
  _id: string;
  foodId: string;
  foodNameSnapshot: string;
  count: number;
  unit: KitchenUnit;
  unitLabelSnapshot?: string;
  lowThreshold: number;
  restockTo: number;
  stepSize: number;
  note?: string;
};

type ToBuyLine = {
  id: string;
  kind: "stock" | "manual";
  label: string;
  detail: string;
  status: "out" | "low" | "ok" | "manual";
  done: boolean;
  count?: number;
  unit?: KitchenUnit;
  restockTo?: number;
};

type Summary = { tracked: number; out: number; low: number; manual: number; toBuy: number; items: ToBuyLine[] };

const EMPTY: Summary = { tracked: 0, out: 0, low: 0, manual: 0, toBuy: 0, items: [] };

type Status = "out" | "low" | "ok";
function statusOf(item: KitchenItem): Status {
  if (item.count <= 0) return "out";
  if (item.count <= item.lowThreshold) return "low";
  return "ok";
}

/** Spoken the way the unit actually is: 1.5 pieces is nonsense, 250g is not. */
function formatAmount(count: number, unit: KitchenUnit, unitLabel = ""): string {
  if (unit === "g") return `${Math.round(count)}g`;
  const n = Number.isInteger(count) ? count : Math.round(count * 10) / 10;
  if (!unitLabel) return `${n} left`;
  return `${n} ${unitLabel}${n === 1 ? "" : "s"}`;
}

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
  transition: { ...fadeUp.transition, delay: Math.min(i, 8) * 0.03 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function Kitchen() {
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<KitchenItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KitchenItem | null>(null);

  const itemsRef = useRef<KitchenItem[]>([]);
  const writeItems = useCallback((next: KitchenItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const existingFoodIds = useMemo(() => new Set(items.map((i) => i.foodId)), [items]);

  /**
   * Counts come from the server, not from the rows currently on screen. Deriving
   * them client-side meant the shopping list only saw the first page while printing
   * the server-wide total next to it.
   */
  const loadSummary = useCallback(async () => {
    try {
      const r = await api.get<Summary>("/kitchen/summary");
      setSummary(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Page<KitchenItem>>("/kitchen", { params: { limit: PAGE_LIMIT, offset: 0 } });
      writeItems(r.data.items);
      setTotal(r.data.total);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [writeItems]);

  const refresh = useCallback(async () => {
    await Promise.all([loadItems(), loadSummary()]);
  }, [loadItems, loadSummary]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api.get<Page<KitchenItem>>("/kitchen", { params: { limit: PAGE_LIMIT, offset: itemsRef.current.length } });
      writeItems([...itemsRef.current, ...r.data.items]);
      setTotal(r.data.total);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadFoods = useCallback(async () => {
    try {
      const r = await api.get<Page<Food>>("/foods", { params: { limit: PICKER_LIMIT, offset: 0 } });
      setFoods(r.data.items);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    void loadItems();
    void loadSummary();
  }, [loadItems, loadSummary]);
  useEffect(() => {
    void loadFoods();
  }, [loadFoods]);

  // ----- Stock mutations -----
  const patchLocal = (id: string, patch: Partial<KitchenItem>) => itemsRef.current.map((i) => (i._id === id ? { ...i, ...patch } : i));

  const adjust = async (item: KitchenItem, delta: number) => {
    const next = Math.max(0, item.count + delta);
    if (next === item.count) return;
    const before = itemsRef.current;
    writeItems(patchLocal(item._id, { count: next }));
    try {
      await api.post(`/kitchen/${item._id}/adjust`, { delta: next - item.count });
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  /** "I bought this": back to the restock level in one tap. */
  const restock = async (id: string) => {
    const before = itemsRef.current;
    const item = before.find((i) => i._id === id);
    if (item) writeItems(patchLocal(id, { count: Math.max(item.count, item.restockTo) }));
    try {
      const r = await api.post<KitchenItem>(`/kitchen/${id}/restock`, {});
      writeItems(patchLocal(id, { count: r.data.count }));
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  const saveEdit = async (item: KitchenItem, patch: { count: number; lowThreshold: number; restockTo: number; stepSize: number; note: string }) => {
    const before = itemsRef.current;
    writeItems(patchLocal(item._id, patch));
    setEditing(null);
    try {
      await api.patch(`/kitchen/${item._id}`, patch);
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  const confirmDelete = async () => {
    const item = pendingDelete;
    setPendingDelete(null);
    if (!item) return;
    const before = itemsRef.current;
    writeItems(before.filter((i) => i._id !== item._id));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await api.delete(`/kitchen/${item._id}`);
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  // ----- To-buy list -----
  const addManual = async (label: string, qty: string) => {
    try {
      await api.post("/kitchen/shopping", { label, qty });
      await loadSummary();
      return true;
    } catch (e) {
      toast.error(getApiError(e));
      return false;
    }
  };

  const toggleManual = async (line: ToBuyLine) => {
    setSummary((s) => ({ ...s, items: s.items.map((i) => (i.id === line.id ? { ...i, done: !i.done } : i)), toBuy: s.toBuy + (line.done ? 1 : -1), manual: s.manual + (line.done ? 1 : -1) }));
    try {
      await api.patch(`/kitchen/shopping/${line.id}`, { done: !line.done });
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      void loadSummary();
    }
  };

  const removeManual = async (line: ToBuyLine) => {
    setSummary((s) => ({ ...s, items: s.items.filter((i) => i.id !== line.id) }));
    try {
      await api.delete(`/kitchen/shopping/${line.id}`);
      void loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
      void loadSummary();
    }
  };

  const clearBought = async () => {
    try {
      await api.post("/kitchen/shopping/clear-done", {});
      await loadSummary();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const sorted = useMemo(() => {
    const rank: Record<Status, number> = { out: 0, low: 1, ok: 2 };
    return [...items].sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)] || a.foodNameSnapshot.localeCompare(b.foodNameSnapshot));
  }, [items]);

  // =====================================================================
  return (
    <div className="w-full max-w-[1100px] space-y-4">
      {/* ===== Header ===== */}
      <motion.header {...fadeUp} className="flex items-center justify-between gap-3">
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <ShoppingBasket className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Kitchen</h1>
        </div>
        <h1 className="sr-only md:hidden">Kitchen</h1>
        <Button variant="default" size="sm" className="ml-auto h-9" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          Track a food
        </Button>
      </motion.header>

      {/* ===== To-buy list ===== */}
      <motion.section {...stagger(1)} aria-label="To buy">
        <ToBuyList
          summary={summary}
          onRestock={restock}
          onAddManual={addManual}
          onToggleManual={toggleManual}
          onRemoveManual={removeManual}
          onClearBought={clearBought}
        />
      </motion.section>

      {/* ===== Inventory ===== */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="px-6 py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <ShoppingBasket className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-base font-semibold">Nothing tracked yet</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Track the foods you keep at home and set a restock line for each. Logging them on the Calories page takes them off the shelf, and anything running low lands on the list above and on your dashboard. Foods sold by weight are counted in grams.
              </p>
              <Button variant="default" size="default" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                Track your first food
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What is in the kitchen</h2>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{summary.tracked} tracked</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {sorted.map((item, i) => (
                <ItemCard key={item._id} item={item} index={i} onAdjust={adjust} onRestock={() => void restock(item._id)} onEdit={() => setEditing(item)} onDelete={() => setPendingDelete(item)} />
              ))}
            </AnimatePresence>
          </div>

          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_LIMIT, total - items.length)} more`}
              </Button>
            </div>
          )}
        </>
      )}

      <AddDialog open={addOpen} onOpenChange={setAddOpen} foods={foods} existingFoodIds={existingFoodIds} onAdded={refresh} />
      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking “{pendingDelete?.foodNameSnapshot}”?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from your kitchen and the to-buy list. The food itself stays in your library.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void confirmDelete()}>
              Stop tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =====================================================================
// ToBuyList
//
// Two kinds of line in one list. Stock lines are derived from what is low, so
// restocking removes them on its own; manual lines are free text and can be
// anything, including things with no macros that could never be a Food.
// =====================================================================
function ToBuyList({
  summary,
  onRestock,
  onAddManual,
  onToggleManual,
  onRemoveManual,
  onClearBought,
}: {
  summary: Summary;
  onRestock: (id: string) => void;
  onAddManual: (label: string, qty: string) => Promise<boolean>;
  onToggleManual: (line: ToBuyLine) => void;
  onRemoveManual: (line: ToBuyLine) => void;
  onClearBought: () => void;
}) {
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const stock = summary.items.filter((i) => i.kind === "stock");
  const manual = summary.items.filter((i) => i.kind === "manual");
  const bought = manual.filter((m) => m.done).length;

  const submit = async () => {
    const t = label.trim();
    if (!t) return;
    setSaving(true);
    const ok = await onAddManual(t, qty.trim());
    setSaving(false);
    if (ok) {
      setLabel("");
      setQty("");
    }
  };

  return (
    <Card style={summary.toBuy > 0 ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
      <CardContent className="px-4 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To buy</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight">{summary.toBuy === 0 ? "Nothing to buy" : `${summary.toBuy} to buy`}</div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {summary.out} out · {summary.low} running low · {summary.manual} on the list
            </div>
          </div>
          <StockRing need={summary.toBuy} tracked={summary.tracked + summary.manual} />
        </div>

        {(stock.length > 0 || manual.length > 0) && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3">
            {stock.map((line) => (
              <li key={line.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${line.status === "out" ? "bg-foreground" : "border border-foreground"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{line.label}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{line.detail}</span>
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onRestock(line.id)}>
                  <Check className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Bought
                </Button>
              </li>
            ))}
            {manual.map((line) => (
              <li key={line.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted/70">
                  <Checkbox checked={line.done} onCheckedChange={() => onToggleManual(line)} aria-label={`Mark ${line.label} bought`} />
                </label>
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${line.done ? "text-muted-foreground line-through" : ""}`}>{line.label}</span>
                {line.detail && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{line.detail}</span>}
                <button
                  type="button"
                  onClick={() => onRemoveManual(line)}
                  aria-label={`Remove ${line.label} from the list`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="Anything else to buy…"
            aria-label="Add something to buy"
            className="h-10 min-w-[140px] flex-1"
          />
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="2 packs"
            aria-label="How much"
            className="h-10 w-24 shrink-0"
          />
          <Button variant="default" size="sm" className="h-10 shrink-0" onClick={() => void submit()} disabled={!label.trim() || saving}>
            <Plus className="h-4 w-4 mr-1" aria-hidden />
            Add
          </Button>
          {bought > 0 && (
            <Button variant="ghost" size="sm" className="h-10 shrink-0 text-muted-foreground" onClick={onClearBought}>
              Clear {bought} bought
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StockRing({ need, tracked }: { need: number; tracked: number }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = tracked > 0 ? Math.min(1, need / tracked) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - frac * c }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono text-sm font-semibold tabular-nums">{need}</span>
      </div>
    </div>
  );
}

// =====================================================================
// ItemCard
// =====================================================================
function ItemCard({
  item,
  index,
  onAdjust,
  onRestock,
  onEdit,
  onDelete,
}: {
  item: KitchenItem;
  index: number;
  onAdjust: (item: KitchenItem, delta: number) => void;
  onRestock: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(item);
  const unit = item.unit ?? "unit";
  const step = item.stepSize || (unit === "g" ? 50 : 1);
  // Full is the restock level, so the bar answers "how close am I to a shop trip".
  const full = Math.max(item.restockTo || 0, item.lowThreshold * 2, 1);
  const pct = Math.max(0, Math.min(100, (item.count / full) * 100));

  return (
    <motion.div layout {...stagger(index)} exit={{ opacity: 0, scale: 0.97 }} className="group">
      <Card style={status === "out" ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
        <CardContent className="px-4 py-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{item.foodNameSnapshot}</span>
                {status === "out" && <span className="shrink-0 rounded-full bg-foreground px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-background">Out</span>}
                {status === "low" && <span className="shrink-0 rounded-full border border-border-strong px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-foreground">Low</span>}
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                Restock at {unit === "g" ? `${item.lowThreshold}g` : item.lowThreshold} · buy to {unit === "g" ? `${item.restockTo}g` : item.restockTo}
              </div>
              {item.note && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.note}</div>}
            </div>

            {/* Always rendered: hover-only controls are unreachable on a phone. */}
            <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
              <button type="button" onClick={onEdit} aria-label={`Edit ${item.foodNameSnapshot}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" onClick={onDelete} aria-label={`Stop tracking ${item.foodNameSnapshot}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => onAdjust(item, -step)} disabled={item.count <= 0} aria-label={`Remove ${step}${unit === "g" ? " grams" : ""} of ${item.foodNameSnapshot}`}>
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <span className="min-w-[4.5rem] text-center font-mono text-lg font-semibold tabular-nums" aria-live="polite">
                {formatAmount(item.count, unit, item.unitLabelSnapshot)}
              </span>
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => onAdjust(item, step)} aria-label={`Add ${step}${unit === "g" ? " grams" : ""} of ${item.foodNameSnapshot}`}>
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {status !== "ok" && (
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={onRestock}>
                <Check className="h-3.5 w-3.5 mr-1" aria-hidden />
                Bought
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// Dialogs
// =====================================================================
function NumberRow({ label, hint, value, onChange, step = "1" }: { label: string; hint?: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono tabular-nums" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Starting points that suit the unit. A gram item stepping by 1 would be useless. */
function defaultsForUnit(unit: KitchenUnit) {
  return unit === "g" ? { lowThreshold: 200, restockTo: 1000, stepSize: 50 } : { lowThreshold: 1, restockTo: 2, stepSize: 1 };
}

function EditDialog({
  item,
  onClose,
  onSave,
}: {
  item: KitchenItem;
  onClose: () => void;
  onSave: (item: KitchenItem, patch: { count: number; lowThreshold: number; restockTo: number; stepSize: number; note: string }) => void;
}) {
  const unit = item.unit ?? "unit";
  const suffix = unit === "g" ? " (grams)" : "";
  const [count, setCount] = useState(String(item.count));
  const [threshold, setThreshold] = useState(String(item.lowThreshold));
  const [restockTo, setRestockTo] = useState(String(item.restockTo ?? 0));
  const [stepSize, setStepSize] = useState(String(item.stepSize || 1));
  const [note, setNote] = useState(item.note ?? "");

  const save = () => {
    const c = parseAmount(count);
    const t = parseAmount(threshold);
    const rt = parseAmount(restockTo);
    const st = parseAmount(stepSize);
    if (c === null) return toast.error("Amount must be zero or more");
    if (t === null) return toast.error("Restock line must be zero or more");
    if (rt === null) return toast.error("Buy up to must be zero or more");
    if (st === null || st <= 0) return toast.error("Step must be greater than zero");
    if (rt < t) return toast.error("Buy up to should be at least the restock line, or it stays on the list after shopping");
    onSave(item, { count: c, lowThreshold: t, restockTo: rt, stepSize: st, note });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[420px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.foodNameSnapshot}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <NumberRow label={`How much you have${suffix}`} value={count} onChange={setCount} step={unit === "g" ? "10" : "1"} />
          <NumberRow label={`Restock line${suffix}`} hint="Flagged as low once you are at or below this." value={threshold} onChange={setThreshold} step={unit === "g" ? "10" : "1"} />
          <NumberRow label={`Buy up to${suffix}`} hint="What one tap of Bought puts back." value={restockTo} onChange={setRestockTo} step={unit === "g" ? "50" : "1"} />
          <NumberRow label={`Step size${suffix}`} hint="How much one tap of plus or minus moves." value={stepSize} onChange={setStepSize} step={unit === "g" ? "10" : "1"} />
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="top shelf, the good brand…" className="h-11" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  open,
  onOpenChange,
  foods,
  existingFoodIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  foods: Food[];
  existingFoodIds: Set<string>;
  onAdded: () => void;
}) {
  const [foodId, setFoodId] = useState("");
  const [count, setCount] = useState("");
  const [threshold, setThreshold] = useState("");
  const [restockTo, setRestockTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const available = useMemo(() => foods.filter((f) => f.trackInFridge && !existingFoodIds.has(f._id)), [foods, existingFoodIds]);
  const selected = foods.find((f) => f._id === foodId);
  const unit: KitchenUnit = selected?.entryMode === "perGram" ? "g" : "unit";
  const suffix = unit === "g" ? " (grams)" : "";

  useEffect(() => {
    if (open) {
      setFoodId("");
      setNote("");
    }
  }, [open]);

  // Sensible starting numbers the moment a food is picked, since grams and pieces
  // want wildly different ones.
  useEffect(() => {
    if (!selected) return;
    const d = defaultsForUnit(selected.entryMode === "perGram" ? "g" : "unit");
    setCount(String(d.restockTo));
    setThreshold(String(d.lowThreshold));
    setRestockTo(String(d.restockTo));
  }, [foodId, selected]);

  const save = async () => {
    if (!foodId) return toast.error("Pick a food first");
    const c = parseAmount(count);
    const t = parseAmount(threshold);
    const rt = parseAmount(restockTo);
    if (c === null) return toast.error("Amount must be zero or more");
    if (t === null) return toast.error("Restock line must be zero or more");
    if (rt === null) return toast.error("Buy up to must be zero or more");
    setSaving(true);
    try {
      await api.post("/kitchen", { foodId, count: c, lowThreshold: t, restockTo: rt, stepSize: defaultsForUnit(unit).stepSize, note });
      onOpenChange(false);
      onAdded();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[420px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Track a food</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Food</Label>
            <Select value={foodId} onValueChange={(v) => setFoodId(v ?? "")}>
              <SelectTrigger className="w-full !h-11">
                <SelectValue placeholder="Pick from your library">{selected?.name ?? "Pick from your library"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Everything available is already tracked.</div>
                ) : (
                  available.map((f) => (
                    <SelectItem key={f._id} value={f._id}>
                      {f.name}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{f.entryMode === "perGram" ? "grams" : (f.unitLabel || "pieces")}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Foods with kitchen tracking switched on. Toggle it on the food in the Foods page. Anything sold by weight is counted in grams.</p>
          </div>
          {selected && (
            <>
              <NumberRow label={`How much you have${suffix}`} value={count} onChange={setCount} step={unit === "g" ? "10" : "1"} />
              <NumberRow label={`Restock line${suffix}`} hint="Flagged as low once you are at or below this." value={threshold} onChange={setThreshold} step={unit === "g" ? "10" : "1"} />
              <NumberRow label={`Buy up to${suffix}`} hint="What one tap of Bought puts back." value={restockTo} onChange={setRestockTo} step={unit === "g" ? "50" : "1"} />
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="top shelf, the good brand…" className="h-11" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save} disabled={!foodId || saving}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
