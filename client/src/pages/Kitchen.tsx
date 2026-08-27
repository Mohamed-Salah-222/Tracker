import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { PAGE_LIMIT, PICKER_LIMIT, type Page } from "../lib/pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Minus, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type Food = {
  _id: string;
  name: string;
  category: string;
  /** Stored field is still `trackInFridge`; it holds live data on existing foods. */
  trackInFridge: boolean;
  unitLabel?: string;
};

type KitchenItem = {
  _id: string;
  foodId: string;
  foodNameSnapshot: string;
  count: number;
  lowThreshold: number;
  note?: string;
};

type Status = "out" | "low" | "ok";

function statusOf(item: KitchenItem): Status {
  if (item.count <= 0) return "out";
  if (item.count <= item.lowThreshold) return "low";
  return "ok";
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
  }, [loadItems]);
  useEffect(() => {
    void loadFoods();
  }, [loadFoods]);

  // ----- Optimistic mutations -----
  const patchLocal = (id: string, patch: Partial<KitchenItem>) => itemsRef.current.map((i) => (i._id === id ? { ...i, ...patch } : i));

  const adjust = async (item: KitchenItem, delta: number) => {
    const next = item.count + delta;
    if (next < 0) return;
    const before = itemsRef.current;
    writeItems(patchLocal(item._id, { count: next }));
    try {
      await api.post(`/kitchen/${item._id}/adjust`, { delta });
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  const saveEdit = async (item: KitchenItem, patch: { count: number; lowThreshold: number; note: string }) => {
    const before = itemsRef.current;
    writeItems(patchLocal(item._id, patch));
    setEditing(null);
    try {
      await api.patch(`/kitchen/${item._id}`, patch);
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
    } catch (e) {
      toast.error(getApiError(e));
      writeItems(before);
    }
  };

  // ----- Derived -----
  const sorted = useMemo(() => {
    const rank: Record<Status, number> = { out: 0, low: 1, ok: 2 };
    return [...items].sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)] || a.foodNameSnapshot.localeCompare(b.foodNameSnapshot));
  }, [items]);

  const outCount = items.filter((i) => statusOf(i) === "out").length;
  const lowCount = items.filter((i) => statusOf(i) === "low").length;
  const restock = sorted.filter((i) => statusOf(i) !== "ok");

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
          Add food
        </Button>
      </motion.header>

      {/* ===== Restock summary ===== */}
      {!loading && items.length > 0 && (
        <motion.section {...stagger(1)} aria-label="Restock summary">
          <Card style={restock.length > 0 ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
            <CardContent className="px-4 py-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shopping list</div>
                  <div className="mt-0.5 text-xl font-semibold tracking-tight">
                    {restock.length === 0 ? "Everything is stocked" : `${restock.length} to buy`}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {outCount} out · {lowCount} running low · {total} tracked
                  </div>
                </div>
                <StockRing out={outCount} low={lowCount} total={items.length} />
              </div>

              {restock.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {restock.map((i) => (
                    <span
                      key={i._id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        statusOf(i) === "out" ? "border-foreground bg-foreground text-background" : "border-border-strong text-foreground"
                      }`}
                    >
                      {i.foodNameSnapshot}
                      <span className="font-mono tabular-nums opacity-70">{i.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>
      )}

      {/* ===== List ===== */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[116px] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div {...stagger(1)}>
          <Card>
            <CardContent className="px-6 py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <ShoppingBasket className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-base font-semibold">Nothing tracked yet</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add the foods you keep at home and set a restock line for each. Logging them on the Calories page takes them off the shelf automatically, and anything running low shows up here and on your dashboard.
              </p>
              <Button variant="default" size="default" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                Add your first food
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {sorted.map((item, i) => (
                <ItemCard key={item._id} item={item} index={i} onAdjust={adjust} onEdit={() => setEditing(item)} onDelete={() => setPendingDelete(item)} />
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

      <AddDialog open={addOpen} onOpenChange={setAddOpen} foods={foods} existingFoodIds={existingFoodIds} onAdded={loadItems} />
      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking “{pendingDelete?.foodNameSnapshot}”?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from your kitchen and shopping list. The food itself stays in your library.</AlertDialogDescription>
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
// StockRing: proportion of tracked foods that need buying
// =====================================================================
function StockRing({ out, low, total }: { out: number; low: number; total: number }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const need = out + low;
  const frac = total > 0 ? need / total : 0;

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
  onEdit,
  onDelete,
}: {
  item: KitchenItem;
  index: number;
  onAdjust: (item: KitchenItem, delta: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(item);
  const pct = item.lowThreshold > 0 ? Math.min(100, (item.count / (item.lowThreshold * 2)) * 100) : item.count > 0 ? 100 : 0;

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
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">Restock at {item.lowThreshold}</div>
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

          {/* How far above the restock line this sits. */}
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => onAdjust(item, -1)} disabled={item.count <= 0} aria-label={`Remove one ${item.foodNameSnapshot}`}>
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <span className="w-10 text-center font-mono text-xl font-semibold tabular-nums" aria-live="polite" aria-label={`${item.count} left`}>
                {item.count}
              </span>
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => onAdjust(item, 1)} aria-label={`Add one ${item.foodNameSnapshot}`}>
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.count === 1 ? "left" : "left"}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// Dialogs
// =====================================================================
function NumberRow({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type="number" inputMode="numeric" min="0" step="1" value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono tabular-nums" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function parseCount(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function EditDialog({ item, onClose, onSave }: { item: KitchenItem; onClose: () => void; onSave: (item: KitchenItem, patch: { count: number; lowThreshold: number; note: string }) => void }) {
  const [count, setCount] = useState(String(item.count));
  const [threshold, setThreshold] = useState(String(item.lowThreshold));
  const [note, setNote] = useState(item.note ?? "");

  const save = () => {
    const c = parseCount(count);
    const t = parseCount(threshold);
    if (c === null) return toast.error("Count must be zero or more");
    if (t === null) return toast.error("Restock line must be zero or more");
    onSave(item, { count: c, lowThreshold: t, note });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{item.foodNameSnapshot}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <NumberRow label="How many you have" value={count} onChange={setCount} />
          <NumberRow label="Restock line" hint="Flagged as low once you are at or below this." value={threshold} onChange={setThreshold} />
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="top shelf, use by Friday…" className="h-11" />
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
  const [count, setCount] = useState("1");
  const [threshold, setThreshold] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFoodId("");
      setCount("1");
      setThreshold("1");
      setNote("");
    }
  }, [open]);

  const available = useMemo(() => foods.filter((f) => f.trackInFridge && !existingFoodIds.has(f._id)), [foods, existingFoodIds]);
  const selected = foods.find((f) => f._id === foodId);

  const save = async () => {
    if (!foodId) return toast.error("Pick a food first");
    const c = parseCount(count);
    const t = parseCount(threshold);
    if (c === null) return toast.error("Count must be zero or more");
    if (t === null) return toast.error("Restock line must be zero or more");
    setSaving(true);
    try {
      await api.post("/kitchen", { foodId, count: c, lowThreshold: t, note });
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
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[420px]">
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
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Only per-unit foods with kitchen tracking switched on appear here. Toggle it on the food in the Foods page.</p>
          </div>
          <NumberRow label="How many you have" value={count} onChange={setCount} />
          <NumberRow label="Restock line" hint="Flagged as low once you are at or below this." value={threshold} onChange={setThreshold} />
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="top shelf, use by Friday…" className="h-11" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save} disabled={available.length === 0 || saving}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
