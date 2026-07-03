import rateLimit from "express-rate-limit";

const createLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
  });

export const authLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  10,
  "Too many auth attempts. Please try again in 15 minutes.",
);

export const uploadLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  20,
  "Too many upload requests. Please try again later.",
);

export const generalLimiter = createLimiter(
  15 * 60 * 1000,
  100,
  "Too many requests. Please slow down.",
);

export const strictLimiter = createLimiter(
  60 * 60 * 1000,
  5,
  "Rate limit exceeded. Please try again in an hour.",
);
