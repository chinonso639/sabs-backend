/**
 * Admin seed script - run once: npm run seed:admin
 * Creates the initial admin account from environment variables.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Admin } from "../models/Admin";

const seedAdmin = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  await mongoose.connect(uri, { dbName: "matchme" });
  console.log("Connected to MongoDB");

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = "Super Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  const exists = await Admin.findOne({ email });
  if (exists) {
    console.log("Admin already exists:", email);
    await mongoose.disconnect();
    return;
  }

  await Admin.create({ name, email, password });
  console.log(`✅ Admin created: ${email}`);
  await mongoose.disconnect();
};

seedAdmin().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
