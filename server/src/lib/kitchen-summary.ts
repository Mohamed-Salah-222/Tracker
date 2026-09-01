// One shopping list, computed once.
//
// The dashboard and the kitchen page each used to work out what needed buying, from
// two separate queries with two separate copies of the rule. The page's copy also
// only saw the rows it had paged in, so past 50 items it quietly undercounted while
// still printing the server-wide total beside it.
import { KitchenItem, formatAmount, kitchenStatus, type KitchenStatus, type KitchenUnit } from "../models/KitchenItem";
import { ShoppingItem } from "../models/ShoppingItem";

export type ToBuyLine = {
  id: string;
  kind: "stock" | "manual";
  label: string;
  detail: string;
  status: KitchenStatus | "manual";
  done: boolean;
  count?: number;
  unit?: KitchenUnit;
  lowThreshold?: number;
  restockTo?: number;
};

export type KitchenSummary = {
  tracked: number;
  out: number;
  low: number;
  /** Manual lines still outstanding. Ticked ones stay on the page but stop counting. */
  manual: number;
  /** Everything you would put in a basket right now. */
  toBuy: number;
  items: ToBuyLine[];
};

/** Restock-first: what to buy is the whole point, so empty shelves sort to the top. */
export const RESTOCK_SORT = { count: 1 as const, foodNameSnapshot: 1 as const };

export async function kitchenSummary(limit = 0): Promise<KitchenSummary> {
  const [items, manual] = await Promise.all([
    KitchenItem.find().sort(RESTOCK_SORT),
    ShoppingItem.find().sort({ done: 1, createdAt: -1 }),
  ]);

  const needing = items.filter((i) => kitchenStatus(i.count, i.lowThreshold) !== "ok");
  const stockLines: ToBuyLine[] = needing.map((i) => {
    const unit = (i.unit ?? "unit") as KitchenUnit;
    const status = kitchenStatus(i.count, i.lowThreshold);
    return {
      id: String(i._id),
      kind: "stock",
      label: i.foodNameSnapshot,
      detail: status === "out" ? "none left" : `${formatAmount(i.count, unit, i.unitLabelSnapshot)} left`,
      status,
      done: false,
      count: i.count,
      unit,
      lowThreshold: i.lowThreshold,
      restockTo: i.restockTo ?? 0,
    };
  });

  const manualLines: ToBuyLine[] = manual.map((m) => ({
    id: String(m._id),
    kind: "manual",
    label: m.label,
    detail: m.qty ?? "",
    status: "manual",
    done: !!m.done,
  }));

  const all = [...stockLines, ...manualLines];
  return {
    tracked: items.length,
    out: needing.filter((i) => i.count <= 0).length,
    low: needing.filter((i) => i.count > 0).length,
    manual: manualLines.filter((m) => !m.done).length,
    toBuy: stockLines.length + manualLines.filter((m) => !m.done).length,
    items: limit > 0 ? all.slice(0, limit) : all,
  };
}
