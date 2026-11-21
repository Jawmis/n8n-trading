import express from 'express';
import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { CredentialModel, ExecutionModel, NodesModel, RequestLimitModel, RuntimeAuditModel, RuntimeControlModel, UserModel, WorkflowAuditModel, WorkflowModel } from 'db/client';
import { decryptCredential, encryptCredential } from 'db/credentials';
import jwt from "jsonwebtoken"; 
import { SignupSchema,SigninSchema, CreateWorkflowSchema, UpdateWorkflowSchema, validateWorkflowGraph } from 'common/types';
import { authMiddleware, JWT_AUDIENCE, JWT_ISSUER } from './middleware';
import cors from 'cors';
import { hashPassword, verifyPassword } from './password';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { parsePagination } from './api-validation';
import { workflowAccess, workflowRole, workflowSnapshot } from './workflow-access';
import { createRateLimitMiddleware } from './rate-limit';

const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URL = process.env.MONGO_URL;
const CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

const CredentialPayloadSchema = z.object({
    provider: z.literal("lighter"),
    secret: z.record(z.string(), z.unknown()).refine((secret) => Object.keys(secret).length > 0),
}).strict();

async function recordWorkflowAudit(userId: string | undefined, workflowId: mongoose.Types.ObjectId | string, action: string, metadata?: Record<string, unknown>) {
    if (!userId) return;
    try {
        await WorkflowAuditModel.create({ workflowId, userId, action, metadata });
    } catch (error) {
        console.error(JSON.stringify({ event: "workflow_audit_failed", action, reason: error instanceof Error ? error.message : String(error) }));
    }
}

function lighterCredentialError(secret: Record<string, unknown>) {
    if (typeof secret.apiKey !== "string" || secret.apiKey.length === 0) return "Lighter credential requires apiKey";
    for (const field of ["accountIndex", "apiIndex"]) {
        const value = secret[field];
        if (!Number.isInteger(typeof value === "number" ? value : Number(value)) || Number(value) < 0) return `Lighter credential requires a non-negative integer ${field}`;
    }
    return null;
}

const app = express();
app.set("trust proxy", Number.isInteger(Number(process.env.TRUST_PROXY_HOPS)) && Number(process.env.TRUST_PROXY_HOPS) > 0 ? Number(process.env.TRUST_PROXY_HOPS) : false);

const metrics = {
    requests: 0,
    failures: 0,
    totalDurationMs: 0,
};

app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || randomUUID();
    const startedAt = performance.now();
    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
        const durationMs = performance.now() - startedAt;
        metrics.requests += 1;
        metrics.totalDurationMs += durationMs;
        if (res.statusCode >= 500) metrics.failures += 1;
        console.log(JSON.stringify({
            event: "http_request",
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
        }));
    });
    next();
});

app.use(express.json({ limit: "1mb" }));
app.use(createRateLimitMiddleware());

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/readyz", (_req, res) => {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({ status: "not_ready" });
        return;
    }
    res.json({ status: "ready" });
});
app.get("/metrics", (_req, res) => {
    const averageDuration = metrics.requests === 0 ? 0 : metrics.totalDurationMs / metrics.requests;
    res.type("text/plain").send([
        "# TYPE http_requests_total counter",
        `http_requests_total ${metrics.requests}`,
        "# TYPE http_request_failures_total counter",
        `http_request_failures_total ${metrics.failures}`,
        "# TYPE http_request_duration_ms_avg gauge",
        `http_request_duration_ms_avg ${averageDuration}`,
        "",
    ].join("\n"));
});
app.get("/trading/status", authMiddleware, (_req, res) => {
    const paper = process.env.TRADING_MODE !== "live";
    const baseLimitsReady = Number(process.env.MAX_ORDER_QUANTITY) > 0 && Number(process.env.MAX_ORDER_NOTIONAL) > 0;
    void RuntimeControlModel.findById("trading").select("killSwitch").lean().then((control) => {
        const killSwitch = process.env.TRADING_KILL_SWITCH === "true" || control?.killSwitch === true;
        const limitsReady = baseLimitsReady && (paper || (Number(process.env.MAX_POSITION_NOTIONAL) > 0 && Number(process.env.MAX_ORDERS_PER_MINUTE) > 0));
        res.json({ mode: paper ? "paper" : "live", priceSource: paper ? "fixed-demo-reference" : "broker", killSwitch, ready: limitsReady && !killSwitch && (paper || process.env.LIVE_TRADING_ENABLED === "true") });
    }).catch(() => res.status(503).json({ message: "Trading status is temporarily unavailable" }));
});

