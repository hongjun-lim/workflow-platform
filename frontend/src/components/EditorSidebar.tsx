import { AddNodePanel } from "./AddNodePanel";
import type {
  WorkflowRun as ApiWorkflowRun,
  NodeLog as ApiNodeLog,
} from "../api";

interface EditorSidebarProps {
  workflowName: string;
  setWorkflowName: (name: string) => void;
  workflowStatus: string;
  runs: ApiWorkflowRun[];
  selectedRun: string | null;
  logs: ApiNodeLog[];
  isSaving: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onPublish: () => void;
  onBack: () => void;
  onTestRun: () => void;
  onLoadRuns: () => void;
  onLoadLogs: (runId: string) => void;
  onCloseLog: () => void;
}

export const EditorSidebar = ({
  workflowName,
  setWorkflowName,
  workflowStatus,
  runs,
  selectedRun,
  isSaving,
  hasChanges,
  onSave,
  onPublish,
  onBack,
  onTestRun,
  onLoadRuns,
  onLoadLogs,
  onCloseLog,
}: EditorSidebarProps) => {
  return (
    <>
      <div className="sidebar">
        <button className="back-btn" onClick={onBack}>
          ← Back to Workflows
        </button>

        <h2>Workflow Builder</h2>

        <div className="section">
          <h3>Workflow Name</h3>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
          />
        </div>

        <AddNodePanel />

        <div className="section">
          <h3>Actions</h3>
          {hasChanges && (
            <button onClick={onSave} className="save-btn" disabled={isSaving}>
              {isSaving ? "💾 Saving..." : "💾 Save"}
            </button>
          )}
          {workflowStatus !== "active" && (
            <button onClick={onPublish} className="publish-btn">
              🚀 Publish Workflow
            </button>
          )}
          <button
            onClick={onTestRun}
            className="publish-btn"
            style={{ background: "#38a169" }}
          >
            ▶️ Test Run
          </button>
          <button onClick={onLoadRuns} className="load-btn">
            📋 Load Runs
          </button>
        </div>

        {runs.length > 0 && (
          <div className="section">
            <h3>Execution Runs</h3>
            {runs.map((run) => (
              <div key={run.id} className="run-item">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span className={`status ${run.status}`}>{run.status}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>
                    {new Date(run.started_at).toLocaleString("en-US", {
                      timeZone: "Asia/Singapore",
                      hour12: false,
                    })}
                  </span>
                  <button onClick={() => onLoadLogs(run.id)}>View Logs</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRun && (
        <div className="logs-panel">
          <h3>
            Logs for Run: {selectedRun.slice(0, 8)}...
            <button onClick={onCloseLog}>✕</button>
          </h3>

          {/* Run Summary */}
          {(() => {
            const runData = runs.find((r) => r.id === selectedRun);
            if (runData) {
              return (
                <div
                  style={{
                    background:
                      runData.status === "completed"
                        ? "#f0fff4"
                        : runData.status === "failed"
                          ? "#fff5f5"
                          : runData.status === "running"
                            ? "#fffbeb"
                            : "#f7f8fa",
                    border: `2px solid ${
                      runData.status === "completed"
                        ? "#38a169"
                        : runData.status === "failed"
                          ? "#e53e3e"
                          : runData.status === "running"
                            ? "#f59e0b"
                            : "#d1d5db"
                    }`,
                    borderRadius: 8,
                    padding: 12,
                    margin: "12px 16px",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {runData.status === "completed"
                        ? "✅"
                        : runData.status === "failed"
                          ? "❌"
                          : runData.status === "running"
                            ? "⏳"
                            : "⚪"}
                    </span>
                    <strong
                      style={{
                        color:
                          runData.status === "completed"
                            ? "#22543d"
                            : runData.status === "failed"
                              ? "#c53030"
                              : runData.status === "running"
                                ? "#92400e"
                                : "#374151",
                      }}
                    >
                      Workflow{" "}
                      {runData.status.charAt(0).toUpperCase() +
                        runData.status.slice(1)}
                    </strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginLeft: "auto",
                      }}
                    >
                      {new Date(runData.started_at).toLocaleString("en-US", {
                        timeZone: "Asia/Singapore",
                        hour12: false,
                      })}
                    </span>
                  </div>
                  {runData.message && (
                    <div
                      style={{
                        fontSize: 12,
                        color:
                          runData.status === "failed"
                            ? "#c53030"
                            : runData.status === "completed"
                              ? "#22543d"
                              : "#374151",
                        padding: "6px 8px",
                        background:
                          runData.status === "failed"
                            ? "#fff"
                            : runData.status === "completed"
                              ? "#fff"
                              : "#fef3c7",
                        borderRadius: 4,
                        border: `1px solid ${
                          runData.status === "failed"
                            ? "#fc8181"
                            : runData.status === "completed"
                              ? "#9ae6b4"
                              : "#fbbf24"
                        }`,
                      }}
                    >
                      {runData.message}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}
    </>
  );
};
