import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Bank } from "../models/Bank";
import { Expense } from "../models/Expense";
import { ExternalSource } from "../models/ExternalSource";
import { MoneyMovement } from "../models/MoneyMovement";
import { Subscription } from "../models/Subscription";
import { Wallet } from "../models/Wallet";
import { WishlistItem } from "../models/WishlistItem";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  await mongoose.connect(uri);

  const [
    expenses,
    movements,
    wallets,
    banks,
    externalSources,
    subscriptions,
    wishlistItems,
  ] = await Promise.all([
    Expense.deleteMany({}),
    MoneyMovement.deleteMany({}),
    Wallet.deleteMany({}),
    Bank.deleteMany({}),
    ExternalSource.deleteMany({}),
    Subscription.deleteMany({}),
    WishlistItem.deleteMany({}),
  ]);

  console.log(`Deleted expenses: ${expenses.deletedCount}`);
  console.log(`Deleted money movements: ${movements.deletedCount}`);
  console.log(`Deleted wallets: ${wallets.deletedCount}`);
  console.log(`Deleted banks: ${banks.deletedCount}`);
  console.log(`Deleted people/external sources: ${externalSources.deletedCount}`);
  console.log(`Deleted subscriptions: ${subscriptions.deletedCount}`);
  console.log(`Deleted wishlist items: ${wishlistItems.deletedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