app.post("/operator/trading/kill-switch", async (req, res) => {
    const configuredToken = process.env.TRADING_OPERATOR_TOKEN;
    const suppliedToken = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const suppliedBytes = Buffer.from(suppliedToken);
    const configuredBytes = Buffer.from(configuredToken ?? "");
    if (!configuredToken) { res.status(503).json({ message: "Operator controls are not configured" }); return; }
    if (suppliedBytes.length !== configuredBytes.length || !timingSafeEqual(suppliedBytes, configuredBytes)) {
        res.status(401).json({ message: "Operator authentication required" });
        return;
    }
    const parsed = z.object({ enabled: z.boolean(), reason: z.string().trim().min(1).max(200) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Provide enabled and an audit reason" }); return; }
    const audit = await RuntimeAuditModel.create({ action: "kill_switch.change", operator: "operator-token", enabled: parsed.data.enabled, succeeded: false, reason: parsed.data.reason });
    const control = await RuntimeControlModel.findOneAndUpdate(
        { _id: "trading" },
        { $set: { killSwitch: parsed.data.enabled, changedBy: "operator-token", reason: parsed.data.reason } },
        { upsert: true, new: true, runValidators: true },
    );
    await RuntimeAuditModel.updateOne({ _id: audit._id }, { $set: { succeeded: true, action: parsed.data.enabled ? "kill_switch.enabled" : "kill_switch.disabled" } });
    res.json({ killSwitch: control.killSwitch, updatedAt: control.updatedAt });
});

app.post("/signup", async (req, res) => {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
        res.status(400).json({
            message : "Incorrect Inputs"
        })
        return;
    }
    const invitationCode = process.env.SIGNUP_INVITATION_CODE;
    const suppliedCode = Buffer.from(data.invitationCode);
    const configuredCode = Buffer.from(invitationCode ?? "");
    if (!invitationCode || suppliedCode.length !== configuredCode.length || !timingSafeEqual(suppliedCode, configuredCode)) {
        res.status(403).json({ message: "Signup is invite-only. Use a valid invitation code." });
        return;
    }
    try {
        const user = await UserModel.create({
            username: data.username,
            password: await hashPassword(data.password)
        }) 
        
        res.json({
            id: user._id,
        })
    } catch (e) {
        res.status(400).json({
            message : "Unable to create account with those details"
        })
    }
});

app.post("/signin", async (req, res) => {
    const { success, data } = SigninSchema.safeParse(req.body);
    if (!success) {
        res.status(400).json({
            message : "Incorrect Inputs"
        })
        return;
    }
    if (!JWT_SECRET) {
        res.status(500).json({ message: "Authentication is not configured" });
        return;
    }
    try {
        const user = await UserModel.findOne({ username: data.username }).select("+password");
        if (user && await verifyPassword(data.password, user.password)) {
            if (!user.password.startsWith("$argon2")) {
                user.password = await hashPassword(data.password);
                await user.save();
            }
            // return the user their jwt or token.
             
            const token = jwt.sign({
                id: user._id,
                tokenVersion: user.tokenVersion,
                purpose: "access",
            }, JWT_SECRET, {
                algorithm: "HS256",
                expiresIn: "1h",
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE,
            });

            res.json({
                id: user._id,
                token
            })
        } else {
          res.status(403).json({
            message : "Incorrect inputs/credentials"
        })   
      } 
    } catch (e) {
        res.status(500).json({
            message : "Failed to sign in"
        })
    } 
});

app.post("/signout", authMiddleware, async (req, res) => {
    await UserModel.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 } });
    res.status(204).send();
});

