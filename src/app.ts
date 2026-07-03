import "express-async-errors";
import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profiles";
import subscriptionRoutes from "./routes/subscriptions";
import adminRoutes from "./routes/admin";
import reportRoutes from "./routes/reports";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimiter";
import { getB2Client, getB2Bucket } from "./config/b2";

const app = express();

// ── Security Middleware ────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── Body Parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ── Logging ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ── Rate Limiting ──────────────────────────────────────────────────────────────
app.use("/api", generalLimiter);

// ── Health Check ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "MatchMe API is running",
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);

// ── B2 Media Proxy ─────────────────────────────────────────────────────────────
// Serves private B2 files through the backend so the bucket can stay private.
// URL format: GET /api/media/profiles/image.webp  or  /api/media/gallery/video.mp4
app.get("/api/media/*", async (req: Request, res: Response) => {
  const key = (req.params as Record<string, string>)[0];
  if (!key) {
    res.status(400).json({ error: "Missing file key" });
    return;
  }

  try {
    const command = new GetObjectCommand({ Bucket: getB2Bucket(), Key: key });
    const s3Res = await getB2Client().send(command);

    if (s3Res.ContentType) res.setHeader("Content-Type", s3Res.ContentType);
    if (s3Res.ContentLength)
      res.setHeader("Content-Length", String(s3Res.ContentLength));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // Stream body to client
    const { Readable } = await import("stream");
    const body = s3Res.Body as NodeJS.ReadableStream;
    Readable.from(body as AsyncIterable<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});

// ── 404 & Error Handler ────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
