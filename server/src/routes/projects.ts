import { Router } from "express";
import { Types } from "mongoose";
import { Project, PROJECT_TICKET_STATUSES, type ProjectDocument, type ProjectTicketStatus } from "../models/Project";
import { HttpError, isNonNegativeNumber, objectIdParam, trimmedString } from "../lib/validation";

const router = Router();

router.param("id", objectIdParam);

const TRACKER_SEED_KEY = "tracker-saas-conversion";

const TRACKER_TICKETS = [
  ["SAAS-001: Clerk project setup + client SDK integration", "Create Clerk app, install client SDK, wrap the app in ClerkProvider, and add Clerk sign-in/sign-up/user controls."],
  ["SAAS-002: Server-side Clerk token verification middleware", "Verify Clerk session tokens on every API request and attach the Clerk user id to the request."],
  ["SAAS-003: Replace PrivateRoute.tsx with Clerk auth state", "Delete the hardcoded password gate and protect the full app shell with Clerk signed-in/signed-out logic."],
  ["SAAS-004: Decide what userId means everywhere", "Use Clerk userId directly as the userId field across the app, unless a later decision changes that."],
  ["SAAS-005: Add userId to all models", "Add indexed Clerk userId fields to all app data models so every document belongs to an account."],
  ["SAAS-006: Food becomes per-user with seed-copy on signup", "Create an editable per-user food library copied from a default seed set when a user joins."],
  ["SAAS-007: Clerk webhook signup provisioning", "Handle Clerk user.created and initialize food seeds plus any required per-user defaults."],
  ["SAAS-008: Convert singleton logic to per-user singleton", "Scope Goal, WeightGoal, and Rate singleton enforcement by userId instead of globally."],
  ["SAAS-009: Convert global unique indexes to tenant indexes", "Add userId into unique indexes for dashboard trackers, cheat days, day statuses, workouts, and fridge items."],
  ["SAAS-010: Enforce same-user ownership on references", "Validate referenced documents belong to the same user before linking or writing cross-document data."],
  ["SAAS-011: Route ownership - income.ts", "Filter and write income data by req.auth.userId."],
  ["SAAS-012: Route ownership - payments.ts", "Filter and write payment data by req.auth.userId, including movement ownership checks."],
  ["SAAS-013: Route ownership - tasks.ts", "Filter and write tasks by req.auth.userId."],
  ["SAAS-014: Route ownership - foods.ts", "Filter and write foods by req.auth.userId after the food seed-copy conversion."],
  ["SAAS-015: Route ownership - fridge.ts", "Filter and write fridge data by req.auth.userId."],
  ["SAAS-016: Route ownership - calories.ts", "Filter and write calorie, water, and cheat-day records by req.auth.userId."],
  ["SAAS-017: Route ownership - dashboard.ts", "Filter and write dashboard tracker data by req.auth.userId."],
  ["SAAS-018: Route ownership - workouts.ts", "Filter and write workouts and set logs by req.auth.userId."],
  ["SAAS-019: Route ownership - goals.ts", "Filter and write life goals, contributions, and related progress by req.auth.userId."],
  ["SAAS-020: Existing data migration", "Backfill all current production data to your real Clerk user id after signing up through the new auth flow."],
  ["SAAS-021: Wire every page to Clerk auth state", "Confirm each client page works with server-scoped data and no longer assumes one global dataset."],
  ["SAAS-022: Remove hardcoded secrets and URLs", "Remove hardcoded password/API assumptions and make the API base URL environment-driven."],
  ["SAAS-023: Paymob account and API credentials", "Collect Paymob API key, integration ID, iframe ID, and decide the initial checkout path."],
  ["SAAS-024: Subscription model for billing", "Create a distinct SaaS billing subscription model separate from personal recurring bills."],
  ["SAAS-025: Recurring charge flow via Paymob tokenization", "Collect card details through Paymob, save token references, and charge subscriptions on cycle."],
  ["SAAS-026: Paymob webhook handling", "Update billing status from payment success, failure, renewal, and cancellation callbacks."],
  ["SAAS-027: Gate app access on subscription status", "Block unpaid accounts with a single active-plan check, no tier system required for MVP."],
  ["SAAS-028: Public marketing landing route", "Build a real logged-out landing page with value prop, price, and signup CTA."],
  ["SAAS-029: Routing split for logged-out vs logged-in root", "Show landing when signed out and Tracker/Dashboard when signed in."],
  ["SAAS-030: Data export", "Let users download their account data."],
  ["SAAS-031: Account deletion", "Cancel active Paymob subscription and clean up or anonymize account data across all models."],
  ["SAAS-032: Audit logging", "Record billing changes and account deletion events."],
  ["SAAS-033: Per-user rate limiting", "Move rate limiting from broad IP-only logic toward account-aware limits."],
  ["SAAS-034: Production CORS allowlist", "Restrict CORS to the real production domain setup."],
  ["SAAS-035: Infrastructure capacity review", "Confirm MongoDB Atlas and hosting tiers can support real paying customers."],
] as const;

function readStatus(value: unknown): ProjectTicketStatus | null {
  return typeof value === "string" && (PROJECT_TICKET_STATUSES as readonly string[]).includes(value) ? (value as ProjectTicketStatus) : null;
}

