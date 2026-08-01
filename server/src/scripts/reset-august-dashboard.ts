import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { DashboardTracker } from "../models/DashboardTracker";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  await mongoose.connect(uri);

  const julyStart = new Date(Date.UTC(2026, 6, 1));
  const augustStart = new Date(Date.UTC(2026, 7, 1));

  const julyResult = await DashboardTracker.deleteMany({
    date: { $gte: julyStart, $lt: augustStart },
  });

  const retiredRowsResult = await DashboardTracker.collection.deleteMany({
    kind: { $in: ["reading", "planning"] },
  });

  console.log(`Deleted July dashboard tracker entries: ${julyResult.deletedCount}`);
  console.log(`Deleted retired Reading/Quran tracker entries: ${retiredRowsResult.deletedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
