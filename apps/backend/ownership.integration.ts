import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { ExecutionModel, RequestLimitModel, RuntimeAuditModel, RuntimeControlModel, UserModel, WorkflowModel, WorkflowAuditModel } from "db/client";
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
    await Promise.all([ExecutionModel.init(), RequestLimitModel.init(), UserModel.init()]);
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
    await request(`/workflow/${userBWorkflowId}/publish`, { method: "POST", body: JSON.stringify({ revision: 0 }) });
    await ExecutionModel.create({ workflowId, kind: "manual", status: "success" });
  });

  afterEach(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    await ExecutionModel.deleteMany({ workflowId: { $in: [workflowId, userBWorkflowId] } });
    await WorkflowModel.deleteMany({ _id: { $in: [workflowId, userBWorkflowId] } });
    await UserModel.deleteMany({ _id: { $in: [userA, userB] } });
    await WorkflowAuditModel.deleteMany({ userId: { $in: [userA, userB] } });
  });

  afterAll(async () => {
    if (process.env.RUN_INTEGRATION_TESTS !== "1") return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  });

  integrationTest("denies another user workflow reads, updates, runs, and history", async () => {
    const validWorkflow = {
      revision: 1,
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

  integrationTest("requires the owner to reconcile an uncertain broker order before releasing its workflow lock", async () => {
    const clientOrderIndex = 1234567890123;
    const execution = await ExecutionModel.create({
      workflowId,
      kind: "manual",
      status: "failure",
      activeKey: workflowId.toString(),
      queueKey: `${workflowId}:manual`,
      results: [{ nodeId: "trade", clientOrderIndex, status: "uncertain", error: "Broker outcome is uncertain" }],
    });
    const path = `/workflow/executions/${execution._id}/reconcile`;
    const body = JSON.stringify({ clientOrderIndex, outcome: "accepted", note: "Verified in broker order history" });
    expect((await request(path, { method: "POST", body }, userB)).status).toBe(404);
    const reconciled = await request(path, { method: "POST", body }, userA);
    expect(reconciled.status).toBe(200);
    const stored = await ExecutionModel.findById(execution._id).lean();
    expect(stored?.activeKey).toBeUndefined();
    expect(stored?.queueKey).toBeUndefined();
    expect((stored?.results as Array<{ status?: string; reconciliation?: { outcome?: string } }>)[0]).toMatchObject({ status: "reconciled", reconciliation: { outcome: "accepted" } });
    expect((await request(path, { method: "POST", body }, userA)).status).toBe(409);
  });

  integrationTest("requests cancellation of running work without releasing its overlap lock", async () => {
    const execution = await ExecutionModel.create({ workflowId, kind: "manual", status: "running", attempt: 1, activeKey: workflowId.toString(), queueKey: `${workflowId}:manual` });
    const response = await request(`/workflow/executions/${execution._id}/cancel`, { method: "POST" }, userA);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "running", cancellationRequested: true });
    const stored = await ExecutionModel.findById(execution._id).lean();
    expect(stored?.cancelRequestedAt).toBeInstanceOf(Date);
    expect(stored?.activeKey).toBe(workflowId.toString());
  });

  integrationTest("returns 404 for malformed workflow IDs without querying another resource", async () => {
    expect((await request("/workflow/not-an-object-id" as string)).status).toBe(404);
    expect((await request("/workflow/not-an-object-id/execute", { method: "POST" })).status).toBe(404);
    expect((await request("/workflow/executions/not-an-object-id")).status).toBe(404);
  });

  integrationTest("requires a valid pilot invitation and bounds workflow and credential listings", async () => {
    const previousInvitation = process.env.SIGNUP_INVITATION_CODE;
    process.env.SIGNUP_INVITATION_CODE = "integration-pilot-code";
    const username = `invite-${Date.now()}-${Math.random()}`;
    const denied = await request("/signup", { method: "POST", body: JSON.stringify({ username, password: "strong-test-password", invitationCode: "wrong" }) });
    expect(denied.status).toBe(403);
    const accepted = await request("/signup", { method: "POST", body: JSON.stringify({ username, password: "strong-test-password", invitationCode: "integration-pilot-code" }) });
    expect(accepted.status).toBe(200);
    const invited = await UserModel.findOne({ username });
    expect(invited).toBeTruthy();
    if (invited) await UserModel.deleteOne({ _id: invited._id });
    if (previousInvitation === undefined) delete process.env.SIGNUP_INVITATION_CODE;
    else process.env.SIGNUP_INVITATION_CODE = previousInvitation;

    const workflows = await request("/workflows?page=1&pageSize=1", {}, userB);
    expect(workflows.status).toBe(200);
    expect(await workflows.json()).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1, items: expect.any(Array) });
    const cappedPage = await request("/credentials?page=1&pageSize=101", {}, userB);
    expect(cappedPage.status).toBe(200);
    expect(await cappedPage.json()).toMatchObject({ page: 1, pageSize: 100, items: expect.any(Array) });
    const credentials = await request("/credentials?page=1&pageSize=25", {}, userB);
    expect(credentials.status).toBe(200);
    expect(await credentials.json()).toMatchObject({ page: 1, pageSize: 25, items: expect.any(Array) });
  });

  integrationTest("operator emergency stop is authorized, shared, and audited", async () => {
    const previous = process.env.TRADING_OPERATOR_TOKEN;
    process.env.TRADING_OPERATOR_TOKEN = "integration-operator-token";
    try {
      const path = "/operator/trading/kill-switch";
      const body = JSON.stringify({ enabled: true, reason: "Integration test stop" });
      expect((await request(path, { method: "POST", body, headers: { authorization: "Bearer wrong" } }, userA)).status).toBe(401);
      const enabled = await request(path, { method: "POST", body, headers: { authorization: "Bearer integration-operator-token" } }, userA);
      expect(enabled.status).toBe(200);
      expect((await RuntimeControlModel.findById("trading").lean())?.killSwitch).toBe(true);
      expect(await RuntimeAuditModel.countDocuments({ action: "kill_switch.enabled", succeeded: true })).toBeGreaterThan(0);
      const status = await request("/trading/status", {}, userA);
      expect(await status.json()).toMatchObject({ killSwitch: true, ready: false });
      const disabled = await request(path, { method: "POST", body: JSON.stringify({ enabled: false, reason: "Integration test recovery" }), headers: { authorization: "Bearer integration-operator-token" } }, userA);
      expect(disabled.status).toBe(200);
      expect((await RuntimeControlModel.findById("trading").lean())?.killSwitch).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.TRADING_OPERATOR_TOKEN;
      else process.env.TRADING_OPERATOR_TOKEN = previous;
      await RuntimeControlModel.deleteOne({ _id: "trading" });
      await RuntimeAuditModel.deleteMany({ reason: { $in: ["Integration test stop", "Integration test recovery"] } });
    }
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
    const editor = await request(`/workflow/${userBWorkflowId}`);
    const saved = await editor.json() as { revision: number; nodes: Array<{ id: string }>; edges: unknown[] };
    const action = { id: "trade", nodeId: "lighter", type: "lighter", position: { x: 200, y: 0 }, credentialId, data: { kind: "ACTION", metadata: { type: "LONG", symbol: "BTC", qty: 1 } } };
    expect((await request(`/workflow/${userBWorkflowId}`, { method: "PUT", body: JSON.stringify({ revision: saved.revision, nodes: [...saved.nodes, action], edges: [{ id: "trigger-trade", source: saved.nodes[0]!.id, target: "trade" }] }) })).status).toBe(200);
    expect((await request(`/workflow/${userBWorkflowId}/publish`, { method: "POST", body: JSON.stringify({ revision: saved.revision + 1 }) })).status).toBe(200);

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

  integrationTest("rejects a manual run while a scheduled run owns the workflow", async () => {
    const scheduled = await ExecutionModel.create({ workflowId: userBWorkflowId, kind: "timer", status: "pending", activeKey: userBWorkflowId.toString(), queueKey: `${userBWorkflowId}:timer:test` });
    expect((await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" })).status).toBe(409);
    await ExecutionModel.updateOne({ _id: scheduled._id }, { $set: { status: "success" }, $unset: { activeKey: 1, queueKey: 1 } });
    expect((await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" })).status).toBe(200);
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
    expect((await request(`/workflow/${createdId}/publish`, { method: "POST", body: JSON.stringify({ revision: 0 }) })).status).toBe(200);
    expect((await request(`/workflow/${createdId}/execute`, { method: "POST" })).status).toBe(200);
    await ExecutionModel.deleteMany({ workflowId: createdId });
    await WorkflowModel.deleteOne({ _id: createdId });
  });

  integrationTest("rejects stale saves and keeps queued execution versions immutable", async () => {
    expect((await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" })).status).toBe(200);
    const before = await WorkflowModel.findById(userBWorkflowId).lean();
    const payload = { revision: 1, name: "Edited draft", nodes: before!.nodes, edges: before!.edges };
    expect((await request(`/workflow/${userBWorkflowId}`, { method: "PUT", body: JSON.stringify(payload) })).status).toBe(200);
    expect((await request(`/workflow/${userBWorkflowId}`, { method: "PUT", body: JSON.stringify(payload) })).status).toBe(409);
    const job = await ExecutionModel.findOne({ workflowId: userBWorkflowId, status: "pending" }).lean();
    expect(job!.snapshot.revision).toBe(0);
    expect(job!.snapshot.nodes).toEqual(before!.published.nodes);
    expect((await WorkflowModel.findById(userBWorkflowId))!.state).toBe("draft");
  });

  integrationTest("enforces viewer, editor, and owner permissions", async () => {
    const user = await UserModel.findById(userA);
    const share = (role: string) => request(`/workflow/${userBWorkflowId}/members`, { method: "PUT", body: JSON.stringify({ username: user!.username, role }) });
    expect((await share("viewer")).status).toBe(200);
    const read = await request(`/workflow/${userBWorkflowId}`, {}, userA);
    const value = await read.json() as { role: string; revision: number; nodes: unknown[]; edges: unknown[] };
    expect(value.role).toBe("viewer");
    const update = () => request(`/workflow/${userBWorkflowId}`, { method: "PUT", body: JSON.stringify({ revision: value.revision, nodes: value.nodes, edges: value.edges, name: "Shared draft" }) }, userA);
    expect((await update()).status).toBe(404);
    expect((await share("editor")).status).toBe(200);
    value.revision += 1;
    expect((await update()).status).toBe(200);
    expect((await request(`/workflow/${userBWorkflowId}/publish`, { method: "POST", body: JSON.stringify({ revision: value.revision + 1 }) }, userA)).status).toBe(404);
    expect((await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" }, userA)).status).toBe(404);
    expect((await request(`/workflow/${userBWorkflowId}`, { method: "DELETE" }, userA)).status).toBe(404);
    expect((await share("remove")).status).toBe(200);
    expect((await request(`/workflow/${userBWorkflowId}`, {}, userA)).status).toBe(404);
  });

  integrationTest("cancels queued jobs and blocks runs of paused workflows", async () => {
    await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" });
    const job = await ExecutionModel.findOne({ workflowId: userBWorkflowId, status: "pending" });
    expect((await request(`/workflow/executions/${job!._id}/cancel`, { method: "POST" })).status).toBe(200);
    expect((await ExecutionModel.findById(job!._id))!.status).toBe("cancelled");
    expect((await request(`/workflow/${userBWorkflowId}/enabled`, { method: "PUT", body: JSON.stringify({ revision: 1, enabled: false }) })).status).toBe(200);
    expect((await request(`/workflow/${userBWorkflowId}/execute`, { method: "POST" })).status).toBe(409);
    expect((await WorkflowAuditModel.find({ workflowId: userBWorkflowId })).map((event) => event.action)).toContain("execution.cancelled");
  });
});
