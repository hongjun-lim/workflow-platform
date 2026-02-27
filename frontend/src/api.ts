const API_BASE = "http://localhost:8081/api";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: unknown;
  edges: unknown;
  status: string;
  trigger_type: string;
  cron_schedule: string | null;
  last_cron_run: string | null;
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

export async function updateWorkflowTrigger(
  id: string,
  triggerType: string,
  cronSchedule?: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/workflows/${id}/trigger`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger_type: triggerType,
      cron_schedule: cronSchedule ?? null,
    }),
  });
  if (!res.ok) throw new Error("Failed to update trigger");
}

// ---- Runs ----

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  message: string;
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

// ---- Integrations ----

export interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export async function getIntegrations(): Promise<Integration[]> {
  const res = await fetch(`${API_BASE}/integrations`);
  if (!res.ok) throw new Error("Failed to fetch integrations");
  const data = await res.json();
  return data ?? [];
}

export async function getIntegration(type: string): Promise<Integration> {
  const res = await fetch(`${API_BASE}/integrations/${type}`);
  if (!res.ok) throw new Error("Integration not found");
  return res.json();
}

export async function upsertIntegration(
  type: string,
  name: string,
  config: Record<string, string>,
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/integrations/${type}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config }),
  });
  if (!res.ok) throw new Error("Failed to save integration");
  return res.json();
}

export async function deleteIntegration(type: string): Promise<void> {
  const res = await fetch(`${API_BASE}/integrations/${type}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete integration");
}

// ---- Webhook Events ----

export interface WebhookEvent {
  id: string;
  source: string;
  event_type: string;
  payload: unknown;
  processed: boolean;
  workflow_run_id: string | null;
  created_at: string;
}

export async function getWebhookEvents(): Promise<WebhookEvent[]> {
  const res = await fetch(`${API_BASE}/webhook-events`);
  if (!res.ok) throw new Error("Failed to fetch webhook events");
  const data = await res.json();
  return data ?? [];
}

// ---- Run workflow ----

export async function runWorkflow(
  id: string,
  input?: unknown,
): Promise<{ run_id: string }> {
  const res = await fetch(`${API_BASE}/workflows/${id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: input ?? {} }),
  });
  if (!res.ok) throw new Error("Failed to run workflow");
  return res.json();
}

// ---- Dry-run a single node (no DB records) ----

export interface DryRunResult {
  success: boolean;
  error: string | null;
  output: unknown;
}

export async function dryRunNode(
  nodeType: string,
  data: Record<string, unknown>,
  input: unknown,
): Promise<DryRunResult> {
  const res = await fetch(`${API_BASE}/nodes/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_type: nodeType, data, input }),
  });
  if (!res.ok) throw new Error("Dry-run request failed");
  return res.json();
}
