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
import { generalLimiter, mediaLimiter } from "./middleware/rateLimiter";
import { getB2Client, getB2Bucket, getB2PublicUrlBase } from "./config/b2";

const app = express();

// ── Trust Proxy ────────────────────────────────────────────────────────────────
// Required for Railway/cloud deployments to correctly read client IP from X-Forwarded-For
app.set("trust proxy", 1);

// ── Security Middleware ────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      // Get base frontend URL from env
      const baseUrl = (
        process.env.FRONTEND_URL || "http://localhost:3000"
      ).replace(/\/$/, "");

      // Allow both with and without www subdomain
      const allowedOrigins = [
        baseUrl,
        baseUrl.replace("https://", "https://www."),
        baseUrl.replace("http://", "http://www."),
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// ── Body Parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ── Logging ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ── B2 Media Proxy ─────────────────────────────────────────────────────────────
// Serves B2 files through the backend. Placed BEFORE the general rate limiter
// and given a dedicated, generous limiter so that image-heavy pages (which
// trigger many concurrent requests from browsers / Next.js image optimizer)
// don't exhaust the 100 req/15min general limit and return 429.
// URL format: GET /api/media/profiles/image.webp  or  /api/media/gallery/video.mp4
app.get("/api/media/*", mediaLimiter, async (req: Request, res: Response) => {
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

    // Aggressive caching headers
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // ETag for browser caching
    if (s3Res.ETag) {
      res.setHeader("ETag", s3Res.ETag);
    }

    // Check if client has cached version
    if (req.headers["if-none-match"] === s3Res.ETag) {
      res.status(304).end();
      return;
    }

    // Stream body to client
    const { Readable } = await import("stream");
    const body = s3Res.Body as NodeJS.ReadableStream;
    Readable.from(body as AsyncIterable<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});

// ── Rate Limiting ──────────────────────────────────────────────────────────────
app.use("/api", generalLimiter);

// ── Health Check ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "MatchMe API is running",
    timestamp: new Date().toISOString(),
    b2PublicBaseUrl: getB2PublicUrlBase() || null,
  });
});

// ── Handle OPTIONS requests for all routes (CORS preflight) ───────────────────────
app.options("*", (_req, res) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.status(204).end();
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);

// ── 404 & Error Handler ────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
