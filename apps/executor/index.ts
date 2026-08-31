import mongoose from "mongoose";
import { ExecutionModel, WorkflowModel } from "db/client";
import { executeWorkflow, type WorkflowLike } from "./execute";

export const POLL_INTERVAL_MS = 2_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTimerTrigger(node: WorkflowLike["nodes"][number]) {
  return String(node.data?.kind).toLowerCase() === "trigger" &&
    (node.type === "timer" || node.data?.metadata?.time !== undefined);
}

export function timerIsDue(lastExecution: { startTime?: Date | string } | null, seconds: unknown, now = Date.now()) {
  const interval = Number(seconds);
  if (!Number.isFinite(interval) || interval < 0) return false;
  if (!lastExecution?.startTime) return true;
  return now - new Date(lastExecution.startTime).getTime() >= interval * 1_000;
}

export async function pollOnce(now = Date.now()): Promise<number> {
  const workflows = await WorkflowModel.find();
  let started = 0;
  for (const workflow of workflows as unknown as WorkflowLike[]) {
    const manualRun = Boolean(workflow.runRequestedAt);
    const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
    if (!trigger) continue;
    if (!manualRun && !isTimerTrigger(trigger)) continue;
    if (!manualRun) {
      const lastExecution = await ExecutionModel.findOne({ workflowId: workflow._id }).sort({ startTime: -1 });
      if (!timerIsDue(lastExecution, trigger.data?.metadata?.time, now)) continue;
    } else {
      const claimed = await WorkflowModel.updateOne({ _id: workflow._id, runRequestedAt: { $exists: true } }, { $unset: { runRequestedAt: 1 } });
      if (!claimed.modifiedCount) continue;
    }
    started += 1;
    void executeWorkflow(workflow).catch((error) => console.error(`[executor] workflow ${workflow._id} failed`, error));
  }
  return started;
}

export async function startPolling() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error("MONGO_URL is required");
  await mongoose.connect(mongoUrl);
  console.log("[executor] connected to MongoDB");
  while (true) {
    try { await pollOnce(); } catch (error) { console.error("[executor] polling error", error); }
    await sleep(POLL_INTERVAL_MS);
  }
}

if (import.meta.main) void startPolling().catch((error) => {
  console.error("[executor] unable to start", error);
  process.exitCode = 1;
});
