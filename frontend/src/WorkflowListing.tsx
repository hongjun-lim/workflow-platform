import { useCallback, useEffect, useState } from "react";
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  type Workflow,
} from "./api";

interface WorkflowListingProps {
  onOpenWorkflow: (workflowId: string) => void;
}

export default function WorkflowListing({
  onOpenWorkflow,
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
        <button className="create-btn primary" onClick={handleCreate}>
          ＋ Create Workflow
        </button>
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
                <th>Created</th>
                <th>Updated</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id}>
                  <td className="wf-name">{w.name}</td>
                  <td>
                    <span className={`badge badge-${w.status}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="wf-date">{formatDate(w.created_at)}</td>
                  <td className="wf-date">{formatDate(w.updated_at)}</td>
                  <td className="wf-actions">
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