app.post("/workflow",authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { success, data } = CreateWorkflowSchema.safeParse(req.body);
    if (!success) {
        res.status(400).json({
            message : "incorrect inputs"
        })
        return
    }
    const graph = validateWorkflowGraph(data);
    if (!graph.success) {
        res.status(400).json({ message: graph.message });
        return;
    }
    try {
        const workflow = await WorkflowModel.create({
            name: data.name ?? "Untitled workflow",
            enabled: data.enabled ?? true,
            userId,
            nodes: data.nodes,
            edges: data.edges
        })
        res.json({
            id : workflow._id
        })
        await recordWorkflowAudit(userId, workflow._id, "workflow.created", { name: workflow.name });
    } catch (e) {
        res.status(500).json({
            message : "Failed to create workflow"
        })
    }
});

app.put("/workflow/:workflowId", authMiddleware,async(req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const { success, data } = UpdateWorkflowSchema.safeParse(req.body);
    if (!success) {
        res.status(400).json({
            message : "incorrect inputs"
        })
        return
    }
    const { revision, ...changes } = data;
    const graph = validateWorkflowGraph(changes);
    if (!graph.success) {
        res.status(400).json({ message: graph.message });
        return;
    }
    try {
        const existing = await WorkflowModel.findOne({ _id: req.params.workflowId, ...workflowAccess(req.userId, true) });
        if (!existing) { res.status(404).json({ message: "Workflow not found" }); return; }
        if (changes.enabled !== undefined && changes.enabled !== existing.enabled && workflowRole(existing, req.userId) !== "owner") {
            res.status(403).json({ message: "Only the owner can enable or pause a workflow" }); return;
        }
        const workflow = await WorkflowModel.findOneAndUpdate(
            { _id: existing._id, revision, ...workflowAccess(req.userId, true) },
            { $set: { ...changes, state: "draft" }, $inc: { revision: 1 } },
            { returnDocument: "after" }
        );
        if (!workflow) {
            res.status(409).json({
                message : "Workflow changed since it was loaded. Reload before saving."
            })
            return
        }
        res.json({
            id : workflow._id, revision: workflow.revision, state: workflow.state
        })
        await recordWorkflowAudit(req.userId, workflow._id, "workflow.updated", { enabled: workflow.enabled });
    } catch (e) {
        res.status(500).json({
            message : "Failed to update workflow"
        })
    }

});

app.post("/workflow/:workflowId/execute", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    try {
        const workflow = await WorkflowModel.findById(req.params.workflowId);
        if (!workflow || workflow.userId.toString() !== req.userId) {
            res.status(404).json({ message: "Workflow not found" });
            return;
        }
        if (workflow.enabled === false) {
            res.status(409).json({ message: "Workflow is disabled" });
            return;
        }
        if (!workflow.published) { res.status(409).json({ message: "Publish a workflow version before running" }); return; }
        const stored = workflow.published;
        const graph = validateWorkflowGraph({
            nodes: stored.nodes,
            edges: stored.edges,
        });
        if (!graph.success) {
            res.status(400).json({ message: graph.message });
            return;
        }
        await ExecutionModel.create({
            workflowId: workflow._id,
            kind: "manual",
            status: "pending",
            queueKey: `${workflow._id}:manual`,
            activeKey: workflow._id.toString(),
            snapshot: stored,
            workflowRevision: stored.revision,
        });
        await recordWorkflowAudit(req.userId, workflow._id, "execution.queued", { kind: "manual" });
        res.json({ message: "Workflow queued for execution" });
    } catch (error) {
        if ((error as { code?: number })?.code === 11000) {
            res.status(409).json({ message: "Workflow already has an active execution" });
            return;
        }
        res.status(500).json({ message: "Failed to queue workflow" });
    }
});

