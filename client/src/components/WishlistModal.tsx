import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type WishlistPriority = "high" | "medium" | "low";

type WishlistItem = {
  _id: string;
  name: string;
  price: number;
  bought: boolean;
  dateBought: string | null;
  link: string;
  priority: WishlistPriority;
  notes: string;
  archived: boolean;
};

export interface WishlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const PRIORITIES: WishlistPriority[] = ["high", "medium", "low"];
const fmtEGP = (n: number) =>
  `${Math.round(Math.abs(n)).toLocaleString("en-US")} L.E`;

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function priorityStyle(priority: WishlistPriority) {
  if (priority === "high") {
    return {
      color: "var(--color-expense)",
      background: "color-mix(in oklch, var(--color-expense), transparent 88%)",
      borderColor: "color-mix(in oklch, var(--color-expense), transparent 70%)",
    };
  }
  if (priority === "low") {
    return {
      color: "var(--color-muted-foreground)",
      background: "var(--color-muted)",
      borderColor: "var(--color-border)",
    };
  }
  return {
    color: "var(--color-foreground)",
    background: "var(--color-card)",
    borderColor: "var(--color-border)",
  };
}

function PriorityBadge({ priority }: { priority: WishlistPriority }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize whitespace-nowrap shrink-0"
      style={priorityStyle(priority)}
    >
      {priority}
    </span>
  );
}

function WishlistRow({
  item,
  onEdit,
  onToggle,
}: {
  item: WishlistItem;
  onEdit: (item: WishlistItem) => void;
  onToggle: (item: WishlistItem) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEdit(item);
      }}
      className="w-full flex items-center justify-between gap-3 py-2 px-1 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={item.bought}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(item);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border border-input accent-current shrink-0"
          aria-label={item.bought ? "Mark unbought" : "Mark bought"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`text-sm font-medium truncate hover:underline ${item.bought ? "line-through text-muted-foreground" : "text-foreground"}`}
              >
                {item.name}
              </a>
            ) : (
              <span className={`text-sm font-medium truncate ${item.bought ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.name}
              </span>
            )}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Open link"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <PriorityBadge priority={item.priority} />
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {item.bought && item.dateBought ? `Bought ${dateLabel(item.dateBought)}` : item.notes}
          </div>
          {item.bought && item.notes && <div className="text-xs text-muted-foreground truncate">{item.notes}</div>}
        </div>
      </div>
      <span className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${item.bought ? "text-muted-foreground line-through" : ""}`}>
        {fmtEGP(item.price)}
      </span>
    </div>
  );
}

interface AddWishlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: WishlistItem | null;
  onSaved: () => void;
}

function AddWishlistDialog({ open, onOpenChange, editing, onSaved }: AddWishlistDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState<WishlistPriority>("medium");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setPrice(String(editing.price));
      setPriority(editing.priority);
      setLink(editing.link ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setName("");
      setPrice("");
      setPriority("medium");
      setLink("");
      setNotes("");
    }
  }, [open, editing]);

  const handleSubmit = async () => {
    const parsedPrice = parseFloat(price);
    if (!name.trim()) return toast.error("Name required");
    if (isNaN(parsedPrice) || parsedPrice < 0) return toast.error("Enter a valid price");

    const payload = {
      name: name.trim(),
      price: parsedPrice,
      priority,
      link: link.trim(),
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/payments/wishlist/${editing._id}`, payload);
        toast.success("Item saved");
      } else {
        await api.post("/payments/wishlist", payload);
        toast.success("Item added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`/payments/wishlist/${editing._id}`);
      toast.success("Item deleted");
      onSaved();
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptop, shoes, course..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Price (L.E)</Label>
              <Input
                className="font-mono tabular-nums"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority((v ?? "medium") as WishlistPriority)}>
                <SelectTrigger className="w-full h-9 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Link</Label>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {editing ? (
              <Button variant="ghost" size="default" onClick={() => setDeleteOpen(true)} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button variant="default" size="default" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes it from your wishlist. No balances or expenses will change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function WishlistModal({ open, onOpenChange, onChanged }: WishlistModalProps) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);

  const loadWishlist = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<WishlistItem[]>("/payments/wishlist");
      setItems(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadWishlist();
  }, [open, loadWishlist]);

  const handleSaved = () => {
    void loadWishlist();
    onChanged();
  };

  const handleAddOpenChange = (next: boolean) => {
    if (!next) setEditingItem(null);
    setAddOpen(next);
  };

  const toggleBought = async (item: WishlistItem) => {
    try {
      await api.patch(`/payments/wishlist/${item._id}`, { bought: !item.bought });
      toast.success(!item.bought ? "Marked bought" : "Marked to buy");
      handleSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const currentYear = new Date().getFullYear();
  const unbought = items.filter((item) => !item.bought);
  const stillToBuy = unbought.reduce((sum, item) => sum + item.price, 0);
  const boughtThisYear = items
    .filter((item) => item.bought && item.dateBought && new Date(item.dateBought).getUTCFullYear() === currentYear)
    .reduce((sum, item) => sum + item.price, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-medium">Things to Buy</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingItem(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add item
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-border shrink-0">
            <div className="rounded-[10px] border border-border bg-card px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Still to buy</div>
                <div className="text-lg font-semibold font-mono tabular-nums mt-1">{fmtEGP(stillToBuy)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Bought this year</div>
                <div className="text-lg font-semibold font-mono tabular-nums mt-1">{fmtEGP(boughtThisYear)}</div>
              </div>
              <div className="sm:text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Items left</div>
                <div className="text-lg font-semibold font-mono tabular-nums mt-1">
                  {unbought.length}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {loading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Nothing on your list yet.
              </div>
            )}
            {!loading && items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
                className="rounded-[10px] border border-border bg-card px-4 divide-y divide-border"
              >
                {items.map((item, i) => (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] as const }}
                  >
                    <WishlistRow
                      item={item}
                      onEdit={(next) => {
                        setEditingItem(next);
                        setAddOpen(true);
                      }}
                      onToggle={toggleBought}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddWishlistDialog
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        editing={editingItem}
        onSaved={handleSaved}
      />
    </>
  );
}
