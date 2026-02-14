const API_BASE = "http://localhost:8081/api";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: unknown;
  edges: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description: string;
  nodes?: unknown;
  edges?: unknown;
}

export interface UpdateWorkflowRequest {
  name: string;
  description: string;
  nodes: unknown;
  edges: unknown;
  status: string;
}

// ---- Workflow CRUD ----

export async function listWorkflows(): Promise<Workflow[]> {
  const res = await fetch(`${API_BASE}/workflows`);
  if (!res.ok) throw new Error("Failed to fetch workflows");
  const data = await res.json();
  return data ?? [];
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/workflows/${id}`);
  if (!res.ok) throw new Error("Failed to fetch workflow");
  return res.json();
}

export async function createWorkflow(
  req: CreateWorkflowRequest,
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: req.name,
      description: req.description,
      nodes: req.nodes ?? [],
      edges: req.edges ?? [],
    }),
  });
  if (!res.ok) throw new Error("Failed to create workflow");
  return res.json();
}

export async function updateWorkflow(
  id: string,
  req: UpdateWorkflowRequest,
): Promise<void> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Failed to update workflow");
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete workflow");
}

// ---- Runs ----

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export interface NodeLog {
  id: string;
  run_id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  input: unknown;
  output: unknown;
  error_message: string;
}

export async function getRuns(): Promise<WorkflowRun[]> {
  const res = await fetch(`${API_BASE}/runs`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  const data = await res.json();
  return data ?? [];
}

export async function getRunLogs(runId: string): Promise<NodeLog[]> {
  const res = await fetch(`${API_BASE}/runs/${runId}/logs`);
  if (!res.ok) throw new Error("Failed to fetch run logs");
  const data = await res.json();
  return data ?? [];
}
