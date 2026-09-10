import { z } from "zod";
import { SUPPORTED_ASSETS } from "../metadata";

export const SignupSchema = z.object({ username: z.string().min(3).max(50), password: z.string().min(12).max(256) });
export const SigninSchema = z.object({ username: z.string().min(3).max(50), password: z.string().min(1).max(256) });

const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const EdgeSchema = z.object({ id: z.string().min(1), source: z.string().min(1), target: z.string().min(1) }).strict();
const NodeSchema = z.object({
    nodeId: z.string().min(1),
    type: z.enum(["timer", "price-trigger", "lighter"]),
    data: z.object({ kind: z.enum(["ACTION", "TRIGGER"]), metadata: z.unknown() }).strict(),
    credentialId: z.string().min(1).optional(),
    id: z.string().min(1),
    position: PositionSchema,
}).strict();

export const CreateWorkflowSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    enabled: z.boolean().optional(),
    nodes: z.array(NodeSchema).max(100),
    edges: z.array(EdgeSchema).max(500),
}).strict();
export const UpdateWorkflowSchema = CreateWorkflowSchema;
const TimerMetadataSchema = z.object({ time: z.number().finite().positive() }).strict();
const PriceTriggerMetadataSchema = z.object({ asset: z.enum(SUPPORTED_ASSETS), price: z.number().finite().positive(), decimals: z.number().int().nonnegative().optional() }).strict();
const TradingMetadataSchema = z.object({ type: z.enum(["LONG", "SHORT"]), qty: z.number().finite().positive(), symbol: z.enum(SUPPORTED_ASSETS) }).strict();

function validateNodeMetadata(node: z.infer<typeof NodeSchema>) {
    if (node.type === "timer" && node.data.kind === "TRIGGER") return TimerMetadataSchema.safeParse(node.data.metadata);
    if (node.type === "price-trigger" && node.data.kind === "TRIGGER") return PriceTriggerMetadataSchema.safeParse(node.data.metadata);
    if (node.type === "lighter" && node.data.kind === "ACTION") return TradingMetadataSchema.safeParse(node.data.metadata);
    return { success: false as const };
}

export type WorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export function validateWorkflowGraph(input: unknown): { success: true; data: WorkflowInput } | { success: false; message: string } {
    const parsed = CreateWorkflowSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues.map((issue) => issue.message).join(", ") };
    const { nodes, edges } = parsed.data;
    const nodeIds = new Set<string>();
    for (const node of nodes) {
        if (nodeIds.has(node.id)) return { success: false, message: `Duplicate node id: ${node.id}` };
        nodeIds.add(node.id);
        if (!validateNodeMetadata(node).success) return { success: false, message: `Invalid metadata for node ${node.id}` };
    }
    const triggers = nodes.filter((node) => node.data.kind === "TRIGGER");
    if (triggers.length !== 1) return { success: false, message: "A workflow must contain exactly one trigger" };
    const trigger = triggers[0];
    if (!trigger) return { success: false, message: "A workflow must contain exactly one trigger" };
    const edgeIds = new Set<string>();
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
        if (edgeIds.has(edge.id)) return { success: false, message: `Duplicate edge id: ${edge.id}` };
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return { success: false, message: `Edge ${edge.id} references a missing node` };
        if (edge.source === edge.target) return { success: false, message: `Self-referencing edge: ${edge.id}` };
        edgeIds.add(edge.id);
        adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(id: string): boolean {
        if (visiting.has(id)) return false;
        if (visited.has(id)) return true;
        visiting.add(id);
        for (const child of adjacency.get(id) ?? []) if (!visit(child)) return false;
        visiting.delete(id);
        visited.add(id);
        return true;
    }
    if (!visit(trigger.id)) return { success: false, message: "Workflow graph must not contain cycles" };
    if (visited.size !== nodes.length) return { success: false, message: "Every node must be reachable from the trigger" };
    return { success: true, data: parsed.data };
}
