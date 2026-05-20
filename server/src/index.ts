import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import incomeRouter from "./routes/income";
import paymentsRouter from "./routes/payments";
import tasksRouter from "./routes/tasks";
import foodsRouter from "./routes/foods";
import caloriesRouter from "./routes/calories";
import fridgeRouter from "./routes/fridge";
import dashboardRouter from "./routes/dashboard";
import workoutsRouter from "./routes/workouts";
import careerRouter from "./routes/career";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/income", incomeRouter);

app.use("/api/payments", paymentsRouter);

app.use("/api/tasks", tasksRouter);

app.use("/api/foods", foodsRouter);

app.use("/api/calories", caloriesRouter);

app.use("/api/fridge", fridgeRouter);

app.use("/api/dashboard", dashboardRouter);

app.use("/api/workouts", workoutsRouter);

app.use("/api/career", careerRouter);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI as string;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err));
