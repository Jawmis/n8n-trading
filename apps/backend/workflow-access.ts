export type WorkflowRole = "owner" | "editor" | "viewer";

export function workflowAccess(userId: string | undefined, write = false) {
    return { $or: [
        { userId },
        { members: { $elemMatch: { userId, role: { $in: write ? ["editor"] : ["editor", "viewer"] } } } },
    ] };
}

export function workflowRole(workflow: { userId: { toString(): string }; members?: Array<{ userId: { toString(): string }; role: string }> }, userId: string | undefined): WorkflowRole | undefined {
    if (workflow.userId.toString() === userId) return "owner";
    return workflow.members?.find((member) => member.userId.toString() === userId)?.role as WorkflowRole | undefined;
}

export function workflowSnapshot(workflow: { _id: unknown; userId: unknown; revision: number; nodes: unknown; edges: unknown }) {
    return { _id: String(workflow._id), userId: String(workflow.userId), revision: workflow.revision, nodes: workflow.nodes, edges: workflow.edges };
}