app.get("/workflows", authMiddleware, async (req, res) => {
    const page = parsePagination(typeof req.query.page === "string" ? req.query.page : undefined, typeof req.query.pageSize === "string" ? req.query.pageSize : undefined);
    if (!page) { res.status(400).json({ message: "Invalid pagination parameters" }); return; }
    const filter = workflowAccess(req.userId);
    const [workflows, total] = await Promise.all([
        WorkflowModel.find(filter).sort({ _id: 1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize),
        WorkflowModel.countDocuments(filter),
    ]);
    res.json({ items: workflows.map((workflow) => {
        const value = workflow.toObject();
        return { ...value, role: workflowRole(workflow, req.userId), nodes: value.nodes.map(({ credentials: _credentials, ...node }) => node) };
    }), page: page.page, pageSize: page.pageSize, total, totalPages: Math.ceil(total / page.pageSize) });
});

app.get("/workflow/:workflowId", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    //to : make sure the workflow belongs to the user
    const workflow = await WorkflowModel.findOne({ _id: req.params.workflowId, ...workflowAccess(req.userId) });
    if (!workflow) {
        res.status(404).json({
            message: "Workflow not found"
        })
        return
    }
    const value = workflow.toObject();
    res.json({ ...value, role: workflowRole(workflow, req.userId), nodes: value.nodes.map(({ credentials: _credentials, ...node }) => node) });
});

app.post("/workflow/:workflowId/publish", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) { res.status(404).json({ message: "Workflow not found" }); return; }
    const workflow = await WorkflowModel.findOne({ _id: req.params.workflowId, userId: req.userId });
    if (!workflow) { res.status(404).json({ message: "Workflow not found" }); return; }
    if (req.body.revision !== workflow.revision) { res.status(409).json({ message: "Workflow changed. Reload before publishing." }); return; }
    const stored = workflow.toObject();
    const graph = validateWorkflowGraph({
        nodes: stored.nodes.map(({ credentials: _credentials, credentialId, ...node }) => ({ ...node, ...(credentialId ? { credentialId: credentialId.toString() } : {}) })),
        edges: stored.edges,
    });
    if (!graph.success) { res.status(400).json({ message: graph.message }); return; }
    if (graph.data.nodes.some((node) => node.type === "price-trigger")) { res.status(409).json({ message: "Price triggers require a production market-data feed and are not available in this release" }); return; }
    for (const node of process.env.TRADING_MODE === "live" ? graph.data.nodes.filter((node) => node.data.kind === "ACTION") : []) {
        if (!node.credentialId || !mongoose.isValidObjectId(node.credentialId) || !await CredentialModel.exists({ _id: node.credentialId, userId: req.userId, revokedAt: null })) {
            res.status(400).json({ message: `Choose an active owner credential for node ${node.id}` }); return;
        }
    }
    const published = workflowSnapshot({ ...workflow.toObject(), nodes: graph.data.nodes, edges: graph.data.edges });
    const updated = await WorkflowModel.findOneAndUpdate({ _id: workflow._id, userId: req.userId, revision: workflow.revision }, { $set: { published, state: "published", priceState: {} }, $inc: { revision: 1 } }, { returnDocument: "after" });
    if (!updated) { res.status(409).json({ message: "Workflow changed. Reload before publishing." }); return; }
    await recordWorkflowAudit(req.userId, workflow._id, "workflow.published", { revision: published.revision });
    res.json({ id: updated._id, revision: updated.revision, state: updated.state, published });
});

