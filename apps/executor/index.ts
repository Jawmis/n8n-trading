import mongoose from "mongoose";
import { ExecutionModel, WorkflowModel } from "db/client";
import { executeWorkflow, type WorkflowLike } from "./execute";
import { crossedThreshold, type PriceDirection } from "./price";

export const POLL_INTERVAL_MS = 2_000;
const JOB_LEASE_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let stopping = false;
let healthServer: ReturnType<typeof Bun.serve> | undefined;

function startHealthServer() {
  const port = Number(process.env.EXECUTOR_HEALTH_PORT ?? 3001);
  healthServer = Bun.serve({
    port,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/healthz") return Response.json({ status: "ok" });
      if (path === "/readyz") return Response.json({ status: mongoose.connection.readyState === 1 ? "ready" : "not_ready" }, { status: mongoose.connection.readyState === 1 ? 200 : 503 });
      return new Response("Not found", { status: 404 });
    },
  });
}

function isTimerTrigger(node: WorkflowLike["nodes"][number]) {
  return String(node.data?.kind).toLowerCase() === "trigger" && node.type === "timer";
}

type PriceFeed = { getPrice(asset: string): Promise<number> };
function priceFeed() {
  return (globalThis as typeof globalThis & { PRICE_FEED?: PriceFeed }).PRICE_FEED;
}
const lastPrices = new Map<string, number>();

export function timerIsDue(lastExecution: { startTime?: Date | string } | null, seconds: unknown, now = Date.now()) {
  const interval = Number(seconds);
  if (!Number.isFinite(interval) || interval <= 0) return false;
  if (!lastExecution?.startTime) return true;
  return now - new Date(lastExecution.startTime).getTime() >= interval * 1_000;
}

async function enqueueTimerJobs(now: number) {
  const workflows = await WorkflowModel.find();
  for (const workflow of workflows as unknown as WorkflowLike[]) {
    const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
    if (!trigger) continue;
    if (trigger.type === "price-trigger") {
      const feed = priceFeed();
      const metadata = trigger.data?.metadata ?? {};
      if (!feed || typeof metadata.asset !== "string" || typeof metadata.price !== "number") continue;
      try {
        const current = await feed.getPrice(metadata.asset);
        const key = `${workflow._id}:${trigger.id}`;
        const previous = lastPrices.get(key);
        lastPrices.set(key, current);
        if (previous === undefined || !crossedThreshold(previous, current, metadata.price, metadata.direction as PriceDirection | undefined)) continue;
        await ExecutionModel.create({ workflowId: workflow._id, kind: "price", status: "pending", queueKey: `${key}:${now}` });
      } catch {
        // A stale or disconnected price feed must not trigger a trade.
      }
      continue;
    }
    if (!isTimerTrigger(trigger)) continue;
    const seconds = Number(trigger.data?.metadata?.time);
    if (!timerIsDue(await ExecutionModel.findOne({ workflowId: workflow._id }).sort({ startTime: -1 }), seconds, now)) continue;
    const slot = Math.floor(now / (seconds * 1_000));
    try {
      await ExecutionModel.create({
        workflowId: workflow._id,
        kind: "timer",
        status: "pending",
        queueKey: `${workflow._id}:timer:${slot}`,
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  }
}

async function claimAndStartJob(now: number): Promise<boolean> {
  const job = await ExecutionModel.findOneAndUpdate(
    {
      $or: [
        { status: "pending" },
        { status: "running", leaseUntil: { $lte: new Date(now) } },
      ],
    },
    {
      $set: { status: "running", claimedAt: new Date(now), leaseUntil: new Date(now + JOB_LEASE_MS) },
      $inc: { attempt: 1 },
    },
    { new: true, sort: { startTime: 1 } },
  );
  if (!job) return false;
  const workflow = await WorkflowModel.findById(job.workflowId);
  if (!workflow) {
    await ExecutionModel.updateOne({ _id: job._id }, { $set: { status: "failure", endTime: new Date(now), error: "Workflow not found", leaseUntil: null } });
    return true;
  }
  void executeWorkflow(workflow as unknown as WorkflowLike, job._id).catch((error) => console.error(`[executor] job ${job._id} failed`, error));
  return true;
}

export async function pollOnce(now = Date.now()): Promise<number> {
  await enqueueTimerJobs(now);
  let started = 0;
  while (await claimAndStartJob(now)) started += 1;
  return started;
}

export async function startPolling() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error("MONGO_URL is required");
  await mongoose.connect(mongoUrl);
  console.log("[executor] connected to MongoDB");
  startHealthServer();
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  while (!stopping) {
    try { await pollOnce(); } catch (error) { console.error("[executor] polling error", error); }
    if (!stopping) await sleep(POLL_INTERVAL_MS);
  }
  healthServer?.stop();
  await mongoose.disconnect();
}

if (import.meta.main) void startPolling().catch((error) => {
  console.error("[executor] unable to start", error);
  process.exitCode = 1;
});
