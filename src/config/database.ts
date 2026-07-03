import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error("MONGODB_URI is not defined in environment variables");

  await mongoose.connect(uri, {
    dbName: "matchme",
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
  });

  console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
};

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected");
});