app.put("/workflow/:workflowId/enabled", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) { res.status(404).json({ message: "Workflow not found" }); return; }
    const parsed = z.object({ revision: z.number().int().nonnegative(), enabled: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Invalid workflow status" }); return; }
    const existing = await WorkflowModel.findOne({ _id: req.params.workflowId, userId: req.userId });
    if (!existing) { res.status(404).json({ message: "Workflow not found" }); return; }
    if (parsed.data.enabled && !existing.published) { res.status(409).json({ message: "Publish a version before enabling" }); return; }
    const workflow = await WorkflowModel.findOneAndUpdate({ _id: existing._id, userId: req.userId, revision: parsed.data.revision }, { $set: { enabled: parsed.data.enabled }, $inc: { revision: 1 } }, { returnDocument: "after" });
    if (!workflow) { res.status(409).json({ message: "Workflow changed. Reload before changing status." }); return; }
    await recordWorkflowAudit(req.userId, workflow._id, workflow.enabled ? "workflow.enabled" : "workflow.paused");
    res.json({ revision: workflow.revision, enabled: workflow.enabled });
});

app.put("/workflow/:workflowId/members", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) { res.status(404).json({ message: "Workflow not found" }); return; }
    const parsed = z.object({ username: z.string().min(3).max(50), role: z.enum(["editor", "viewer", "remove"]) }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Invalid member" }); return; }
    const workflow = await WorkflowModel.findOne({ _id: req.params.workflowId, userId: req.userId });
    if (!workflow) { res.status(404).json({ message: "Workflow not found" }); return; }
    const user = await UserModel.findOne({ username: parsed.data.username });
    if (!user || user._id.toString() === req.userId) { res.status(400).json({ message: "Choose another existing user" }); return; }
    const members = workflow.members.filter((member) => member.userId.toString() !== user._id.toString()).map((member) => ({ userId: member.userId, role: member.role }));
    if (parsed.data.role !== "remove") members.push({ userId: user._id, role: parsed.data.role });
    const updated = await WorkflowModel.findOneAndUpdate({ _id: workflow._id, userId: req.userId, revision: workflow.revision }, { $set: { members }, $inc: { revision: 1 } }, { returnDocument: "after" });
    if (!updated) { res.status(409).json({ message: "Workflow changed. Retry sharing." }); return; }
    await recordWorkflowAudit(req.userId, workflow._id, "workflow.sharing_changed", { memberId: user._id.toString(), role: parsed.data.role });
    res.json({ revision: updated.revision, members: updated.members });
});

app.post("/workflow/:workflowId/duplicate", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const source = await WorkflowModel.findOne({ _id: req.params.workflowId, userId: req.userId });
    if (!source) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const value = source.toObject();
    const duplicate = await WorkflowModel.create({
        userId: req.userId,
        name: `${value.name} copy`.slice(0, 100),
        enabled: false,
        nodes: value.nodes,
        edges: value.edges,
        priceState: {},
    });
    await recordWorkflowAudit(req.userId, duplicate._id, "workflow.duplicated", { sourceWorkflowId: source._id.toString() });
    res.status(201).json({ id: duplicate._id });
});

app.delete("/workflow/:workflowId", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const ownedWorkflow = await WorkflowModel.exists({ _id: req.params.workflowId, userId: req.userId });
    if (!ownedWorkflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    if (await ExecutionModel.exists({ workflowId: req.params.workflowId, activeKey: { $type: "string" } })) {
        res.status(409).json({ message: "Resolve or stop the active execution before deleting this workflow" });
        return;
    }
    const deleted = await WorkflowModel.findOneAndDelete({ _id: req.params.workflowId, userId: req.userId });
    if (!deleted) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    await recordWorkflowAudit(req.userId, deleted._id, "workflow.deleted", { name: deleted.name });
    await ExecutionModel.updateMany({ workflowId: deleted._id, status: { $in: ["pending", "running"] } }, { $set: { status: "cancelled", endTime: new Date(), error: "Workflow deleted" }, $unset: { queueKey: 1, activeKey: 1 } });
    res.status(204).send();
});

app.post("/credentials", authMiddleware, async (req, res) => {
    const parsed = CredentialPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid credential payload" });
        return;
    }
    const validationError = lighterCredentialError(parsed.data.secret);
    if (validationError) {
        res.status(400).json({ message: validationError });
        return;
    }
    try {
        const encrypted = encryptCredential(parsed.data.secret);
        const credential = await CredentialModel.create({ userId: req.userId, provider: parsed.data.provider, ...encrypted });
        res.status(201).json({ id: credential._id, provider: credential.provider });
    } catch {
        res.status(500).json({ message: "Failed to store credential" });
    }
});

