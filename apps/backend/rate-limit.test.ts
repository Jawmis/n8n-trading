import { expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { createRateLimitMiddleware, type RateLimitStore } from "./rate-limit";

function response() {
  return {
    code: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function request(path: string) {
  return { path, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as Request;
}

test("limits repeated sign in attempts by client IP", async () => {
  const counts = new Map<string, number>();
  const store: RateLimitStore = { increment: async (key) => (counts.set(key, (counts.get(key) ?? 0) + 1), counts.get(key)!) };
  const middleware = createRateLimitMiddleware(store);
  let limited = response();
  for (let i = 0; i < 11; i++) {
    const res = response();
    await middleware(request("/signin"), res as unknown as Response, (() => {}) as NextFunction);
    if (res.code === 429) limited = res;
  }
  expect(limited.code).toBe(429);
  expect(limited.headers["Retry-After"]).toBeTruthy();
});

test("fails closed when the shared limit store is unavailable", async () => {
  const middleware = createRateLimitMiddleware({ increment: async () => { throw new Error("database unavailable"); } });
  const res = response();
  await middleware(request("/workflow"), res as unknown as Response, (() => {}) as NextFunction);
  expect(res.code).toBe(503);
});

test("does not throttle readiness probes", async () => {
  const middleware = createRateLimitMiddleware({ increment: async () => { throw new Error("must not be called"); } });
  const res = response();
  let continued = false;
  await middleware(request("/readyz"), res as unknown as Response, (() => { continued = true; }) as NextFunction);
  expect(continued).toBe(true);
});
