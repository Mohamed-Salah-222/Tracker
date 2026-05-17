import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Minus, Snowflake, AlertCircle } from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type Food = {
  _id: string;
  name: string;
  category: string;
  trackInFridge: boolean;
  defaultServingGrams: number | null;
  caloriesPerGram: number;
};

type FridgeItem = {
  _id: string;
  foodId: string;
  foodNameSnapshot: string;
  count: number;
  note?: string;
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
export default function Fridge() {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const r = await api.get<FridgeItem[]>("/fridge");
      setItems(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadFoods = useCallback(async () => {
    try {
      const r = await api.get<Food[]>("/foods");
      setFoods(r.data);
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

  const reload = () => {
    void loadItems();
  };

  const totalPortions = items.reduce((s, i) => s + i.count, 0);
  const emptyCount = items.filter((i) => i.count === 0).length;
  const stockedCount = items.length - emptyCount;

  // Sort empty items to the top
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Empty first
      if (a.count === 0 && b.count !== 0) return -1;
      if (a.count !== 0 && b.count === 0) return 1;
      // Then by name alphabetically within each group
      return a.foodNameSnapshot.localeCompare(b.foodNameSnapshot);
    });
  }, [items]);

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
            <Snowflake className="h-4 w-4" style={{ color: "var(--color-water)" }} />
            Fridge
          </h1>
          {items.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>
        <Button variant="default" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add item
        </Button>
      </motion.div>

      {/* ===== Stats headline ===== */}
      {items.length > 0 && (
        <motion.div {...stagger(1)} className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Stocked</span>
          </div>
          <div className="text-right flex items-baseline gap-4">
            {emptyCount > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Empty</div>
                <div className="text-xl font-semibold font-mono tracking-tight tabular-nums" style={{ color: "var(--color-expense)" }}>
                  {emptyCount}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total portions</div>
              <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums" style={{ color: totalPortions > 0 ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>
                {totalPortions}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ===== Empty state ===== */}
      {items.length === 0 && (
        <motion.div {...stagger(1)}>
          <Card>
            <CardContent className="p-12 text-center">
              <Snowflake className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <div className="text-sm font-medium mb-1">Fridge is empty.</div>
              <div className="text-sm text-muted-foreground">Click "Add item" above to start tracking. Only foods marked "Track in fridge" can be added here.</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ===== Items grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence initial={false}>
          {sortedItems.map((item, i) => (
            <FridgeCard key={item._id} item={item} onChanged={reload} index={i} />
          ))}
        </AnimatePresence>
      </div>

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} foods={foods} existingFoodIds={new Set(items.map((i) => i.foodId))} onSaved={reload} />
    </div>
  );
}

// =====================================================================
// FridgeCard
// =====================================================================
function FridgeCard({ item, onChanged, index }: { item: FridgeItem; onChanged: () => void; index: number }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);

  const adjust = async (delta: number) => {
    try {
      await api.post(`/fridge/${item._id}/adjust`, { delta });
      setBumpKey((k) => k + 1);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/fridge/${item._id}`);
      toast.success("Removed");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const isEmpty = item.count === 0;
  const isLow = item.count > 0 && item.count <= 2;

  // Card styling based on state
  const cardStyle = isEmpty
    ? {
        background: "var(--color-expense-bg)",
        borderColor: "color-mix(in oklch, var(--color-expense), transparent 70%)",
      }
    : {};

  return (
    <>
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }} whileHover={{ y: -1 }} className="group">
        <Card className="hover:border-border-strong transition-colors" style={cardStyle}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-foreground truncate">{item.foodNameSnapshot}</div>
                  {isEmpty && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex items-center gap-1"
                      style={{
                        color: "var(--color-expense)",
                        background: "var(--color-card)",
                        borderColor: "color-mix(in oklch, var(--color-expense), transparent 60%)",
                      }}
                    >
                      <AlertCircle className="h-2.5 w-2.5" />
                      Empty
                    </span>
                  )}
                  {isLow && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider"
                      style={{
                        color: "var(--color-warning)",
                        background: "var(--color-card)",
                        borderColor: "color-mix(in oklch, var(--color-warning), transparent 60%)",
                      }}
                    >
                      Low
                    </span>
                  )}
                </div>
                {item.note && <div className="text-xs text-muted-foreground mt-1 truncate">{item.note}</div>}
              </div>

              {/* Hover-revealed action icons */}
              <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Counter row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => adjust(-1)} disabled={item.count === 0} aria-label="Decrement">
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={bumpKey}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.2 }}
                    transition={{ duration: 0.15 }}
                    className="text-2xl font-semibold font-mono tabular-nums w-12 text-center"
                    style={{
                      color: isEmpty ? "var(--color-expense)" : isLow ? "var(--color-warning)" : "var(--color-foreground)",
                    }}
                  >
                    {item.count}
                  </motion.span>
                </AnimatePresence>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => adjust(1)} aria-label="Increment">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.count === 1 ? "portion" : "portions"}</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <EditItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{item.foodNameSnapshot}"?</AlertDialogTitle>
            <AlertDialogDescription>Removes from your fridge tracking. The food stays in your library.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =====================================================================
// EditItemDialog
// =====================================================================
function EditItemDialog({ item, open, onOpenChange, onSaved }: { item: FridgeItem; open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const [count, setCount] = useState(item.count.toString());
  const [note, setNote] = useState(item.note ?? "");

  useEffect(() => {
    if (open) {
      setCount(item.count.toString());
      setNote(item.note ?? "");
    }
  }, [open, item]);

  const save = async () => {
    const c = parseInt(count);
    if (isNaN(c) || c < 0) return toast.error("Invalid count");
    try {
      await api.patch(`/fridge/${item._id}`, { count: c, note });
      toast.success("Saved");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.foodNameSnapshot}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Count</Label>
            <Input type="number" step="1" value={count} onChange={(e) => setCount(e.target.value)} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="freezer top shelf, cook by Fri..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="default" size="default" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// AddItemDialog
// =====================================================================
function AddItemDialog({ open, onOpenChange, foods, existingFoodIds, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; foods: Food[]; existingFoodIds: Set<string>; onSaved: () => void }) {
  const [foodId, setFoodId] = useState("");
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setFoodId("");
      setCount("1");
      setNote("");
    }
  }, [open]);

  // Only show foods that are fridge-tracked AND not already in the fridge
  const availableFoods = useMemo(() => foods.filter((f) => f.trackInFridge && !existingFoodIds.has(f._id)), [foods, existingFoodIds]);

  const selected = foods.find((f) => f._id === foodId);

  const save = async () => {
    if (!foodId) return toast.error("Pick a food");
    const c = parseInt(count);
    if (isNaN(c) || c < 0) return toast.error("Invalid count");
    try {
      await api.post("/fridge", { foodId, count: c, note });
      toast.success("Added");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to fridge</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Food</Label>
            <Select value={foodId} onValueChange={(v) => setFoodId(v ?? "")}>
              <SelectTrigger className="w-full !h-8">
                <SelectValue placeholder="Pick a food from your library">{selected?.name ?? "Pick a food from your library"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableFoods.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">All fridge-tracked foods are already in your fridge.</div>
                ) : (
                  availableFoods.map((f) => (
                    <SelectItem key={f._id} value={f._id}>
                      {f.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Only foods marked "Track in fridge" appear here. Toggle that on the food in the Foods page.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Portions</Label>
            <Input type="number" step="1" value={count} onChange={(e) => setCount(e.target.value)} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="freezer, cook by Fri..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="default" size="default" onClick={save} disabled={availableFoods.length === 0}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