app.put("/credentials/:credentialId", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.credentialId)) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    const parsed = CredentialPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid credential payload" });
        return;
    }
    const validationError = lighterCredentialError(parsed.data.secret);
    if (validationError) {
        res.status(400).json({ message: validationError });
        return;
    }
    try {
        const encrypted = encryptCredential(parsed.data.secret);
        const credential = await CredentialModel.findOneAndUpdate(
            { _id: req.params.credentialId, userId: req.userId },
            { provider: parsed.data.provider, ...encrypted },
            { returnDocument: "after" },
        );
        if (!credential) {
            res.status(404).json({ message: "Credential not found" });
            return;
        }
        res.json({ id: credential._id, provider: credential.provider });
    } catch {
        res.status(500).json({ message: "Failed to rotate credential" });
    }
});

app.get("/credentials", authMiddleware, async (req, res) => {
    const page = parsePagination(typeof req.query.page === "string" ? req.query.page : undefined, typeof req.query.pageSize === "string" ? req.query.pageSize : undefined);
    if (!page) { res.status(400).json({ message: "Invalid pagination parameters" }); return; }
    const filter = { userId: req.userId };
    const [credentials, total] = await Promise.all([
        CredentialModel.find(filter).select("provider createdAt updatedAt revokedAt").sort({ createdAt: -1, _id: 1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize),
        CredentialModel.countDocuments(filter),
    ]);
    res.json({ items: credentials, page: page.page, pageSize: page.pageSize, total, totalPages: Math.ceil(total / page.pageSize) });
});

app.post("/credentials/:credentialId/test", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.credentialId)) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    try {
        const credential = await CredentialModel.findOne({ _id: req.params.credentialId, userId: req.userId })
            .select("ciphertext iv authTag revokedAt");
        if (!credential) {
            res.status(404).json({ message: "Credential not found" });
            return;
        }
        if (credential.revokedAt) {
            res.status(409).json({ message: "Credential is revoked" });
            return;
        }
        const secret = decryptCredential({
            ciphertext: credential.ciphertext,
            iv: credential.iv,
            authTag: credential.authTag,
        });
        const validationError = lighterCredentialError(secret);
        if (validationError) {
            res.status(422).json({ ok: false, message: validationError });
            return;
        }
        res.json({ ok: true });
    } catch (error) {
        console.error(JSON.stringify({ event: "credential_test_failed", credentialId: req.params.credentialId, reason: error instanceof Error ? error.message : String(error) }));
        res.status(422).json({ ok: false, message: "Credential could not be decrypted" });
    }
});

app.post("/credentials/:credentialId/revoke", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.credentialId)) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    const credential = await CredentialModel.findOneAndUpdate(
        { _id: req.params.credentialId, userId: req.userId },
        { $set: { revokedAt: new Date() } },
        { returnDocument: "after" },
    ).select("_id revokedAt");
    if (!credential) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    res.json({ id: credential._id, revokedAt: credential.revokedAt });
});

app.delete("/credentials/:credentialId", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.credentialId)) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    const credential = await CredentialModel.findOneAndDelete({ _id: req.params.credentialId, userId: req.userId });
    if (!credential) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    res.status(204).send();
});

