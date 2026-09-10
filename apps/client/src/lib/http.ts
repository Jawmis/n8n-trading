import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = "auth_token";

// Return types
export type IdResponse = { id: string };
export type SigninResponse = { id: string; token: string };
export type Credential = { _id: string; provider: string; createdAt?: string; updatedAt?: string; revokedAt?: string };

export type WorkflowNode = {
  nodeId: string;
  data: { kind: "ACTION" | "TRIGGER"; metadata: unknown };
  credentialId?: string;
  id: string;
  position: { x: number; y: number };
  type: string;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

export type Workflow = {
  _id: string;
  userId: string;
  name: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      setAuthToken(null);
      if (window.location.pathname !== "/auth") window.location.assign("/auth");
    }
    return Promise.reject(error);
  },
);

// Route-specific helpers (one per backend route)
export async function apiSignup(body: { username: string; password: string }): Promise<IdResponse> {
  const res = await api.post<IdResponse>("/signup", body);
  return res.data;
}

export async function apiSignin(body: { username: string; password: string }): Promise<SigninResponse> {
  const res = await api.post<SigninResponse>("/signin", body);
  setAuthToken(res.data.token);
  return res.data;
}

export async function apiSignout(): Promise<void> {
  try {
    await api.post("/signout");
  } finally {
    setAuthToken(null);
  }
}

export async function apiCreateCredential(provider: string, secret: Record<string, unknown>): Promise<{ id: string; provider: string }> {
  const res = await api.post<{ id: string; provider: string }>("/credentials", { provider, secret });
  return res.data;
}

export async function apiListCredentials(): Promise<Credential[]> {
  const res = await api.get<Credential[]>("/credentials");
  return res.data;
}

export async function apiRotateCredential(credentialId: string, provider: string, secret: Record<string, unknown>): Promise<{ id: string; provider: string }> {
  const res = await api.put<{ id: string; provider: string }>(`/credentials/${credentialId}`, { provider, secret });
  return res.data;
}

export async function apiDeleteCredential(credentialId: string): Promise<void> {
  await api.delete(`/credentials/${credentialId}`);
}

export async function apiTestCredential(credentialId: string): Promise<{ ok: boolean }> {
  const res = await api.post<{ ok: boolean }>(`/credentials/${credentialId}/test`);
  return res.data;
}

export async function apiRevokeCredential(credentialId: string): Promise<{ id: string; revokedAt: string }> {
  const res = await api.post<{ id: string; revokedAt: string }>(`/credentials/${credentialId}/revoke`);
  return res.data;
}

export async function apiCreateWorkflow(body: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<IdResponse> {
  const res = await api.post<IdResponse>("/workflow", body);
  return res.data;
}

export async function apiUpdateWorkflow(workflowId: string, body: { name?: string; enabled?: boolean; nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<IdResponse> {
  const res = await api.put<IdResponse>(`/workflow/${workflowId}`, body);
  return res.data;
}

export async function apiDuplicateWorkflow(workflowId: string): Promise<IdResponse> {
  const res = await api.post<IdResponse>(`/workflow/${workflowId}/duplicate`);
  return res.data;
}

export async function apiDeleteWorkflow(workflowId: string): Promise<void> {
  await api.delete(`/workflow/${workflowId}`);
}

export async function apiExecuteWorkflow(workflowId: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(`/workflow/${workflowId}/execute`);
  return res.data;
}

export async function apiGetWorkflow(workflowId: string): Promise<Workflow> {
  const res = await api.get<Workflow>(`/workflow/${workflowId}`);
  return res.data;
}

export async function apiListWorkflows(): Promise<Workflow[]> {
  const res = await api.get<Workflow[]>("/workflows");
  return res.data;
}

export type ExecutionStatus = "pending" | "running" | "success" | "failure";
export type WorkflowExecution = { _id?: string; id?: string; status?: ExecutionStatus; startTime?: string; endTime?: string; error?: string; results?: Array<{ nodeId: string; result: unknown }> };
export type WorkflowAuditEvent = { _id: string; action: string; metadata?: Record<string, unknown>; createdAt: string };
export type PaginatedExecutions = { items: WorkflowExecution[]; page: number; pageSize: number; total: number; totalPages: number };

export async function apiListExecutions(workflowId: string, page = 1, pageSize = 25, status?: ExecutionStatus): Promise<PaginatedExecutions> {
  const res = await api.get<PaginatedExecutions>(`/workflow/executions/${workflowId}`, { params: { page, pageSize, ...(status ? { status } : {}) } });
  return res.data;
}

export async function apiListWorkflowAudit(workflowId: string): Promise<WorkflowAuditEvent[]> {
  const res = await api.get<WorkflowAuditEvent[]>(`/workflow/${workflowId}/audit`);
  return res.data;
}

export async function apiCancelExecution(executionId: string): Promise<void> {
  await api.post(`/workflow/executions/${executionId}/cancel`);
}

export async function apiRetryExecution(executionId: string): Promise<IdResponse> {
  const res = await api.post<IdResponse>(`/workflow/executions/${executionId}/retry`);
  return res.data;
}

export async function apiListNodes(): Promise<unknown[]> {
  const res = await api.get<unknown[]>("/nodes");
  return res.data;
}
