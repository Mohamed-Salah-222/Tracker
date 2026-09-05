import { toast } from "sonner";
import { api } from "./api";

/**
 * Undo, offered on every delete in the app without any page asking for it.
 *
 * The server keeps a copy of whatever a request removed and answers with a batch id
 * in a header. This watches for that header and offers to put it back. One
 * interceptor covers all twenty seven delete paths, and a page added tomorrow gets
 * undo for free, which no amount of per-page work would have managed.
 */
export type TrashBatch = {
  batch: string;
  deletedAt: string;
  context: string;
  count: number;
  labels: string[];
  collections: string[];
};

export const listTrash = () => api.get<TrashBatch[]>("/trash").then((r) => r.data);
export const emptyTrash = () => api.delete("/trash");
export const restoreBatch = (batch: string) => api.post<{ restored: number; skipped: number }>(`/trash/${batch}/restore`).then((r) => r.data);

/**
 * Put a batch back, then reload.
 *
 * The page removed the row from its own list when the delete succeeded, and there is
 * no general way to tell every page in the app to go and look again. A reload right
 * after an explicit undo is expected and cannot show a half-restored screen.
 */
export async function undo(batch: string): Promise<void> {
  try {
    const result = await restoreBatch(batch);
    if (result.restored === 0) {
      toast.error("There was nothing left to put back");
      return;
    }
    window.location.reload();
  } catch {
    toast.error("It could not be put back");
  }
}

let installed = false;

export function installUndo(): void {
  if (installed) return;
  installed = true;

  api.interceptors.response.use((response) => {
    const batch = response.headers?.["x-trash-batch"];
    const count = Number(response.headers?.["x-trash-count"] ?? 0);
    if (!batch || count < 1) return response;

    toast.success(count === 1 ? "Deleted" : `Deleted ${count} things`, {
      description: "Kept for thirty days.",
      action: { label: "Undo", onClick: () => void undo(String(batch)) },
      duration: 8000,
    });
    return response;
  });
}
