import { useCallback, useEffect, useState } from "react";
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  runWorkflow,
  type Workflow,
} from "./api";

interface WorkflowListingProps {
  onOpenWorkflow: (workflowId: string) => void;
  onOpenSettings: () => void;
}

export default function WorkflowListing({
  onOpenWorkflow,
  onOpenSettings,
}: WorkflowListingProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listWorkflows();
      setWorkflows(data);
    } catch (err) {
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreate = async () => {
    try {
      const result = await createWorkflow({
        name: "Untitled Workflow",
        description: "",
      });
      onOpenWorkflow(result.id);
    } catch (err) {
      console.error("Failed to create workflow:", err);
      alert("Failed to create workflow. Is the backend running?");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error("Failed to delete workflow:", err);
    }
  };

  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRun = async (id: string) => {
    if (runningId) return;
    setRunningId(id);
    try {
      const result = await runWorkflow(id, {});
      alert(`Workflow triggered successfully!\nRun ID: ${result.run_id}`);
    } catch (err) {
      console.error("Failed to run workflow:", err);
      alert(
        "Failed to run workflow: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setRunningId(null);
    }
  };

  // Extract trigger info from the start node's data
  const getStartNodeInfo = (w: Workflow) => {
    try {
      const nodes = typeof w.nodes === "string" ? JSON.parse(w.nodes) : w.nodes;
      if (!Array.isArray(nodes))
        return { triggerType: "schedule", cronSchedule: "" };
      const startNode = nodes.find(
        (n: { type?: string }) => n.type === "start",
      );
      const data = startNode?.data || {};

      // If trigger_type is explicitly set, use it
      if (data.trigger_type) {
        return {
          triggerType: data.trigger_type,
          cronSchedule: data.cron_schedule || "",
        };
      }

      // Auto-detect: if workflow has a jira_webhook node, treat as "trigger"
      const hasWebhookNode = nodes.some(
        (n: { type?: string }) => n.type === "jira_webhook",
      );
      return {
        triggerType: hasWebhookNode ? "trigger" : "schedule",
        cronSchedule: data.cron_schedule || "",
      };
    } catch {
      return { triggerType: "schedule", cronSchedule: "" };
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ---- Empty state ----
  if (!loading && workflows.length === 0) {
    return (
      <div className="listing-page">
        <div className="listing-header">
          <h1>Workflows</h1>
          <button className="settings-btn" onClick={onOpenSettings}>
            ⚙️ Integrations
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🔧</div>
          <h2>No workflows yet</h2>
          <p>Create your first workflow to get started with automation.</p>
          <button className="create-btn primary" onClick={handleCreate}>
            ＋ Create Workflow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="listing-page">
      <div className="listing-header">
        <h1>Workflows</h1>
        <div className="listing-header-actions">
          <button className="settings-btn" onClick={onOpenSettings}>
            ⚙️ Integrations
          </button>
          <button className="create-btn primary" onClick={handleCreate}>
            ＋ Create Workflow
          </button>
        </div>
      </div>

      {loading ? (
        <div className="listing-loading">Loading workflows…</div>
      ) : (
        <div className="listing-table-wrapper">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Trigger</th>
                <th>Updated</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => {
                const { triggerType: tt, cronSchedule: cs } =
                  getStartNodeInfo(w);
                return (
                  <tr key={w.id}>
                    <td className="wf-name">{w.name}</td>
                    <td>
                      <span className={`badge badge-${w.status}`}>
                        {w.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-trigger-${tt}`}>
                        {tt === "schedule"
                          ? cs
                            ? `🕐 ${cs}`
                            : "🕐 Schedule"
                          : "⚡ Trigger"}
                      </span>
                    </td>
                    <td className="wf-date">{formatDate(w.updated_at)}</td>
                    <td className="wf-actions">
                      {w.status === "active" && tt === "schedule" && (
                        <button
                          className="action-btn run"
                          onClick={() => handleRun(w.id)}
                          disabled={runningId !== null}
                        >
                          {runningId === w.id ? "⏳ Running…" : "▶️ Run"}
                        </button>
                      )}
                      {w.status === "active" && tt === "trigger" && (
                        <button
                          className="action-btn trigger"
                          onClick={() => handleRun(w.id)}
                          disabled={runningId !== null}
                        >
                          {runningId === w.id ? "⏳ Running…" : "⚡ Trigger"}
                        </button>
                      )}
                      <button
                        className="action-btn edit"
                        onClick={() => onOpenWorkflow(w.id)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(w.id, w.name)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
