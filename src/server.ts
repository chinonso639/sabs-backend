import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/database";
import { initB2 } from "./config/b2";

const PORT = parseInt(process.env.PORT || "5000", 10);

const startServer = async () => {
  await connectDB();
  await initB2();

  const server = app.listen(PORT, () => {
    console.log(`🚀 MatchMe API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("❌ Unhandled Promise Rejection:", reason);
    server.close(() => process.exit(1));
  });
};

startServer().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
