/**
 * Back-compat migration: enable all existing profiles that were left disabled.
 * Run once: npm run enable:profiles
 */
import "dotenv/config";
import mongoose from "mongoose";
import { CompanionProfile } from "../models/CompanionProfile";

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  await mongoose.connect(uri, { dbName: "matchme" });
  console.log("Connected to MongoDB");

  const result = await CompanionProfile.updateMany(
    { isEnabled: false },
    { $set: { isEnabled: true } },
  );

  console.log(`✅ Enabled ${result.modifiedCount} profile(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
