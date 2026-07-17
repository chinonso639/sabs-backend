import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

// Get allowed origins for CORS
const getAllowedOrigins = (): string[] => {
  const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return [
    baseUrl,
    baseUrl.replace("https://", "https://www."),
    baseUrl.replace("http://", "http://www."),
  ];
};

// Set CORS headers on response
const setCorsHeaders = (req: Request, res: Response): void => {
  const origin = req.headers.origin;
  if (origin && getAllowedOrigins().includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
};

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : "Internal server error";

  if (process.env.NODE_ENV !== "production") {
    console.error("❌ Error:", err);
  }

  // Set CORS headers for error responses
  setCorsHeaders(req, res);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

// Handle OPTIONS requests for routes that might not have CORS preflight handled
export const handleOptions = (req: Request, res: Response): void => {
  setCorsHeaders(req, res);
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.status(204).end();
};

export const createError = (message: string, statusCode: number): AppError => {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
};

export const notFound = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const err = createError("Route not found", 404);
  next(err);
};
