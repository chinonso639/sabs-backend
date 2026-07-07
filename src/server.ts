import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/database";
import { initB2 } from "./config/b2";

const PORT = parseInt(process.env.PORT || "5000", 10);

// Initialize connections
const initialize = async () => {
  await connectDB();
  await initB2();
};

// For Vercel serverless - just export the app after initialization
if (process.env.VERCEL) {
  initialize().catch(console.error);
  module.exports = app;
} else {
  // For local development - start the server
  const startServer = async () => {
    await initialize();

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
}

export default app;
