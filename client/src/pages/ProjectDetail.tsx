import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { ArrowLeft, CheckCircle2, FolderKanban, GripVertical, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { Project, ProjectTicket, ProjectTicketStatus } from "./Projects";

const BOARD_COLUMNS: { id: ProjectTicketStatus; title: string; helper: string }[] = [
  { id: "todo", title: "To do", helper: "Ready to be picked up" },
  { id: "working", title: "Working on it", helper: "Currently active" },
  { id: "done", title: "Done", helper: "Finished and checked" },
];

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await api.get<Project>(`/projects/${projectId}`);
      setProject(r.data);
    } catch (e) {
      if (e instanceof AxiosError && e.response?.status === 404) setProject(null);
      else toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const tickets = useMemo(() => project?.tickets ?? [], [project]);

  const moveTicket = async (ticketId: string, status: ProjectTicketStatus) => {
    if (!project) return;
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.status === status) return;

    const previous = project;
    setProject({ ...project, tickets: tickets.map((item) => (item.id === ticketId ? { ...item, status } : item)) });
    try {
      const r = await api.patch<Project>(`/projects/${project.id}/tickets/${ticketId}`, { status });
      setProject(r.data);
    } catch (e) {
      setProject(previous);
      toast.error(getApiError(e));
    }
  };

  const deleteTicket = async (ticketId: string) => {
    if (!project) return;
    try {
      const r = await api.delete<Project>(`/projects/${project.id}/tickets/${ticketId}`);
      setProject(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const bumpThreads = async (ticket: ProjectTicket) => {
    if (!project) return;
    try {
      const r = await api.patch<Project>(`/projects/${project.id}/tickets/${ticket.id}`, { threadCount: ticket.threadCount + 1 });
      setProject(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const handleDrop = (status: ProjectTicketStatus) => {
    if (!draggedTicketId) return;
    void moveTicket(draggedTicketId, status);
    setDraggedTicketId(null);
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1100px]">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading project...</CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full max-w-[900px]">
        <Card>
          <CardContent className="p-8 text-center">
            <FolderKanban className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
            <div className="text-lg font-semibold">Project not found</div>
            <Link to="/projects" className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Back to Projects
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1700px] space-y-5">
      <motion.div {...fadeUp} className="space-y-4">
        <Link to="/projects" className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-950 text-white shadow-sm">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.24em] font-semibold text-muted-foreground">Project</div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">{project.name}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{project.description || "No description yet."}</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <motion.div className="absolute inset-y-0 left-0 bg-green-50" initial={{ width: 0 }} animate={{ width: `${project.percent}%` }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Progress</div>
              <div className="mt-1 text-4xl font-semibold font-mono tabular-nums tracking-tight">{project.percent}%</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {project.doneCount}/{project.ticketCount} tickets done
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div {...stagger(1)} className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 text-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Project Board</h2>
            <p className="mt-1 text-xs text-white/60">Drag tickets between lanes. Add rough work now, refine details later.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="border-white/20 bg-white/10 text-white hover:bg-white/15">
            <Plus className="h-4 w-4" />
            Add Ticket
          </Button>
        </div>
      </motion.div>

      <motion.div {...stagger(2)}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {BOARD_COLUMNS.map((column) => {
            const columnTickets = tickets.filter((ticket) => ticket.status === column.id);
            const activeDrop = draggedTicketId !== null;
            const doneColumn = column.id === "done";
            return (
              <section
                key={column.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(column.id)}
                className={`min-h-[640px] rounded-2xl border p-3 transition-colors ${activeDrop ? "border-neutral-300 bg-neutral-100" : "border-neutral-200 bg-[#f7f7f8]"}`}
              >
                <div className="mb-3 rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-5 w-1 rounded-full ${doneColumn ? "bg-green-600" : "bg-neutral-950"}`} />
                        <h3 className={`text-sm font-bold tracking-tight ${doneColumn ? "text-green-700" : "text-neutral-950"}`}>{column.title}</h3>
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-500">{column.helper}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-[11px] font-mono font-semibold ${doneColumn ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 bg-white text-neutral-500"}`}>{columnTickets.length}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {columnTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} muted={doneColumn} dragging={draggedTicketId === ticket.id} onDragStart={() => setDraggedTicketId(ticket.id)} onDragEnd={() => setDraggedTicketId(null)} onDelete={() => void deleteTicket(ticket.id)} onThread={() => void bumpThreads(ticket)} />
                  ))}
                  {columnTickets.length === 0 && <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/70 px-4 text-center text-xs font-medium text-neutral-400">Drop tickets here</div>}
                </div>
              </section>
            );
          })}
        </div>
      </motion.div>

      <AddTicketDialog projectId={project.id} open={addOpen} onOpenChange={setAddOpen} onSaved={setProject} />
    </div>
  );
}

function TicketCard({ ticket, muted, dragging, onDragStart, onDragEnd, onDelete, onThread }: { ticket: ProjectTicket; muted: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onDelete: () => void; onThread: () => void }) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={ticket.description || ticket.title}
      className={`group rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md ${dragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-neutral-300 group-hover:text-neutral-500" />
        <div className="min-w-0 flex-1">
          <h4 className={`text-[13px] font-semibold leading-snug tracking-normal ${muted ? "text-neutral-500 line-through" : "text-neutral-950"}`}>{ticket.title}</h4>
          {ticket.description && <p className="mt-2 line-clamp-3 text-xs leading-5 text-neutral-500">{ticket.description}</p>}
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={onThread} className="h-7 shrink-0 border-neutral-200 bg-white px-2.5 text-neutral-700 hover:bg-neutral-100">
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {ticket.threadCount > 0 && <span className="font-mono tabular-nums text-neutral-950">{ticket.threadCount}</span>}
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} className="h-7 shrink-0 border-neutral-200 bg-white px-2 text-neutral-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AddTicketDialog({ projectId, open, onOpenChange, onSaved }: { projectId: string; open: boolean; onOpenChange: (value: boolean) => void; onSaved: (project: Project) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
  }, [open]);

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return toast.error("Ticket title required");
    setSaving(true);
    try {
      const r = await api.post<Project>(`/projects/${projectId}/tickets`, { title: cleanTitle, description: description.trim() });
      onSaved(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ticket title" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Notes, acceptance criteria, or anything you need to remember." className="min-h-28 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/15" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Adding..." : "Add Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
