import express from 'express';
import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { CredentialModel, ExecutionModel, NodesModel, UserModel, WorkflowModel } from 'db/client';
import { decryptCredential, encryptCredential } from 'db/credentials';
import jwt from "jsonwebtoken"; 
import { SignupSchema,SigninSchema, CreateWorkflowSchema, UpdateWorkflowSchema, validateWorkflowGraph } from 'common/types';
import { authMiddleware, JWT_AUDIENCE, JWT_ISSUER } from './middleware';
import cors from 'cors';
import { hashPassword, verifyPassword } from './password';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { parsePagination } from './api-validation';

const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URL = process.env.MONGO_URL;
const CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

const CredentialPayloadSchema = z.object({
    provider: z.literal("lighter"),
    secret: z.record(z.string(), z.unknown()).refine((secret) => Object.keys(secret).length > 0),
}).strict();

const app = express();

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

app.post("/signup", async (req, res) => {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
        res.status(400).json({
            message : "Incorrect Inputs"
        })
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
        res.status(409).json({
            message : "Username already exists"
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
            userId,
            nodes: data.nodes,
            edges: data.edges
        })
        res.json({
            id : workflow._id
        })
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
    const graph = validateWorkflowGraph(data);
    if (!graph.success) {
        res.status(400).json({ message: graph.message });
        return;
    }
    try {
        const workflow = await WorkflowModel.findOneAndUpdate(
            { _id: req.params.workflowId, userId: req.userId },
            data,
            { new: true }
        );
        if (!workflow) {
            res.status(404).json({
                message : "Workflow not found"
            })
            return
        }
        res.json({
            id : workflow._id
        })
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
        const stored = workflow.toObject();
        const graph = validateWorkflowGraph({
            nodes: stored.nodes.map(({ credentials: _credentials, ...node }) => node),
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
        });
        res.json({ message: "Workflow queued for execution" });
    } catch {
        res.status(500).json({ message: "Failed to queue workflow" });
    }
});

app.get("/workflows", authMiddleware, async (req, res) => {
    const workflows = await WorkflowModel.find({
        userId: req.userId
    });
    res.json(workflows.map((workflow) => {
        const value = workflow.toObject();
        return { ...value, nodes: value.nodes.map(({ credentials: _credentials, ...node }) => node) };
    }));
});

app.get("/workflow/:workflowId", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.workflowId)) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    //to : make sure the workflow belongs to the user
    const workflow = await WorkflowModel.findById(req.params.workflowId);
    if (!workflow || workflow.userId.toString() !== req.userId) {
        res.status(404).json({
            message: "Workflow not found"
        })
        return
    }
    const value = workflow.toObject();
    res.json({ ...value, nodes: value.nodes.map(({ credentials: _credentials, ...node }) => node) });
});

app.post("/credentials", authMiddleware, async (req, res) => {
    const parsed = CredentialPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid credential payload" });
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
    try {
        const encrypted = encryptCredential(parsed.data.secret);
        const credential = await CredentialModel.findOneAndUpdate(
            { _id: req.params.credentialId, userId: req.userId },
            { provider: parsed.data.provider, ...encrypted },
            { new: true },
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
    const credentials = await CredentialModel.find({ userId: req.userId }).select("provider createdAt updatedAt revokedAt").sort({ createdAt: -1 });
    res.json(credentials);
});

app.post("/credentials/:credentialId/test", authMiddleware, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.credentialId)) {
        res.status(404).json({ message: "Credential not found" });
        return;
    }
    try {
        const credential = await CredentialModel.findOne({ _id: req.params.credentialId, userId: req.userId })
            .select("+ciphertext +iv +authTag revokedAt");
        if (!credential) {
            res.status(404).json({ message: "Credential not found" });
            return;
        }
        if (credential.revokedAt) {
            res.status(409).json({ message: "Credential is revoked" });
            return;
        }
        decryptCredential(credential.toObject());
        res.json({ ok: true });
    } catch {
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
        { new: true },
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
        userId: req.userId,
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
    const [executions, total] = await Promise.all([
        ExecutionModel.find({ workflowId: workflow._id })
            .sort({ startTime: -1, _id: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        ExecutionModel.countDocuments({ workflowId: workflow._id }),
    ]);
    res.json({ items: executions, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});

app.get("/nodes", async (req, res) => {
    const nodes = await NodesModel.find();
    res.json(nodes)
})

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
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
