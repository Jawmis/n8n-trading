import express from 'express';
import mongoose from 'mongoose';
import { ExecutionModel, NodesModel, UserModel, WorkflowModel } from 'db/client';
import jwt from "jsonwebtoken"; 
import { SignupSchema,SigninSchema, CreateWorkflowSchema, UpdateWorkflowSchema } from 'common/types';
import { authMiddleware } from './middleware';
import cors from 'cors';

mongoose.connect(process.env.MONGO_URL!);

const app = express();

app.use(express.json());

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));

const JWT_SECRET = process.env.JWT_SECRET!;

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
            password: data.password
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
        const user = await UserModel.findOne({
            username: data.username,
            password: data.password
        })
        if (user) {
            // return the user their jwt or token.
             
        const token = jwt.sign({
            id: user._id
        }, JWT_SECRET);

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
    const { success, data } = UpdateWorkflowSchema.safeParse(req.body);
    if (!success) {
        res.status(403).json({
            message : "incorrect inputs"
        })
        return
    }
    try {
        const workflow = await WorkflowModel.findByIdAndUpdate(req.params.workflowId, data, { new: true });
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
        await WorkflowModel.updateOne({ _id: workflow._id }, { $set: { runRequestedAt: new Date() } });
        res.json({ message: "Workflow queued for execution" });
    } catch {
        res.status(500).json({ message: "Failed to queue workflow" });
    }
});

app.get("/workflows", authMiddleware, async (req, res) => {
    const workflows = await WorkflowModel.find({
        userId: req.userId
    });
    res.json(workflows);
});

app.get("/workflow/:workflowId", authMiddleware, async (req, res) => {
    
    //to : make sure the workflow belongs to the user
    const workflow = await WorkflowModel.findById(req.params.workflowId);
    if (!workflow || workflow.userId.toString() !== req.userId) {
        res.status(404).json({
            message: "Workflow not found"
        })
        return
    }
    res.json(workflow);
});

app.get("/workflow/executions/:workflowId",authMiddleware, async(req, res) => {
    const executions = await ExecutionModel.find({
        workflowId: req.params.workflowId
    });
    res.json(executions)
});

app.get("/nodes", async (req, res) => {
    const nodes = await NodesModel.find();
    res.json(nodes)
})
app.listen(process.env.PORT || 3000);
