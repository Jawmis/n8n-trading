import { z } from "zod";

export const SignupSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(12).max(256)
});

export const SigninSchema= z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(1).max(256)
});

export const CreateWorkflowSchema = z.object({
    nodes: z.array(z.object({
        nodeId: z.string(),
        data: z.object({
            kind: z.enum(["ACTION", "TRIGGER"]),
            metadata : z.any()
        }),
        credentials :z.any(),
        type: z.string(),
        id: z.string(),
        position: z.object({
            x: z.number(),
            y: z.number()
        })
    }).strict()).max(100),
    edges: z.array(z.object({
        id: z.string(),
        source: z.string(),
        target : z.string()
    }).strict()).max(500)
})

export const UpdateWorkflowSchema = z.object({
   nodes: z.array(z.object({
        nodeId: z.string(),
        data: z.object({
            kind: z.enum(["ACTION", "TRIGGER"]),
            metadata : z.any()
        }),
        credentials : z.any().optional(),
        type: z.string(),
        id: z.string(),
        position: z.object({
            x: z.number(),
            y: z.number()
        })
    }).strict()).max(100),
    edges: z.array(z.object({
        id: z.string(),
        source: z.string(),
        target: z.string()
    }).strict()).max(500)
})
