import mongoose from "mongoose";

// Cached connection for serverless environments
let isConnected = false;

export const connectDB = async (): Promise<void> => {
  // If already connected, return early
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log("✅ Using existing MongoDB connection");
    return;
  }

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

  isConnected = true;
  console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
};

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
  isConnected = false;
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected");
  isConnected = false;
});