app.get("/workflow/executions/:workflowId",authMiddleware, async(req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const workflow = await WorkflowModel.findOne({
        _id: req.params.workflowId,
        ...workflowAccess(req.userId),
    });
    if (!workflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const pagination = parsePagination(req.query.page, req.query.pageSize);
    if (!pagination) {
        res.status(400).json({ message: "Invalid pagination parameters" });
        return;
    }
    const { page, pageSize } = pagination;
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const statuses = ["pending", "running", "success", "failure", "cancelled"] as const;
    if (requestedStatus && !statuses.includes(requestedStatus as typeof statuses[number])) {
        res.status(400).json({ message: "Invalid execution status" });
        return;
    }
    const executionFilter: { workflowId: mongoose.Types.ObjectId; status?: typeof statuses[number] } = {
        workflowId: workflow._id,
        ...(requestedStatus ? { status: requestedStatus as typeof statuses[number] } : {}),
    };
    const [executions, total] = await Promise.all([
        ExecutionModel.find(executionFilter)
            .sort({ startTime: -1, _id: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        ExecutionModel.countDocuments(executionFilter),
    ]);
    res.json({ items: executions, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});

app.get("/workflow/:workflowId/audit", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const owned = await WorkflowModel.exists({ _id: req.params.workflowId, ...workflowAccess(req.userId) });
    if (!owned) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const events = await WorkflowAuditModel.find({ workflowId: req.params.workflowId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json(events);
});

app.post("/workflow/executions/:executionId/cancel", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.executionId)) {
        res.status(404).json({ message: "Execution not found" });
        return;
    }
    const execution = await ExecutionModel.findById(req.params.executionId);
    if (!execution || !(await WorkflowModel.exists({ _id: execution.workflowId, userId: req.userId }))) {
        res.status(404).json({ message: "Execution not found" });
        return;
    }
    const pending = await ExecutionModel.findOneAndUpdate(
        { _id: execution._id, status: "pending" },
        { $set: { status: "cancelled", endTime: new Date(), error: "Cancelled before execution started", leaseUntil: null }, $unset: { queueKey: 1, activeKey: 1 } },
        { returnDocument: "after" },
    );
    if (pending) {
        await recordWorkflowAudit(req.userId, execution.workflowId, "execution.cancelled", { executionId: execution._id.toString(), phase: "pending" });
        res.json({ id: pending._id, status: pending.status });
        return;
    }
    const running = await ExecutionModel.findOneAndUpdate(
        { _id: execution._id, status: "running" },
        { $set: { cancelRequestedAt: new Date() } },
        { returnDocument: "after" },
    );
    if (!running) {
        res.status(409).json({ message: "Execution is already complete" });
        return;
    }
    await recordWorkflowAudit(req.userId, execution.workflowId, "execution.cancel_requested", { executionId: execution._id.toString(), phase: "running" });
    res.json({ id: running._id, status: running.status, cancellationRequested: true });
});

app.post("/workflow/executions/:executionId/retry", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.executionId)) {
        res.status(404).json({ message: "Execution not found" });
        return;
    }
    const execution = await ExecutionModel.findById(req.params.executionId);
    if (!execution || !(await WorkflowModel.exists({ _id: execution.workflowId, userId: req.userId }))) {
        res.status(404).json({ message: "Execution not found" });
        return;
    }
    if (execution.status !== "failure") {
        res.status(409).json({ message: "Only failed executions can be retried" });
        return;
    }
    if (Array.isArray(execution.results) && execution.results.some((result) => result && typeof result === "object" && ["submitting", "uncertain"].includes(String((result as { status?: unknown }).status)))) {
        res.status(409).json({ message: "Execution has an uncertain broker order outcome; reconcile it before retrying" });
        return;
    }
    const workflow = await WorkflowModel.findOne({ _id: execution.workflowId, userId: req.userId, enabled: true });
    if (!workflow || !execution.snapshot) { res.status(409).json({ message: "Retry requires an enabled workflow and a saved execution version" }); return; }
    if (process.env.TRADING_MODE === "live") { res.status(409).json({ message: "Automatic retry is unavailable for live trading until broker orders are reconciled" }); return; }
    const retry = await ExecutionModel.create({ workflowId: execution.workflowId, kind: execution.kind, status: "pending", queueKey: `${execution.workflowId}:manual`, activeKey: execution.workflowId.toString(), snapshot: execution.snapshot, workflowRevision: execution.workflowRevision });
    await recordWorkflowAudit(req.userId, execution.workflowId, "execution.retried", { executionId: execution._id.toString(), retryId: retry._id.toString() });
    res.status(202).json({ id: retry._id, status: retry.status });
});

