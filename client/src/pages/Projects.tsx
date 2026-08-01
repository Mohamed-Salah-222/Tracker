import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { ArrowRight, FolderKanban, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export type ProjectTicketStatus = "todo" | "working" | "done";

export type ProjectTicket = {
  id: string;
  title: string;
  description: string;
  status: ProjectTicketStatus;
  threadCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  percent: number;
  ticketCount: number;
  todoCount: number;
  workingCount: number;
  doneCount: number;
  tickets: ProjectTicket[];
  createdAt: string;
  updatedAt: string;
};

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

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get<Project[]>("/projects");
      setProjects(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleProjects = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(s));
  }, [projects, search]);

  return (
    <div className="w-full max-w-[1600px] space-y-5">
      <motion.div {...fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] font-semibold text-muted-foreground">Projects</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Project Boards</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create project boards, break them into tickets, and move work through a simple Jira-style flow.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-9">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </motion.div>

      <motion.div {...stagger(1)} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects..." className="h-10 rounded-xl pl-9" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-lg border border-border bg-muted px-2 py-1 font-mono tabular-nums">{projects.length} projects</span>
          <span className="rounded-lg border border-border bg-muted px-2 py-1 font-mono tabular-nums">{projects.reduce((sum, project) => sum + project.ticketCount, 0)} tickets</span>
        </div>
      </motion.div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading projects...</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
          {visibleProjects.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-10 text-center">
                <FolderKanban className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
                <div className="text-base font-semibold">No projects found</div>
                <p className="mt-1 text-sm text-muted-foreground">Create a board or clear the search.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(project) => setProjects((current) => [...current, project])} />
    </div>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <motion.div {...stagger(index + 2)}>
      <Link to={`/projects/${project.id}`} className="group block h-full">
        <Card className="relative h-full min-h-[260px] overflow-hidden border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_56px_rgba(15,23,42,0.12)]">
          <motion.div className="absolute inset-y-0 left-0 bg-green-50" initial={{ width: 0 }} animate={{ width: `${project.percent}%` }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} />
          <CardContent className="relative flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-950 text-white shadow-sm">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-tight">{project.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description || "No description yet."}</p>
                </div>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>

            <div className="mt-auto pt-8">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Progress</div>
                  <div className="mt-1 text-3xl font-semibold font-mono tabular-nums">{project.percent}%</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-mono tabular-nums">{project.doneCount}/{project.ticketCount}</div>
                  <div>done</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="To do" value={project.todoCount} />
                <Stat label="Working" value={project.workingCount} />
                <Stat label="Done" value={project.doneCount} tone="green" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "green" }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone === "green" ? "border-green-200 bg-green-50 text-green-800" : "border-neutral-200 bg-white/80 text-neutral-900"}`}>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ProjectDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (value: boolean) => void; onSaved: (project: Project) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
  }, [open]);

  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName) return toast.error("Project name required");
    setSaving(true);
    try {
      const r = await api.post<Project>("/projects", { name: cleanName, description: description.trim() });
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
      <DialogContent className="!max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project about?" className="min-h-24 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/15" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
