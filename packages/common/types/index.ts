import { z } from "zod";

export const SignupSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string()
});

export const SigninSchema= z.object({
    username: z.string().min(3).max(50),
    password: z.string()
});

export const CreateWorkflowSchema = z.object({
    nodes: z.array(z.object({
        nodeId: z.string(),
        data: z.object({
            kind: z.enum(["ACTION", "TRIGGER"]),
            metadata : z.any()
        }),
        id: z.string(),
        position: z.object({
            x: z.number(),
            y: z.number()
        })
    })),
    edges: z.array(z.object({
        id: z.string(),
        source: z.string(),
        target : z.string()
    }))
})

export const UpdateWorkflowSchema = z.object({
   nodes: z.array(z.object({
        nodeId: z.string(),
        data: z.object({
            kind: z.enum(["ACTION", "TRIGGER"]),
            metadata : z.any()
        }),
        id: z.string(),
        position: z.object({
            x: z.number(),
            y: z.number()
        })
    })),
    edges: z.array(z.object({
        id: z.string(),
        source: z.string(),
        target: z.string()
    }))
})