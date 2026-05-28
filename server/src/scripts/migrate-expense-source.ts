import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const col = db.collection("expenses");

  const docs = await col.find({ walletId: { $exists: true } }).toArray();
  console.log(`Scanned: ${docs.length}`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    if (doc.sourceId) {
      skipped++;
      continue;
    }
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          sourceType: "wallet",
          sourceId: doc.walletId,
          sourceNameSnapshot: doc.walletNameSnapshot ?? "",
        },
      },
    );
    migrated++;
  }

  console.log(`Migrated: ${migrated}, Skipped (already done): ${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