function projectView(project: ProjectDocument) {
  const tickets = project.tickets
    .slice()
    .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime())
    .map((ticket) => ({
      id: ticket._id.toString(),
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      threadCount: ticket.threadCount,
      order: ticket.order,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    }));
  const done = tickets.filter((ticket) => ticket.status === "done").length;
  const percent = tickets.length ? Math.round((done / tickets.length) * 100) : 0;
  return {
    id: project._id.toString(),
    name: project.name,
    description: project.description,
    order: project.order,
    percent,
    ticketCount: tickets.length,
    doneCount: done,
    workingCount: tickets.filter((ticket) => ticket.status === "working").length,
    todoCount: tickets.filter((ticket) => ticket.status === "todo").length,
    tickets,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

async function ensureTrackerProject() {
  const existing = await Project.findOne({ seedKey: TRACKER_SEED_KEY, archived: false });
  if (existing) return;

  await Project.create({
    name: "Tracker",
    description: "SaaS conversion roadmap for turning LifeTracker into a paid multi-user product.",
    seedKey: TRACKER_SEED_KEY,
    order: await Project.countDocuments({ archived: false }),
    tickets: TRACKER_TICKETS.map(([title, description], index) => ({
      title,
      description,
      status: "todo",
      threadCount: 0,
      order: index,
    })),
  });
}

async function loadProject(id: string): Promise<ProjectDocument> {
  const project = await Project.findById(id);
  if (!project || project.archived) throw new HttpError(404, "project not found");
  return project;
}

router.get("/", async (_req, res) => {
  await ensureTrackerProject();
  const projects = await Project.find({ archived: false }).sort({ order: 1, createdAt: 1 });
  res.json(projects.map(projectView));
});

router.post("/", async (req, res) => {
  const name = trimmedString(req.body?.name);
  if (!name) return res.status(400).json({ error: "name required" });
  if (req.body?.description !== undefined && typeof req.body.description !== "string") {
    return res.status(400).json({ error: "description must be a string" });
  }

  const project = await Project.create({
    name,
    description: req.body?.description ?? "",
    order: await Project.countDocuments({ archived: false }),
  });
  res.json(projectView(project));
});

router.get("/:id", async (req, res) => {
  await ensureTrackerProject();
  const project = await loadProject(req.params.id);
  res.json(projectView(project));
});

router.patch("/:id", async (req, res) => {
  const project = await loadProject(req.params.id);
  if (req.body?.name !== undefined) {
    const name = trimmedString(req.body.name);
    if (!name) return res.status(400).json({ error: "name required" });
    project.name = name;
  }
  if (req.body?.description !== undefined) {
    if (typeof req.body.description !== "string") return res.status(400).json({ error: "description must be a string" });
    project.description = req.body.description;
  }
  if (req.body?.order !== undefined) {
    if (!isNonNegativeNumber(req.body.order)) return res.status(400).json({ error: "order must be a non-negative number" });
    project.order = req.body.order;
  }
  await project.save();
  res.json(projectView(project));
});

router.delete("/:id", async (req, res) => {
  const project = await loadProject(req.params.id);
  project.archived = true;
  await project.save();
  res.json({ ok: true });
});

router.post("/:id/tickets", async (req, res) => {
  const project = await loadProject(req.params.id);
  const title = trimmedString(req.body?.title);
  if (!title) return res.status(400).json({ error: "title required" });
  if (req.body?.description !== undefined && typeof req.body.description !== "string") {
    return res.status(400).json({ error: "description must be a string" });
  }

  const status = req.body?.status === undefined ? "todo" : readStatus(req.body.status);
  if (!status) return res.status(400).json({ error: `status must be one of ${PROJECT_TICKET_STATUSES.join(", ")}` });

  const maxOrder = project.tickets.reduce((max, ticket) => Math.max(max, ticket.order), -1);
  project.tickets.push({
    title,
    description: req.body?.description ?? "",
    status,
    threadCount: 0,
    order: maxOrder + 1,
  });
  await project.save();
  res.json(projectView(project));
});

router.patch("/:id/tickets/:ticketId", async (req, res) => {
  const project = await loadProject(req.params.id);
  const ticket = project.tickets.id(req.params.ticketId as unknown as Types.ObjectId);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });

  if (req.body?.title !== undefined) {
    const title = trimmedString(req.body.title);
    if (!title) return res.status(400).json({ error: "title required" });
    ticket.title = title;
  }
  if (req.body?.description !== undefined) {
    if (typeof req.body.description !== "string") return res.status(400).json({ error: "description must be a string" });
    ticket.description = req.body.description;
  }
  if (req.body?.status !== undefined) {
    const status = readStatus(req.body.status);
    if (!status) return res.status(400).json({ error: `status must be one of ${PROJECT_TICKET_STATUSES.join(", ")}` });
    ticket.status = status;
  }
  if (req.body?.threadCount !== undefined) {
    if (!isNonNegativeNumber(req.body.threadCount)) return res.status(400).json({ error: "threadCount must be a non-negative number" });
    ticket.threadCount = req.body.threadCount;
  }
  if (req.body?.order !== undefined) {
    if (!isNonNegativeNumber(req.body.order)) return res.status(400).json({ error: "order must be a non-negative number" });
    ticket.order = req.body.order;
  }

  await project.save();
  res.json(projectView(project));
});

router.delete("/:id/tickets/:ticketId", async (req, res) => {
  const project = await loadProject(req.params.id);
  const ticket = project.tickets.id(req.params.ticketId as unknown as Types.ObjectId);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  ticket.deleteOne();
  await project.save();
  res.json(projectView(project));
});

export default router;
