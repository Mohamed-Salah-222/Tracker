import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Wallets gained a `currency` field. Existing documents predate it, and a
// missing currency reads back as null in lean queries, which would let a
// wallet-to-USD-bank movement skip conversion. Backfill everything to EGP,
// which is what the code assumed before the field existed.
async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const col = db.collection("wallets");

  const missing = await col.countDocuments({ currency: { $in: [null, undefined] } });
  console.log(`Wallets missing a currency: ${missing}`);

  const result = await col.updateMany({ currency: { $in: [null, undefined] } }, { $set: { currency: "EGP" } });
  console.log(`Backfilled to EGP: ${result.modifiedCount}`);

  const remaining = await col.countDocuments({ currency: { $in: [null, undefined] } });
  console.log(`Still missing after run: ${remaining}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