app.post("/workflow/executions/:executionId/reconcile", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.executionId)) { res.status(404).json({ message: "Execution not found" }); return; }
    const parsed = z.object({
        clientOrderIndex: z.number().int().positive().safe(),
        outcome: z.enum(["accepted", "rejected", "not_found"]),
        note: z.string().trim().max(500).optional(),
    }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Provide the verified broker outcome and client order index" }); return; }
    const execution = await ExecutionModel.findById(req.params.executionId);
    if (!execution || !(await WorkflowModel.exists({ _id: execution.workflowId, userId: req.userId }))) {
        res.status(404).json({ message: "Execution not found" });
        return;
    }
    if (!["failure", "cancelled"].includes(execution.status ?? "")) {
        res.status(409).json({ message: "Only a stopped execution can be reconciled" });
        return;
    }
    const orderResult = Array.isArray(execution.results)
        ? execution.results.find((result) => result && typeof result === "object" && (result as { clientOrderIndex?: unknown }).clientOrderIndex === parsed.data.clientOrderIndex && ["submitting", "uncertain"].includes(String((result as { status?: unknown }).status))) as Record<string, unknown> | undefined
        : undefined;
    if (!orderResult) { res.status(409).json({ message: "No unresolved order intent has that client order index" }); return; }
    const reconciliation = { outcome: parsed.data.outcome, note: parsed.data.note, by: req.userId, at: new Date() };
    const results = (execution.results as Array<Record<string, unknown>>).map((result) => result.clientOrderIndex === parsed.data.clientOrderIndex
        ? { ...result, status: "reconciled", error: "", reconciliation }
        : result);
    const updated = await ExecutionModel.findOneAndUpdate(
        { _id: execution._id, status: execution.status, results: { $elemMatch: { clientOrderIndex: parsed.data.clientOrderIndex, status: { $in: ["submitting", "uncertain"] } } } },
        { $set: { results }, $unset: { activeKey: 1, queueKey: 1, leaseUntil: 1 } },
        { returnDocument: "after" },
    );
    if (!updated) { res.status(409).json({ message: "Order was reconciled by another request; refresh and try again" }); return; }
    await recordWorkflowAudit(req.userId, execution.workflowId, "execution.reconciled", { executionId: execution._id.toString(), clientOrderIndex: parsed.data.clientOrderIndex, outcome: parsed.data.outcome });
    res.json({ id: updated._id, status: updated.status, reconciled: true });
});

app.get("/nodes", async (req, res) => {
    const nodes = await NodesModel.find();
    res.json(nodes)
})

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.code === 11000) { res.status(409).json({ message: "An active execution or resource already exists" }); return; }
    if (error?.type === "entity.too.large") {
        res.status(413).json({ message: "Request body is too large" });
        return;
    }
    if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ message: "Malformed JSON body" });
        return;
    }
    res.status(500).json({ message: "Internal server error" });
};
app.use(errorHandler);

let server: ReturnType<typeof app.listen> | undefined;
export async function startServer() {
    if (!MONGO_URL || !JWT_SECRET || !CREDENTIAL_ENCRYPTION_KEY) {
        throw new Error("MONGO_URL, JWT_SECRET, and CREDENTIAL_ENCRYPTION_KEY are required");
    }
    await mongoose.connect(MONGO_URL);
    await Promise.all([RequestLimitModel.init(), RuntimeControlModel.init(), RuntimeAuditModel.init()]);
    server = app.listen(process.env.PORT || 3000);
    return server;
}

async function shutdown() {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await mongoose.disconnect();
}

export { app };

if (import.meta.main) {
    void startServer().catch((error) => {
        console.error("[backend] unable to start", error);
        process.exitCode = 1;
    });
    process.once("SIGTERM", () => void shutdown());
    process.once("SIGINT", () => void shutdown());
}
