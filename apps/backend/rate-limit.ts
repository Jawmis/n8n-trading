import type { NextFunction, Request, Response } from "express";
import { RequestLimitModel } from "db/client";

export type RateLimitStore = {
  increment(key: string, windowStart: Date, expiresAt: Date): Promise<number>;
};

export const mongoRateLimitStore: RateLimitStore = {
  async increment(key, windowStart, expiresAt) {
    try {
      const bucket = await RequestLimitModel.findOneAndUpdate(
        { key, windowStart },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      ).select("count").lean();
      if (!bucket) throw new Error("Rate limit bucket was not created");
      return bucket.count;
    } catch (error) {
      // A simultaneous first request can win the unique-key insert. Retry the
      // increment against its row instead of allowing a burst through.
      if ((error as { code?: number })?.code !== 11000) throw error;
      const bucket = await RequestLimitModel.findOneAndUpdate(
        { key, windowStart }, { $inc: { count: 1 } }, { new: true },
      ).select("count").lean();
      if (!bucket) throw new Error("Rate limit bucket disappeared");
      return bucket.count;
    }
  },
};

export function createRateLimitMiddleware(store: RateLimitStore = mongoRateLimitStore) {
  return async function rateLimit(req: Request, res: Response, next: NextFunction) {
    if (["/healthz", "/readyz"].includes(req.path)) { next(); return; }
    const isAuth = req.path === "/signup" || req.path === "/signin";
    const limit = isAuth ? 10 : 600;
    const windowMs = 15 * 60_000;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const identity = req.ip || req.socket.remoteAddress || "unknown";
    const action = isAuth ? req.path.slice(1) : "api";
    try {
      const count = await store.increment(`${action}:${identity}`, windowStart, new Date(windowStart.getTime() + 24 * 60 * 60_000));
      if (count > limit) {
        res.setHeader("Retry-After", String(Math.ceil((windowStart.getTime() + windowMs - now) / 1000)));
        res.status(429).json({ message: isAuth ? "Too many attempts. Try again later." : "Request limit reached. Try again later." });
        return;
      }
      next();
    } catch {
      // Fail closed if the shared rate-limit store is unavailable.
      res.status(503).json({ message: "Request protection is temporarily unavailable" });
    }
  };
}
