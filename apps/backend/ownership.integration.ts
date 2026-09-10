import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { ExecutionModel, UserModel, WorkflowModel } from "db/client";
import { app } from "./index";
import { JWT_AUDIENCE, JWT_ISSUER } from "./middleware";

const integrationTest = process.env.RUN_INTEGRATION_TESTS === "1" ? test : test.skip;
const secret = process.env.JWT_SECRET ?? "integration-test-secret";
let server: ReturnType<typeof app.listen>;
let userA: mongoose.Types.ObjectId;
let userB: mongoose.Types.ObjectId;
let workflowId: mongoose.Types.ObjectId;

function token(userId: mongoose.Types.ObjectId) {
  return jwt.sign({ id: userId.toString(), tokenVersion: 0 }, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

async function request(path: string, init: RequestInit = {}) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Integration server did not bind");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token(userB)}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("workflow ownership integration", () => {
  beforeAll(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    if (!process.env.MONGO_URL) throw new Error("MONGO_URL is required for integration tests");
    await mongoose.connect(process.env.MONGO_URL);
    server = app.listen(0);
  });

  beforeEach(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    const suffix = `${Date.now()}-${Math.random()}`;
    const [a, b] = await UserModel.create([
      { username: `owner-a-${suffix}`, password: "test-password" },
      { username: `owner-b-${suffix}`, password: "test-password" },
    ]);
    if (!a || !b) throw new Error("Integration users were not created");
    userA = a._id;
    userB = b._id;
    const workflow = await WorkflowModel.create({
      userId: userA,
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } } }],
      edges: [],
    });
    workflowId = workflow._id;
    await ExecutionModel.create({ workflowId, kind: "manual", status: "success" });
  });

  afterAll(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    await ExecutionModel.deleteMany({ workflowId });
    await WorkflowModel.deleteMany({ _id: workflowId });
    await UserModel.deleteMany({ _id: { $in: [userA, userB] } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  });

  integrationTest("denies another user workflow reads, updates, runs, and history", async () => {
    const validWorkflow = {
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } } }],
      edges: [],
    };
    const workflow = await request(`/workflow/${workflowId}`);
    expect(workflow.status).toBe(404);

    const update = await request(`/workflow/${workflowId}`, { method: "PUT", body: JSON.stringify(validWorkflow) });
    expect(update.status).toBe(404);

    const execute = await request(`/workflow/${workflowId}/execute`, { method: "POST" });
    expect(execute.status).toBe(404);

    const history = await request(`/workflow/executions/${workflowId}`);
    expect(history.status).toBe(404);
  });

  integrationTest("returns 404 for malformed workflow IDs without querying another resource", async () => {
    expect((await request("/workflow/not-an-object-id" as string)).status).toBe(404);
    expect((await request("/workflow/not-an-object-id/execute", { method: "POST" })).status).toBe(404);
    expect((await request("/workflow/executions/not-an-object-id")).status).toBe(404);
  });
});
