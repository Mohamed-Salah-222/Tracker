import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express, { type ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import incomeRouter from "./routes/income";
import paymentsRouter from "./routes/payments";
import tasksRouter from "./routes/tasks";
import foodsRouter from "./routes/foods";
import caloriesRouter from "./routes/calories";
import kitchenRouter from "./routes/kitchen";
import recipesRouter from "./routes/recipes";
import habitsRouter from "./routes/habits";
import goalsRouter from "./routes/goals";
import dashboardRouter from "./routes/dashboard";
import workoutsRouter from "./routes/workouts";
import sleepRouter from "./routes/sleep";
import journalRouter from "./routes/journal";
import bodyRouter from "./routes/body";

dotenv.config();

const app = express();

// Render (and any similar host) terminates TLS and forwards the real client IP in
// X-Forwarded-For. Trusting exactly one hop lets the rate limiter key on the caller
// instead of the proxy. Without it every request looks like one client.
app.set("trust proxy", 1);

// Security headers. This API only ever returns JSON, so the browser-facing policies
// helmet sets by default are all safe here; CSP is left on its default since no HTML
// is served from this origin.
app.use(helmet());
app.use(cors());
app.use(express.json());

// Liveness probe stays above the limiter so uptime pings can't exhaust the budget.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Baseline abuse throttle for a single-user app that is publicly reachable. The
// ceiling is far above normal use (a full dashboard load is a few dozen requests)
// but low enough that scripted scraping or brute-forcing gets cut off.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "too many requests, slow down" },
  }),
);

app.use("/api/sleep", sleepRouter);
app.use("/api/journal", journalRouter);
app.use("/api/body", bodyRouter);

app.use("/api/income", incomeRouter);

app.use("/api/payments", paymentsRouter);

app.use("/api/tasks", tasksRouter);

app.use("/api/foods", foodsRouter);

app.use("/api/calories", caloriesRouter);

app.use("/api/kitchen", kitchenRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/goals", goalsRouter);

app.use("/api/dashboard", dashboardRouter);

app.use("/api/workouts", workoutsRouter);

// Unknown /api paths get the same JSON shape as everything else.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not found" });
});

// Centralized error handler. Express 5 forwards rejected async route handlers here,
// so every unhandled failure returns { error: string } instead of an HTML stack page.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const e = (err ?? {}) as {
    status?: number;
    statusCode?: number;
    name?: string;
    type?: string;
    message?: string;
  };

  // Malformed JSON body from express.json()
  if (e.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  // Anything that slipped past route validation and reached Mongoose
  if (e.name === "CastError" || e.name === "ValidationError") {
    return res.status(400).json({ error: e.message || "invalid request" });
  }

  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) {
    console.error("Unhandled route error:", err);
    return res.status(status).json({ error: "internal server error" });
  }
  res.status(status).json({ error: e.message || "request failed" });
};

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not set. Add MONGO_URI to server/.env before starting the server.");
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err));
