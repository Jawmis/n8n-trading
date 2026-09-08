import express from 'express';
import mongoose from 'mongoose';
import { CredentialModel, ExecutionModel, NodesModel, UserModel, WorkflowModel } from 'db/client';
import { encryptCredential } from 'db/credentials';
import jwt from "jsonwebtoken"; 
import { SignupSchema,SigninSchema, CreateWorkflowSchema, UpdateWorkflowSchema, validateWorkflowGraph } from 'common/types';
import { authMiddleware, JWT_AUDIENCE, JWT_ISSUER } from './middleware';
import cors from 'cors';
import { hashPassword, verifyPassword } from './password';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URL = process.env.MONGO_URL;
const CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
if (!MONGO_URL || !JWT_SECRET || !CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error("MONGO_URL, JWT_SECRET, and CREDENTIAL_ENCRYPTION_KEY are required");
}

void mongoose.connect(MONGO_URL);

const app = express();

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

app.post("/signup", async (req, res) => {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
        res.status(403).json({
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
        res.status(411).json({
            message : "Username already exists"
        })
    }
});

app.post("/signin", async (req, res) => {
    const { success, data } = SigninSchema.safeParse(req.body);
    if (!success) {
        res.status(403).json({
            message : "Incorrect Inputs"
        })
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
                id: user._id
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
        res.status(411).json({
            message : "Username already exists"
        })
    } 
});

app.post("/workflow",authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { success, data } = CreateWorkflowSchema.safeParse(req.body);
    if (!success) {
        res.status(403).json({
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
        res.status(411).json({
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
        res.status(403).json({
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
        res.status(411).json({
            message : "Failed to update workflow"
        })
    }

});

app.post("/workflow/:workflowId/execute", authMiddleware, async (req, res) => {
    try {
        const workflow = await WorkflowModel.findById(req.params.workflowId);
        if (!workflow || workflow.userId.toString() !== req.userId) {
            res.status(404).json({ message: "Workflow not found" });
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
    const parsed = z.object({
        provider: z.enum(["lighter", "hyperliquid", "backpack"]),
        secret: z.record(z.string(), z.unknown()).refine((secret) => Object.keys(secret).length > 0),
    }).strict().safeParse(req.body);
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

app.get("/credentials", authMiddleware, async (req, res) => {
    const credentials = await CredentialModel.find({ userId: req.userId }).select("provider createdAt updatedAt").sort({ createdAt: -1 });
    res.json(credentials);
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
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
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
const server = app.listen(process.env.PORT || 3000);
async function shutdown() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
