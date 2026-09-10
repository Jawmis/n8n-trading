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
let userBWorkflowId: mongoose.Types.ObjectId;

function token(userId: mongoose.Types.ObjectId) {
  return jwt.sign({ id: userId.toString(), tokenVersion: 0, purpose: "access" }, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

async function request(path: string, init: RequestInit = {}, authenticatedUser = userB) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Integration server did not bind");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token(authenticatedUser)}`,
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
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } }, credentials: { apiKey: "legacy-inline-secret" } }],
      edges: [],
    });
    const userBWorkflow = await WorkflowModel.create({
      userId: userB,
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } } }],
      edges: [],
    });
    workflowId = workflow._id;
    userBWorkflowId = userBWorkflow._id;
    await ExecutionModel.create({ workflowId, kind: "manual", status: "success" });
  });

  afterAll(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    await ExecutionModel.deleteMany({ workflowId: { $in: [workflowId, userBWorkflowId] } });
    await WorkflowModel.deleteMany({ _id: { $in: [workflowId, userBWorkflowId] } });
    await UserModel.deleteMany({ _id: { $in: [userA, userB] } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  });

  integrationTest("denies another user workflow reads, updates, runs, and history", async () => {
    const validWorkflow = {
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } } }],
      edges: [],
    };
    const ownUpdate = await request(`/workflow/${userBWorkflowId}`, { method: "PUT", body: JSON.stringify(validWorkflow) });
    expect(ownUpdate.status).toBe(200);
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

  integrationTest("keeps credential secrets out of responses and enforces lifecycle ownership", async () => {
    const workflowResponse = await request(`/workflow/${workflowId}`, {}, userA);
    const workflowBody = await workflowResponse.text();
    expect(workflowResponse.status).toBe(200);
    expect(workflowBody).not.toContain("legacy-inline-secret");
    expect(workflowBody).not.toContain("ciphertext");

    const created = await request("/credentials", {
      method: "POST",
      body: JSON.stringify({ provider: "lighter", secret: { apiKey: "encrypted-api-key", accountIndex: 1, apiIndex: 2 } }),
    });
    const createdBody = await created.text();
    expect(created.status).toBe(201);
    expect(createdBody).not.toContain("encrypted-api-key");
    const credentialId = JSON.parse(createdBody).id as string;

    const rotated = await request(`/credentials/${credentialId}`, {
      method: "PUT",
      body: JSON.stringify({ provider: "lighter", secret: { apiKey: "rotated-api-key", accountIndex: 3, apiIndex: 4 } }),
    });
    const rotatedBody = await rotated.text();
    expect(rotated.status).toBe(200);
    expect(rotatedBody).not.toContain("rotated-api-key");

    const listed = await request("/credentials");
    const listedBody = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedBody).not.toContain("encrypted-api-key");
    expect(listedBody).not.toContain("ciphertext");

    expect((await request(`/credentials/${credentialId}/test`, { method: "POST" })).status).toBe(200);
    expect((await request(`/credentials/${credentialId}/test`, { method: "POST" }, userA)).status).toBe(404);
    expect((await request(`/credentials/${credentialId}/revoke`, { method: "POST" })).status).toBe(200);
    expect((await request(`/credentials/${credentialId}/test`, { method: "POST" })).status).toBe(409);
    expect((await request(`/credentials/${credentialId}`, { method: "DELETE" }, userA)).status).toBe(404);
    expect((await request(`/credentials/${credentialId}`, { method: "DELETE" })).status).toBe(204);
  });

  integrationTest("revokes the current token on signout", async () => {
    expect((await request("/signout", { method: "POST" })).status).toBe(204);
    const afterSignout = await request("/credentials");
    expect(afterSignout.status).toBe(401);
    const body = await afterSignout.json() as { message?: string };
    expect(body.message).toContain("revoked");
  });

  integrationTest("returns structured client errors for invalid and oversized requests", async () => {
    const invalid = await request("/workflow", { method: "POST", body: JSON.stringify({ nodes: [], edges: [] }) });
    expect(invalid.status).toBe(400);
    expect((await invalid.json() as { message?: string }).message).toBeTruthy();

    const oversized = await request("/workflow", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(1_100_000) }),
    });
    expect(oversized.status).toBe(413);
    expect((await oversized.json() as { message?: string }).message).toBe("Request body is too large");
  });

  integrationTest("rejects overlapping manual executions for one workflow", async () => {
    const [first, second] = await Promise.all([
      request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" }),
      request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await ExecutionModel.countDocuments({ workflowId: userBWorkflowId, status: "pending" })).toBe(1);
  });

  integrationTest("allows only one concurrent worker claim for a durable job", async () => {
    const job = await ExecutionModel.create({
      workflowId: userBWorkflowId,
      kind: "manual",
      status: "pending",
      queueKey: `${userBWorkflowId}:claim-test:${Date.now()}`,
    });
    const claim = () => ExecutionModel.findOneAndUpdate(
      { _id: job._id, status: "pending" },
      { $set: { status: "running", claimedAt: new Date(), leaseUntil: new Date(Date.now() + 60_000) }, $inc: { attempt: 1 } },
      { new: true },
    );
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  integrationTest("round trips the canonical workflow DTO through persistence and execution queueing", async () => {
    const payload = {
      name: "Canonical timer",
      enabled: true,
      nodes: [{ nodeId: "timer", type: "timer", id: "trigger", position: { x: 40, y: 80 }, data: { kind: "TRIGGER", metadata: { time: 90 } } }],
      edges: [],
    };
    const created = await request("/workflow", { method: "POST", body: JSON.stringify(payload) });
    expect(created.status).toBe(200);
    const createdId = (await created.json() as { id: string }).id;
    const loaded = await request(`/workflow/${createdId}`);
    const loadedBody = await loaded.json() as { name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] };
    expect(loaded.status).toBe(200);
    expect(loadedBody.name).toBe(payload.name);
    expect(loadedBody.enabled).toBe(true);
    expect(loadedBody.nodes).toEqual(payload.nodes);
    expect(loadedBody.edges).toEqual(payload.edges);
    expect((await request(`/workflow/${createdId}/execute`, { method: "POST" })).status).toBe(200);
    await ExecutionModel.deleteMany({ workflowId: createdId });
    await WorkflowModel.deleteOne({ _id: createdId });
  });
});
