import {
  useState,
  useMemo,
  useRef,
  createContext,
  useContext,
  useEffect,
  useCallback,
} from "react";
import "@flowgram.ai/free-layout-editor/index.css";
import {
  FreeLayoutEditorProvider,
  EditorRenderer,
  useNodeRender,
  usePlaygroundTools,
  useClientContext,
  WorkflowNodeRenderer,
  Field,
} from "@flowgram.ai/free-layout-editor";
import type {
  WorkflowNodeProps,
  FreeLayoutProps,
  FreeLayoutPluginContext,
  FlowNodeEntity,
} from "@flowgram.ai/free-layout-editor";
import type { WorkflowJSON } from "@flowgram.ai/free-layout-editor";
import WorkflowListing from "./WorkflowListing";
import IntegrationSettings from "./IntegrationSettings";
import {
  getWorkflow,
  updateWorkflow,
  getRuns as fetchRunsApi,
  getRunLogs as fetchRunLogsApi,
  runWorkflow as runWorkflowApi,
  dryRunNode,
} from "./api";
import type {
  WorkflowRun as ApiWorkflowRun,
  NodeLog as ApiNodeLog,
  DryRunResult,
} from "./api";
import "./App.css";

const NodeSelectionContext = createContext<{
  setSelectedNode: (node: FlowNodeEntity | null) => void;
  openDryRun: (node: FlowNodeEntity) => void;
} | null>(null);

// Node types available for adding
const nodeTypesList = [
  { type: "start", label: "Start Trigger", icon: "🚀" },
  { type: "jira_webhook", label: "Jira Webhook Trigger", icon: "🎫" },
  { type: "http_request", label: "HTTP Request", icon: "🌐" },
  { type: "jira_create_issue", label: "Jira Create Issue", icon: "📋" },
  { type: "slack_message", label: "Slack Message", icon: "💬" },
  { type: "condition", label: "Condition", icon: "🔀" },
  { type: "transform", label: "Transform Data", icon: "🔄" },
  { type: "delay", label: "Delay", icon: "⏱️" },
  { type: "end", label: "Output", icon: "📤" },
];

// Node colors by type
const nodeColors: Record<string, string> = {
  start: "#667eea",
  jira_webhook: "#0052CC",
  http_request: "#4299e1",
  jira_create_issue: "#0052CC",
  slack_message: "#4A154B",
  condition: "#ed8936",
  transform: "#48bb78",
  delay: "#9f7aea",
  end: "#f56565",
};

// ==================== Custom Node Renderer ====================

// Helper: build summary lines for a node based on its type and data
function getNodeSummaryLines(
  nodeType: string,
  data: Record<string, unknown> | undefined,
): { label: string; value: string }[] {
  if (!data) return [];
  const lines: { label: string; value: string }[] = [];
  const str = (key: string) => (data[key] as string) || "";

  switch (nodeType) {
    case "start":
      if (str("trigger_type"))
        lines.push({
          label: "Trigger",
          value:
            str("trigger_type") === "manual"
              ? "Manual"
              : str("trigger_type") === "schedule"
                ? `Schedule: ${str("cron_expression") || "—"}`
                : str("trigger_type") === "webhook"
                  ? "Generic Webhook"
                  : str("trigger_type"),
        });
      break;

    case "jira_webhook": {
      const mode = str("webhook_mode") || "platform";
      lines.push({
        label: "Mode",
        value: mode === "platform" ? "Platform Webhook" : "Custom Webhook",
      });
      if (str("event_filter"))
        lines.push({ label: "Event", value: str("event_filter") });
      if (mode === "custom" && str("jql_filter"))
        lines.push({ label: "JQL", value: str("jql_filter") });
      break;
    }

    case "http_request":
      if (str("method") || str("url"))
        lines.push({
          label: str("method") || "GET",
          value: str("url") || "No URL",
        });
      if (str("auth_type") && str("auth_type") !== "none")
        lines.push({ label: "Auth", value: str("auth_type") });
      break;

    case "jira_create_issue":
      if (str("project_key"))
        lines.push({ label: "Project", value: str("project_key") });
      if (str("issue_type"))
        lines.push({ label: "Type", value: str("issue_type") });
      if (str("summary"))
        lines.push({
          label: "Summary",
          value:
            str("summary").length > 30
              ? str("summary").slice(0, 30) + "…"
              : str("summary"),
        });
      break;

    case "slack_message":
      if (str("channel"))
        lines.push({ label: "Channel", value: str("channel") });
      if (str("message"))
        lines.push({
          label: "Message",
          value:
            str("message").length > 30
              ? str("message").slice(0, 30) + "…"
              : str("message"),
        });
      break;

    case "condition":
      if (str("condition_type") === "simple") {
        const expr = [str("field"), str("operator"), str("compare_value")]
          .filter(Boolean)
          .join(" ");
        if (expr) lines.push({ label: "If", value: expr });
      } else if (str("expression")) {
        lines.push({
          label: "Expr",
          value:
            str("expression").length > 35
              ? str("expression").slice(0, 35) + "…"
              : str("expression"),
        });
      }
      break;

    case "transform":
      if (str("transform_type"))
        lines.push({
          label: "Type",
          value:
            str("transform_type") === "jq"
              ? "jq Expression"
              : str("transform_type") === "mapping"
                ? "Field Mapping"
                : str("transform_type"),
        });
      if (str("expression"))
        lines.push({
          label: "Expr",
          value:
            str("expression").length > 30
              ? str("expression").slice(0, 30) + "…"
              : str("expression"),
        });
      break;

    case "delay": {
      const ms = Number(data["delay"] || 0);
      const unit = str("delay_unit") || "ms";
      if (ms)
        lines.push({
          label: "Wait",
          value: `${ms} ${unit === "ms" ? "ms" : unit === "s" ? "sec" : unit === "m" ? "min" : unit === "h" ? "hr" : unit}`,
        });
      break;
    }

    case "end":
      if (str("output_mapping"))
        lines.push({ label: "Output", value: "Custom mapping" });
      break;
  }
  return lines;
}

const NodeRender = (props: WorkflowNodeProps) => {
  const { form, selected } = useNodeRender();
  const nodeType = String(props.node.getNodeRegistry()?.type || "custom");
  const borderColor = selected ? "#4e40e5" : "rgba(6, 7, 9, 0.15)";
  const accentColor = nodeColors[nodeType] || "#4e40e5";
  const nodeSelectionContext = useContext(NodeSelectionContext);

  // Node types that support dry-run testing
  const canDryRun = [
    "http_request",
    "jira_create_issue",
    "slack_message",
  ].includes(nodeType);

  const handleNodeClick = () => {
    // Start nodes have no config — skip opening the drawer
    if (nodeType === "start") return;
    if (nodeSelectionContext) {
      nodeSelectionContext.setSelectedNode(props.node);
    }
  };

  const handleDryRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeSelectionContext) {
      nodeSelectionContext.openDryRun(props.node);
    }
  };

  // Get node data for preview
  const nodeData = (props.node as unknown as { data?: Record<string, unknown> })
    .data;
  const summaryLines = getNodeSummaryLines(nodeType, nodeData);
  const customTitle = (nodeData?.title as string) || "";

  return (
    <WorkflowNodeRenderer
      style={{
        width: 280,
        minHeight: 80,
        height: "auto",
        background: "#fff",
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        boxShadow: selected
          ? "0 4px 20px rgba(78, 64, 229, 0.25)"
          : "0 2px 8px rgba(0, 0, 0, 0.08)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      node={props.node}
    >
      <div
        style={{
          background: accentColor,
          padding: "10px 14px",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
        onClick={handleNodeClick}
      >
        <span>
          {nodeTypesList.find((n) => n.type === nodeType)?.icon || "📦"}
        </span>
        <span style={{ flex: 1 }}>
          {customTitle ||
            nodeTypesList.find((n) => n.type === nodeType)?.label ||
            nodeType}
        </span>
        {canDryRun && (
          <button
            onClick={handleDryRun}
            title="Test this node (dry run)"
            style={{
              background: "rgba(255,255,255,0.25)",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              padding: "2px 8px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.4)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.25)")
            }
          >
            ▶ Test
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 14px",
          color: "#1c1f23",
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
        onClick={handleNodeClick}
      >
        {summaryLines.length > 0 ? (
          summaryLines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  color: "#6b7280",
                  fontWeight: 500,
                  fontSize: 11,
                  minWidth: 52,
                  flexShrink: 0,
                }}
              >
                {line.label}
              </span>
              <span
                style={{
                  color: "#1c1f23",
                  wordBreak: "break-all",
                  lineHeight: 1.3,
                }}
              >
                {line.value}
              </span>
            </div>
          ))
        ) : (
          <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 11 }}>
            Double-click to configure
          </span>
        )}
        {/* Hidden form render to keep Flowgram internal state */}
        <div style={{ display: "none" }}>{form?.render()}</div>
      </div>
    </WorkflowNodeRenderer>
  );
};

// ==================== Toolbar ====================

const Tools = () => {
  const tools = usePlaygroundTools();

  const buttonStyle = {
    border: "1px solid rgba(28, 31, 35, 0.15)",
    borderRadius: 6,
    cursor: "pointer",
    padding: "8px 12px",
    color: "#1c1f23",
    background: "#fff",
    fontSize: 13,
    fontWeight: 500 as const,
    transition: "all 0.2s ease",
  };

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 10,
        bottom: 20,
        right: 20,
        display: "flex",
        gap: 8,
        background: "#fff",
        padding: 8,
        borderRadius: 10,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      }}
    >
      <button style={buttonStyle} onClick={() => tools.zoomin()}>
        ➕
      </button>
      <button style={buttonStyle} onClick={() => tools.zoomout()}>
        ➖
      </button>
      <span
        style={{
          ...buttonStyle,
          cursor: "default",
          minWidth: 50,
          textAlign: "center" as const,
        }}
      >
        {Math.floor(tools.zoom * 100)}%
      </span>
      <button style={buttonStyle} onClick={() => tools.fitView()}>
        ⛶ Fit
      </button>
      <button style={buttonStyle} onClick={() => tools.autoLayout()}>
        📐 Auto
      </button>
    </div>
  );
};

// ==================== AddNode Panel ====================

const AddNodePanel = () => {
  const context = useClientContext();
  const nodeIdRef = useRef(2);

  const handleAddNode = (type: string, label: string) => {
    try {
      const nodeId = `${type}-${nodeIdRef.current}`;
      const position = {
        x: 100 + ((nodeIdRef.current - 1) % 3) * 350,
        y: 100 + Math.floor((nodeIdRef.current - 1) / 3) * 180,
      };

      context.document.createWorkflowNodeByType(type, position, {
        id: nodeId,
        data: { title: label },
      });

      nodeIdRef.current += 1;
    } catch (error) {
      console.error("Failed to add node:", error);
    }
  };

  return (
    <div className="section">
      <h3>Add Node</h3>
      {nodeTypesList.map((node) => (
        <button
          key={node.type}
          onClick={() => handleAddNode(node.type, node.label)}
          className="node-btn"
        >
          {node.icon} {node.label}
        </button>
      ))}
    </div>
  );
};

// Initial workflow data for brand-new workflows
const initialData = {
  nodes: [
    {
      id: "start-1",
      type: "start",
      data: { title: "Start Trigger" },
      meta: { position: { x: 100, y: 200 } },
    },
  ],
  edges: [],
};

// ==================== Sidebar ====================

const EditorSidebar = ({
  workflowName,
  setWorkflowName,
  runs,
  selectedRun,
  isSaving,
  onPublish,
  onBack,
  onTestRun,
  onLoadRuns,
  onLoadLogs,
  onCloseLog,
}: {
  workflowName: string;
  setWorkflowName: (name: string) => void;
  runs: ApiWorkflowRun[];
  selectedRun: string | null;
  logs: ApiNodeLog[];
  isSaving: boolean;
  onPublish: () => void;
  onBack: () => void;
  onTestRun: () => void;
  onLoadRuns: () => void;
  onLoadLogs: (runId: string) => void;
  onCloseLog: () => void;
}) => {
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
          <div className="save-indicator">
            {isSaving ? "💾 Saving…" : "✅ Saved"}
          </div>
          <button onClick={onPublish} className="publish-btn">
            🚀 Publish Workflow
          </button>
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
                {/* {run.message && (
                  <div
                    style={{
                      fontSize: 12,
                      color: run.status === "failed" ? "#e53e3e" : "#38a169",
                      background:
                        run.status === "failed" ? "#fff5f5" : "#f0fff4",
                      padding: "4px 8px",
                      borderRadius: 4,
                      marginTop: 2,
                    }}
                  >
                    {run.message}
                  </div>
                )} */}
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

// ==================== Node Config Drawer ====================

interface NodeConfigDrawerProps {
  node: FlowNodeEntity;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

const NodeConfigDrawer = ({
  node,
  onClose,
  onUpdate,
}: NodeConfigDrawerProps) => {
  // Resolve type via getNodeRegistry() — same approach as NodeRender
  const nodeType = String(node?.getNodeRegistry?.()?.type || "");

  // Read data from node — Flowgram stores it on the node object
  const rawData =
    (node as unknown as { data?: Record<string, unknown> })?.data || {};

  // Build initial form data with defaults so dropdown values are always saved
  const buildInitialFormData = (): Record<string, unknown> => {
    const data: Record<string, unknown> = { ...rawData };

    // Jira webhook trigger defaults
    if (nodeType === "jira_webhook") {
      if (!data.webhook_mode) data.webhook_mode = "platform";
      if (!data.event_filter) data.event_filter = "";
    }

    // Jira create issue defaults
    if (nodeType === "jira_create_issue") {
      if (!data.issue_type) data.issue_type = "Task";
      if (!data.priority) data.priority = "";
    }

    // HTTP request defaults
    if (nodeType === "http_request") {
      if (!data.method) data.method = "GET";
      if (!data.auth_type) data.auth_type = "none";
    }

    // Start trigger defaults
    if (nodeType === "start") {
      if (!data.trigger_type) data.trigger_type = "manual";
    }

    return data;
  };

  const [formData, setFormData] =
    useState<Record<string, unknown>>(buildInitialFormData);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  const set = (key: string, val: unknown) =>
    setFormData((prev) => ({ ...prev, [key]: val }));
  const str = (key: string) => (formData[key] as string) || "";

  const handleSave = () => {
    onUpdate(node.id, formData);
    onClose();
  };

  const handleRegisterJiraWebhook = async () => {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const res = await fetch(
        "http://localhost:8081/api/jira/register-webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jira_domain: str("custom_jira_domain"),
            jira_email: str("custom_jira_email"),
            jira_api_token: str("custom_jira_api_token"),
            webhook_url: str("custom_webhook_url"),
            events: (formData.webhook_events as string[]) || [],
            jql_filter: str("jql_filter"),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setRegisterResult(
          `✅ Webhook registered! Name: ${data.name || "jira-webhook"}`,
        );
        set("registered_webhook_id", data.webhook_id);
      } else {
        setRegisterResult(`❌ Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setRegisterResult(
        `❌ Error: ${err instanceof Error ? err.message : "Network error"}`,
      );
    } finally {
      setRegistering(false);
    }
  };

  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);

  return (
    <div className="config-drawer">
      <div className="config-header">
        <h3>
          {nodeConfig?.icon} Configure {nodeConfig?.label}
        </h3>
        <span className="config-node-id">ID: {node.id}</span>
        <button onClick={onClose} className="close-btn">
          ✕
        </button>
      </div>

      <div className="config-body">
        {/* ---- Common: Node Title ---- */}
        <div className="form-group">
          <label>Node Title</label>
          <input
            type="text"
            value={str("title")}
            onChange={(e) => set("title", e.target.value)}
            placeholder={nodeConfig?.label || "Enter node title"}
          />
          <p className="field-hint">Custom display name for this node</p>
        </div>

        {/* ==================== START TRIGGER ==================== */}
        {nodeType === "start" && (
          <div className="start-node-info">
            <div className="start-node-icon">🚀</div>
            <h4>Starting Point</h4>
            <p>
              This is the entry point of your workflow. Connect it to the next
              node to begin your automation flow.
            </p>
            <p className="field-hint">
              No configuration needed — just link this node to the next step.
            </p>
          </div>
        )}

        {/* ==================== JIRA WEBHOOK TRIGGER ==================== */}
        {nodeType === "jira_webhook" && (
          <>
            <div className="config-section-title">Webhook Mode</div>
            <div className="form-group">
              <label>Mode</label>
              <select
                value={str("webhook_mode") || "platform"}
                onChange={(e) => set("webhook_mode", e.target.value)}
              >
                <option value="platform">
                  Platform Webhook (shared, pre-configured)
                </option>
                <option value="custom">
                  Custom Webhook (your own Jira instance)
                </option>
              </select>
              <p className="field-hint">
                {str("webhook_mode") === "custom"
                  ? "We'll register a webhook on your Jira instance via API"
                  : "Use our platform's shared webhook URL — just add it in your Jira admin"}
              </p>
            </div>

            <div className="config-section-title">Event Filter</div>
            <div className="form-group">
              <label>Trigger on Event</label>
              <select
                value={str("event_filter")}
                onChange={(e) => set("event_filter", e.target.value)}
              >
                <option value="">All events</option>
                <option value="jira:issue_created">Issue Created</option>
                <option value="jira:issue_updated">Issue Updated</option>
                <option value="jira:issue_deleted">Issue Deleted</option>
                <option value="comment_created">Comment Created</option>
                <option value="sprint_started">Sprint Started</option>
                <option value="sprint_closed">Sprint Closed</option>
                <option value="board_created">Board Created</option>
                <option value="jira:version_released">Version Released</option>
              </select>
            </div>

            <div className="form-group">
              <label>JQL Filter (optional)</label>
              <input
                type="text"
                value={str("jql_filter")}
                onChange={(e) => set("jql_filter", e.target.value)}
                placeholder='e.g. project = PROJ AND status = "To Do"'
              />
              <p className="field-hint">
                Only trigger when the Jira issue matches this JQL query
              </p>
            </div>

            {/* Platform mode */}
            {(str("webhook_mode") || "platform") === "platform" && (
              <div className="webhook-info">
                <h4>📡 Platform Webhook URL</h4>
                <p>Add this URL in your Jira Admin → System → WebHooks:</p>
                <code className="webhook-url">
                  http://YOUR_PUBLIC_URL:8081/webhooks/jira
                </code>
                <p className="field-hint">
                  All users share this endpoint. Use ngrok or deploy to a public
                  server. Event filtering is handled by this node's config.
                </p>
              </div>
            )}

            {/* Custom mode */}
            {str("webhook_mode") === "custom" && (
              <>
                <div className="config-section-title">
                  Your Jira Credentials
                </div>
                <div className="form-group">
                  <label>Jira Domain</label>
                  <input
                    type="text"
                    value={str("custom_jira_domain")}
                    onChange={(e) => set("custom_jira_domain", e.target.value)}
                    placeholder="yourcompany.atlassian.net"
                  />
                </div>
                <div className="form-group">
                  <label>Jira Email</label>
                  <input
                    type="email"
                    value={str("custom_jira_email")}
                    onChange={(e) => set("custom_jira_email", e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="form-group">
                  <label>Jira API Token</label>
                  <input
                    type="password"
                    value={str("custom_jira_api_token")}
                    onChange={(e) =>
                      set("custom_jira_api_token", e.target.value)
                    }
                    placeholder="Your Jira API token"
                  />
                  <p className="field-hint">
                    Generate at{" "}
                    <a
                      href="https://id.atlassian.com/manage-profile/security/api-tokens"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Atlassian API Tokens
                    </a>
                  </p>
                </div>
                <div className="form-group">
                  <label>Callback URL (your server)</label>
                  <input
                    type="text"
                    value={str("custom_webhook_url")}
                    onChange={(e) => set("custom_webhook_url", e.target.value)}
                    placeholder="https://your-server.com/webhooks/jira"
                  />
                  <p className="field-hint">
                    The public URL where Jira will send webhook events. Must be
                    reachable from the internet.
                  </p>
                </div>

                <div className="form-group">
                  <label>Subscribe to Events</label>
                  {[
                    { value: "jira:issue_created", label: "Issue Created" },
                    { value: "jira:issue_updated", label: "Issue Updated" },
                    { value: "jira:issue_deleted", label: "Issue Deleted" },
                    { value: "comment_created", label: "Comment Created" },
                    { value: "comment_updated", label: "Comment Updated" },
                    { value: "sprint_started", label: "Sprint Started" },
                    { value: "sprint_closed", label: "Sprint Closed" },
                  ].map((evt) => (
                    <label key={evt.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(
                          (formData.webhook_events as string[]) || []
                        ).includes(evt.value)}
                        onChange={(e) => {
                          const current =
                            (formData.webhook_events as string[]) || [];
                          if (e.target.checked) {
                            set("webhook_events", [...current, evt.value]);
                          } else {
                            set(
                              "webhook_events",
                              current.filter((v) => v !== evt.value),
                            );
                          }
                        }}
                      />
                      {evt.label}
                    </label>
                  ))}
                </div>

                <button
                  className="register-webhook-btn"
                  onClick={handleRegisterJiraWebhook}
                  disabled={
                    registering ||
                    !str("custom_jira_domain") ||
                    !str("custom_jira_email") ||
                    !str("custom_jira_api_token") ||
                    !str("custom_webhook_url")
                  }
                >
                  {registering
                    ? "Registering…"
                    : str("registered_webhook_id")
                      ? "🔄 Re-register Webhook"
                      : "🔗 Register Webhook on Jira"}
                </button>
                {registerResult && (
                  <p className="register-result">{registerResult}</p>
                )}
              </>
            )}
          </>
        )}

        {/* ==================== HTTP REQUEST ==================== */}
        {nodeType === "http_request" && (
          <>
            <div className="config-section-title">Request</div>
            <div className="form-group">
              <label>Method</label>
              <select
                value={str("method") || "GET"}
                onChange={(e) => set("method", e.target.value)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div className="form-group">
              <label>URL</label>
              <input
                type="text"
                value={str("url")}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://api.example.com/endpoint"
              />
              <p className="field-hint">
                Use <code>{"{{key}}"}</code> for dynamic values from previous
                nodes
              </p>
            </div>

            <div className="config-section-title">Headers</div>
            <div className="form-group">
              <label>Custom Headers (JSON)</label>
              <textarea
                value={str("headers_json")}
                onChange={(e) => set("headers_json", e.target.value)}
                placeholder={'{\n  "X-Custom-Header": "value"\n}'}
                rows={3}
              />
            </div>

            <div className="config-section-title">Authentication</div>
            <div className="form-group">
              <label>Auth Type</label>
              <select
                value={str("auth_type") || "none"}
                onChange={(e) => set("auth_type", e.target.value)}
              >
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api_key">API Key</option>
              </select>
            </div>

            {str("auth_type") === "bearer" && (
              <div className="form-group">
                <label>Bearer Token</label>
                <input
                  type="password"
                  value={str("auth_token")}
                  onChange={(e) => set("auth_token", e.target.value)}
                  placeholder="your-token-here"
                />
              </div>
            )}
            {str("auth_type") === "basic" && (
              <>
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={str("auth_username")}
                    onChange={(e) => set("auth_username", e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={str("auth_password")}
                    onChange={(e) => set("auth_password", e.target.value)}
                    placeholder="password"
                  />
                </div>
              </>
            )}
            {str("auth_type") === "api_key" && (
              <>
                <div className="form-group">
                  <label>Header Name</label>
                  <input
                    type="text"
                    value={str("api_key_header")}
                    onChange={(e) => set("api_key_header", e.target.value)}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={str("api_key_value")}
                    onChange={(e) => set("api_key_value", e.target.value)}
                    placeholder="your-api-key"
                  />
                </div>
              </>
            )}

            {(str("method") === "POST" ||
              str("method") === "PUT" ||
              str("method") === "PATCH") && (
              <>
                <div className="config-section-title">Request Body</div>
                <div className="form-group">
                  <label>Body</label>
                  <textarea
                    value={str("body")}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder={'{\n  "key": "value"\n}'}
                    rows={5}
                  />
                  <p className="field-hint">
                    JSON body. Use <code>{"{{key}}"}</code> for template
                    variables. Leave empty to forward input from previous node.
                  </p>
                </div>
              </>
            )}

            <div className="form-group">
              <label>Timeout (seconds)</label>
              <input
                type="number"
                value={str("timeout")}
                onChange={(e) => set("timeout", e.target.value)}
                placeholder="30"
              />
            </div>
          </>
        )}

        {/* ==================== JIRA CREATE ISSUE ==================== */}
        {nodeType === "jira_create_issue" && (
          <>
            <div className="config-section-title">Issue Details</div>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Uses Jira credentials from{" "}
              <strong>Settings → Integrations</strong>
            </p>
            <div className="form-group">
              <label>Project Key *</label>
              <input
                type="text"
                value={str("project_key")}
                onChange={(e) => set("project_key", e.target.value)}
                placeholder="e.g. PROJ, ENG, MYAPP"
              />
              <p className="field-hint">
                The project key from your Jira board (visible in issue IDs like
                PROJ-123)
              </p>
            </div>
            <div className="form-group">
              <label>Issue Type</label>
              <select
                value={str("issue_type") || "Task"}
                onChange={(e) => set("issue_type", e.target.value)}
              >
                <option value="Task">Task</option>
                <option value="Bug">Bug</option>
                <option value="Story">Story</option>
                <option value="Epic">Epic</option>
                <option value="Sub-task">Sub-task</option>
                <option value="Improvement">Improvement</option>
              </select>
            </div>
            <div className="form-group">
              <label>Summary *</label>
              <input
                type="text"
                value={str("summary")}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="e.g. New bug from webhook: {{summary}}"
              />
              <p className="field-hint">
                Use <code>{"{{key}}"}</code> to insert data from the previous
                node's output
              </p>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={str("description")}
                onChange={(e) => set("description", e.target.value)}
                placeholder={
                  "Detailed description…\n\nTriggered by: {{webhookEvent}}\nIssue: {{issue.key}}"
                }
                rows={5}
              />
            </div>

            <div className="config-section-title">Optional Fields</div>
            <div className="form-group">
              <label>Priority</label>
              <select
                value={str("priority")}
                onChange={(e) => set("priority", e.target.value)}
              >
                <option value="">Default</option>
                <option value="Highest">Highest</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Lowest">Lowest</option>
              </select>
            </div>
            <div className="form-group">
              <label>Assignee (account ID or email)</label>
              <input
                type="text"
                value={str("assignee")}
                onChange={(e) => set("assignee", e.target.value)}
                placeholder="e.g. 5b10ac8d82e05b22cc7d4ef5"
              />
            </div>
            <div className="form-group">
              <label>Labels (comma-separated)</label>
              <input
                type="text"
                value={str("labels")}
                onChange={(e) => set("labels", e.target.value)}
                placeholder="e.g. automated, workflow"
              />
            </div>
          </>
        )}

        {/* ==================== SLACK MESSAGE ==================== */}
        {nodeType === "slack_message" && (
          <>
            <div className="config-section-title">Message Configuration</div>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Uses Slack Bot Token from <strong>Settings → Integrations</strong>
              . Bot needs <code>chat:write</code> scope and must be invited to
              the channel.
            </p>
            <div className="form-group">
              <label>Channel *</label>
              <input
                type="text"
                value={str("channel")}
                onChange={(e) => set("channel", e.target.value)}
                placeholder="e.g. #general or C01ABCD1234"
              />
              <p className="field-hint">
                Channel name (with #) or channel ID. Bot must be a member.
              </p>
            </div>
            <div className="form-group">
              <label>Message *</label>
              <textarea
                value={str("message")}
                onChange={(e) => set("message", e.target.value)}
                placeholder={
                  "🚀 New issue created!\n\nProject: {{project_key}}\nSummary: {{summary}}\nLink: {{self}}"
                }
                rows={5}
              />
              <p className="field-hint">
                Supports Slack mrkdwn formatting. Use <code>{"{{key}}"}</code>{" "}
                for template variables.
              </p>
            </div>

            <div className="config-section-title">Advanced</div>
            <div className="form-group">
              <label>Bot Username Override</label>
              <input
                type="text"
                value={str("username")}
                onChange={(e) => set("username", e.target.value)}
                placeholder="Workflow Bot"
              />
            </div>
            <div className="form-group">
              <label>Icon Emoji</label>
              <input
                type="text"
                value={str("icon_emoji")}
                onChange={(e) => set("icon_emoji", e.target.value)}
                placeholder=":robot_face:"
              />
            </div>
            <div className="form-group">
              <label>Thread Timestamp (reply to thread)</label>
              <input
                type="text"
                value={str("thread_ts")}
                onChange={(e) => set("thread_ts", e.target.value)}
                placeholder="e.g. {{thread_ts}} or leave empty"
              />
              <p className="field-hint">
                Set to reply in a thread. Use <code>{"{{thread_ts}}"}</code>{" "}
                from a previous Slack response.
              </p>
            </div>
          </>
        )}

        {/* ==================== CONDITION ==================== */}
        {nodeType === "condition" && (
          <>
            <div className="config-section-title">Condition Logic</div>
            <div className="form-group">
              <label>Condition Type</label>
              <select
                value={str("condition_type") || "simple"}
                onChange={(e) => set("condition_type", e.target.value)}
              >
                <option value="simple">Simple Comparison</option>
                <option value="expression">JavaScript Expression</option>
              </select>
            </div>

            {(str("condition_type") || "simple") === "simple" && (
              <>
                <div className="form-group">
                  <label>Field</label>
                  <input
                    type="text"
                    value={str("field")}
                    onChange={(e) => set("field", e.target.value)}
                    placeholder="e.g. status_code, body.ok, issue.type"
                  />
                  <p className="field-hint">
                    Dot-notation path in the input data
                  </p>
                </div>
                <div className="form-group">
                  <label>Operator</label>
                  <select
                    value={str("operator") || "=="}
                    onChange={(e) => set("operator", e.target.value)}
                  >
                    <option value="==">Equals (==)</option>
                    <option value="!=">Not Equals (!=)</option>
                    <option value=">">Greater Than (&gt;)</option>
                    <option value="<">Less Than (&lt;)</option>
                    <option value=">=">Greater or Equal (&gt;=)</option>
                    <option value="<=">Less or Equal (&lt;=)</option>
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts With</option>
                    <option value="is_empty">Is Empty</option>
                    <option value="is_not_empty">Is Not Empty</option>
                  </select>
                </div>
                {!["is_empty", "is_not_empty"].includes(str("operator")) && (
                  <div className="form-group">
                    <label>Compare Value</label>
                    <input
                      type="text"
                      value={str("compare_value")}
                      onChange={(e) => set("compare_value", e.target.value)}
                      placeholder='e.g. 200, "Bug", true'
                    />
                  </div>
                )}
              </>
            )}

            {str("condition_type") === "expression" && (
              <div className="form-group">
                <label>Expression</label>
                <textarea
                  value={str("expression")}
                  onChange={(e) => set("expression", e.target.value)}
                  placeholder="e.g. input.status_code === 200 && input.body.ok === true"
                  rows={4}
                />
                <p className="field-hint">
                  JavaScript expression. Access input data via{" "}
                  <code>input.field</code>
                </p>
              </div>
            )}
          </>
        )}

        {/* ==================== TRANSFORM ==================== */}
        {nodeType === "transform" && (
          <>
            <div className="config-section-title">Data Transformation</div>
            <div className="form-group">
              <label>Transform Type</label>
              <select
                value={str("transform_type") || "jq"}
                onChange={(e) => set("transform_type", e.target.value)}
              >
                <option value="jq">Expression (jq-like)</option>
                <option value="mapping">Field Mapping</option>
                <option value="template">JSON Template</option>
              </select>
            </div>

            {(str("transform_type") || "jq") === "jq" && (
              <div className="form-group">
                <label>Expression</label>
                <textarea
                  value={str("expression")}
                  onChange={(e) => set("expression", e.target.value)}
                  placeholder="e.g. { result: input.body.data, count: input.body.total }"
                  rows={5}
                />
                <p className="field-hint">
                  Extract and reshape data. Input available as{" "}
                  <code>input</code>.
                </p>
              </div>
            )}

            {str("transform_type") === "mapping" && (
              <div className="form-group">
                <label>Field Mapping (JSON)</label>
                <textarea
                  value={str("mapping")}
                  onChange={(e) => set("mapping", e.target.value)}
                  placeholder={
                    '{\n  "ticket_id": "{{issue.key}}",\n  "summary": "{{issue.fields.summary}}",\n  "status": "{{issue.fields.status.name}}"\n}'
                  }
                  rows={6}
                />
                <p className="field-hint">
                  Map input fields to output fields using{" "}
                  <code>{"{{path}}"}</code>
                </p>
              </div>
            )}

            {str("transform_type") === "template" && (
              <div className="form-group">
                <label>JSON Template</label>
                <textarea
                  value={str("template")}
                  onChange={(e) => set("template", e.target.value)}
                  placeholder={
                    '{\n  "notification": {\n    "title": "{{summary}}",\n    "body": "{{description}}"\n  }\n}'
                  }
                  rows={6}
                />
                <p className="field-hint">
                  Output JSON with <code>{"{{key}}"}</code> placeholders
                </p>
              </div>
            )}
          </>
        )}

        {/* ==================== DELAY ==================== */}
        {nodeType === "delay" && (
          <>
            <div className="config-section-title">Delay Configuration</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Duration</label>
                <input
                  type="number"
                  value={str("delay")}
                  onChange={(e) => set("delay", e.target.value)}
                  placeholder="5"
                  min={0}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Unit</label>
                <select
                  value={str("delay_unit") || "s"}
                  onChange={(e) => set("delay_unit", e.target.value)}
                >
                  <option value="ms">Milliseconds</option>
                  <option value="s">Seconds</option>
                  <option value="m">Minutes</option>
                  <option value="h">Hours</option>
                </select>
              </div>
            </div>
            <p className="field-hint">
              Pause workflow execution for the specified duration
            </p>
          </>
        )}

        {/* ==================== END / OUTPUT ==================== */}
        {nodeType === "end" && (
          <>
            <div className="config-section-title">Output Configuration</div>
            <div className="form-group">
              <label>Output Mapping (optional)</label>
              <textarea
                value={str("output_mapping")}
                onChange={(e) => set("output_mapping", e.target.value)}
                placeholder={
                  '{\n  "result": "{{body}}",\n  "status": "{{status_code}}"\n}'
                }
                rows={5}
              />
              <p className="field-hint">
                Define the final output shape. Leave empty to pass through all
                data.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="config-footer">
        <button onClick={onClose} className="cancel-btn">
          Cancel
        </button>
        <button onClick={handleSave} className="save-config-btn">
          Save Configuration
        </button>
      </div>
    </div>
  );
};

// ==================== Dry-Run Modal ====================

interface DryRunModalProps {
  node: FlowNodeEntity;
  onClose: () => void;
}

const DryRunModal = ({ node, onClose }: DryRunModalProps) => {
  const nodeType = String(node?.getNodeRegistry?.()?.type || "");
  const nodeData =
    (node as unknown as { data?: Record<string, unknown> })?.data || {};
  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);

  const [testInput, setTestInput] = useState("{\n  \n}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);

  // Build hint for what input to provide based on node type
  const inputHint = useMemo(() => {
    switch (nodeType) {
      case "http_request":
        return '// Input is forwarded as request body for POST/PUT\n{\n  "example_key": "example_value"\n}';
      case "jira_create_issue":
        return '// Template variables available in summary/description\n{\n  "summary": "Test issue",\n  "webhookEvent": "jira:issue_created"\n}';
      case "slack_message":
        return '// Template variables available in message\n{\n  "project_key": "PROJ",\n  "summary": "Test summary",\n  "self": "https://example.atlassian.net/browse/PROJ-1"\n}';
      default:
        return "{}";
    }
  }, [nodeType]);

  // Set initial input hint
  useEffect(() => {
    setTestInput(inputHint);
  }, [inputHint]);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      // Parse the test input
      let parsedInput: unknown = {};
      try {
        // Strip JS-style comment lines (lines starting with //)
        const cleaned = testInput.replace(/^\s*\/\/.*$/gm, "").trim();
        parsedInput = JSON.parse(cleaned || "{}");
      } catch {
        setResult({
          success: false,
          error: "Invalid JSON input. Please check your test input.",
          output: null,
        });
        setRunning(false);
        return;
      }

      const res = await dryRunNode(nodeType, nodeData, parsedInput);
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Dry-run request failed",
        output: null,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: 560,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            background: nodeColors[nodeType] || "#4e40e5",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>{nodeConfig?.icon || "🧪"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              🧪 Test:{" "}
              {(nodeData.title as string) || nodeConfig?.label || nodeType}
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Dry run — no records saved to database
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 16,
              padding: "4px 10px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          {/* Node config summary */}
          <div
            style={{
              background: "#f7f8fa",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 6,
                color: "#374151",
                fontSize: 13,
              }}
            >
              Node Configuration
            </div>
            {Object.entries(nodeData)
              .filter(
                ([k]) =>
                  k !== "title" &&
                  !k.startsWith("custom_") &&
                  !k.startsWith("registered_") &&
                  !k.startsWith("auth_") &&
                  !k.startsWith("api_key"),
              )
              .map(([key, val]) => (
                <div
                  key={key}
                  style={{ display: "flex", gap: 8, marginBottom: 2 }}
                >
                  <span style={{ color: "#6b7280", minWidth: 100 }}>
                    {key}:
                  </span>
                  <span style={{ color: "#1c1f23", wordBreak: "break-all" }}>
                    {typeof val === "string"
                      ? val.length > 60
                        ? val.slice(0, 60) + "…"
                        : val || "(empty)"
                      : JSON.stringify(val)}
                  </span>
                </div>
              ))}
          </div>

          {/* Test Input */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: "#374151",
                display: "block",
                marginBottom: 6,
              }}
            >
              Test Input (JSON)
            </label>
            <p
              style={{
                fontSize: 11,
                color: "#6b7280",
                marginBottom: 6,
                marginTop: 0,
              }}
            >
              Simulates data coming from the previous node. Template variables
              like {"{{key}}"} in your config will be replaced with these
              values.
            </p>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              style={{
                width: "100%",
                height: 120,
                fontFamily: "monospace",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: 10,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Run Button */}
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              width: "100%",
              padding: "10px 0",
              background: running ? "#9ca3af" : "#38a169",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: running ? "not-allowed" : "pointer",
              marginBottom: 16,
              transition: "background 0.15s",
            }}
          >
            {running ? "⏳ Running…" : "▶ Run Test"}
          </button>

          {/* Result */}
          {result && (
            <div
              style={{
                borderRadius: 10,
                border: `2px solid ${result.success ? "#38a169" : "#e53e3e"}`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: result.success ? "#f0fff4" : "#fff5f5",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  color: result.success ? "#22543d" : "#742a2a",
                }}
              >
                <span>{result.success ? "✅" : "❌"}</span>
                <span>{result.success ? "Test Passed" : "Test Failed"}</span>
              </div>

              {result.error && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#fff5f5",
                    color: "#c53030",
                    fontSize: 12,
                    borderTop: "1px solid #fed7d7",
                  }}
                >
                  <strong>Error:</strong> {result.error}
                </div>
              )}

              {result.output != null && (
                <div style={{ borderTop: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      padding: "8px 14px",
                      fontWeight: 600,
                      fontSize: 12,
                      color: "#374151",
                      background: "#f9fafb",
                    }}
                  >
                    Output Preview
                  </div>
                  <pre
                    style={{
                      padding: "10px 14px",
                      margin: 0,
                      fontSize: 11,
                      fontFamily: "monospace",
                      background: "#1a202c",
                      color: "#e2e8f0",
                      overflowX: "auto",
                      maxHeight: 250,
                      overflowY: "auto",
                    }}
                  >
                    {JSON.stringify(result.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== Main Editor Component ====================

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

const WorkflowEditor = ({ workflowId, onBack }: WorkflowEditorProps) => {
  const [workflowName, setWorkflowName] = useState("Loading…");
  const [workflowStatus, setWorkflowStatus] = useState("draft");
  const [runs, setRuns] = useState<ApiWorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [logs, setLogs] = useState<ApiNodeLog[]>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNodeEntity | null>(null);
  const [dryRunNode, setDryRunNode] = useState<FlowNodeEntity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedData, setLoadedData] = useState<WorkflowJSON | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const editorContextRef = useRef<FreeLayoutPluginContext | null>(null);
  const workflowNameRef = useRef(workflowName);
  const workflowStatusRef = useRef(workflowStatus);

  // Keep the ref in sync
  useEffect(() => {
    workflowNameRef.current = workflowName;
  }, [workflowName]);

  useEffect(() => {
    workflowStatusRef.current = workflowStatus;
  }, [workflowStatus]);

  // Load workflow from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wf = await getWorkflow(workflowId);
        if (cancelled) return;
        setWorkflowName(wf.name);
        setWorkflowStatus(wf.status || "draft");

        // Parse nodes/edges — they come as JSON from the backend
        let nodes: unknown[] = [];
        let edges: unknown[] = [];
        try {
          nodes =
            typeof wf.nodes === "string" ? JSON.parse(wf.nodes) : wf.nodes;
          edges =
            typeof wf.edges === "string" ? JSON.parse(wf.edges) : wf.edges;
        } catch {
          /* keep defaults */
        }

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
          // Brand new workflow — seed with a start node
          setLoadedData(initialData as WorkflowJSON);
        } else {
          setLoadedData({ nodes, edges: edges ?? [] } as WorkflowJSON);
        }
      } catch (err) {
        console.error("Failed to load workflow:", err);
        setLoadedData(initialData as WorkflowJSON);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  // Helper: merge custom node data into toJSON() nodes (which have correct positions)
  const buildNodesForSave = (ctx: FreeLayoutPluginContext) => {
    const workflowJSON = ctx.document.toJSON();
    const allNodes = ctx.document.getAllNodes();

    // Build a map of custom data from in-memory nodes
    const dataMap = new Map<string, Record<string, unknown>>();
    allNodes.forEach((n) => {
      const nAny = n as unknown as { data?: Record<string, unknown> };
      if (nAny.data) dataMap.set(n.id, nAny.data);
    });

    // Merge custom data into the toJSON() nodes (which have correct positions)
    const jsonNodes = workflowJSON.nodes as unknown as Array<
      Record<string, unknown>
    >;
    const mergedNodes = jsonNodes.map((jsonNode) => {
      const nodeId = jsonNode.id as string;
      const customData = dataMap.get(nodeId) || {};
      return {
        ...jsonNode,
        data: {
          ...((jsonNode.data as Record<string, unknown>) || {}),
          ...customData,
        },
      };
    });

    return { nodes: mergedNodes, edges: workflowJSON.edges };
  };

  // Auto-save to API every 5 seconds
  const saveToApi = useCallback(async () => {
    const ctx = editorContextRef.current;
    if (!ctx) return;

    const { nodes, edges } = buildNodesForSave(ctx);

    setIsSaving(true);
    try {
      await updateWorkflow(workflowId, {
        name: workflowNameRef.current,
        description: "",
        nodes,
        edges,
        status: workflowStatusRef.current,
      });
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [workflowId]);

  useEffect(() => {
    const interval = setInterval(() => {
      saveToApi();
    }, 5000);
    return () => clearInterval(interval);
  }, [saveToApi]);

  // Publish workflow
  const handlePublish = useCallback(async () => {
    const ctx = editorContextRef.current;
    if (!ctx) return;

    const { nodes, edges } = buildNodesForSave(ctx);

    try {
      await updateWorkflow(workflowId, {
        name: workflowNameRef.current,
        description: "",
        nodes,
        edges,
        status: "active",
      });
      setWorkflowStatus("active");
      onBack(); // navigate back to listing
    } catch (err) {
      console.error("Publish failed:", err);
      alert("Failed to publish workflow");
    }
  }, [workflowId, onBack]);

  const loadRuns = async () => {
    try {
      const data = await fetchRunsApi();
      setRuns(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestRun = async () => {
    try {
      // Save current state first
      await saveToApi();
      // Trigger a run regardless of workflow status
      const result = await runWorkflowApi(workflowId, {});
      // Reload the runs list to show the new run
      await loadRuns();

      // Auto-open logs for the new run after a brief delay
      // (wait for backend to finish processing)
      setTimeout(async () => {
        try {
          await loadLogs(result.run_id);
        } catch (err) {
          console.error("Failed to load logs:", err);
        }
      }, 1500);
    } catch (err) {
      console.error("Test run failed:", err);
      alert(
        "Test run failed: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const loadLogs = async (runId: string) => {
    try {
      console.log("Loading logs for run:", runId);
      const data = await fetchRunLogsApi(runId);
      console.log("Logs loaded:", data);
      setLogs(data);
      setSelectedRun(runId);
    } catch (err) {
      console.error("Failed to load logs:", err);
      alert(
        "Failed to load logs: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const handleUpdateNode = async (
    nodeId: string,
    data: Record<string, unknown>,
  ) => {
    const ctx = editorContextRef.current;
    if (!ctx) return;

    const allNodes = ctx.document.getAllNodes();
    const node = allNodes.find((n) => n.id === nodeId);
    if (node) {
      const nodeAny = node as unknown as { data?: Record<string, unknown> };
      if (!nodeAny.data) nodeAny.data = {};
      Object.assign(nodeAny.data, data);

      console.log("Node data updated, saving to database...", { nodeId, data });

      const { nodes, edges } = buildNodesForSave(ctx);

      console.log("Saving nodes with data:", JSON.stringify(nodes, null, 2));

      try {
        await updateWorkflow(workflowId, {
          name: workflowNameRef.current,
          description: "",
          nodes,
          edges,
          status: workflowStatusRef.current,
        });
        console.log("Node configuration saved successfully");
      } catch (err) {
        console.error("Failed to save node configuration:", err);
      }
    }
  };

  const editorProps = useMemo<FreeLayoutProps>(
    () => ({
      initialData: loadedData ?? (initialData as WorkflowJSON),
      onAllLayersRendered: (ctx) => {
        editorContextRef.current = ctx;

        // If we loaded data from API that had real nodes, apply it
        if (loadedData && loadedData.nodes.length > 0) {
          try {
            ctx.document.clear();
            ctx.document.fromJSON(loadedData);

            // Manually restore the data property on each node after fromJSON
            const allNodes = ctx.document.getAllNodes();
            const loadedNodesArray = loadedData.nodes as Array<{
              id: string;
              data?: Record<string, unknown>;
            }>;

            console.log(
              "Restoring node data from loaded workflow:",
              loadedNodesArray,
            );

            allNodes.forEach((node) => {
              const loadedNode = loadedNodesArray.find((n) => n.id === node.id);
              if (loadedNode && loadedNode.data) {
                const nodeAny = node as unknown as {
                  data?: Record<string, unknown>;
                };
                nodeAny.data = { ...loadedNode.data };
                console.log(
                  `Restored data for node ${node.id}:`,
                  loadedNode.data,
                );
              }
            });
          } catch (err) {
            console.error("Failed to load workflow into editor:", err);
          }
        } else {
          setTimeout(() => ctx.tools.fitView(false), 100);
        }
      },
      onNodeDoubleClick: (node: FlowNodeEntity) => {
        // Start nodes have no config — skip
        const type = String(node.getNodeRegistry?.()?.type || "");
        if (type === "start") return;
        setSelectedNode(node);
      },
      materials: {
        renderDefaultNode: NodeRender,
      },
      nodeRegistries: nodeTypesList.map((node) => ({
        type: node.type,
        meta: { defaultExpanded: true },
        input:
          node.type === "start" || node.type === "jira_webhook"
            ? undefined
            : ["input"],
        output: node.type === "end" ? undefined : ["output"],
      })),
      canDeleteNode: () => true,
      canDeleteLine: () => true,
      nodeEngine: { enable: true },
      history: { enable: true, enableChangeNode: true },
      getNodeDefaultRegistry(type) {
        return {
          type,
          meta: { defaultExpanded: true },
          formMeta: {
            render: () => (
              <Field<string> name="title">
                {({ field }) => (
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    {field.value || "Configure this node..."}
                  </div>
                )}
              </Field>
            ),
          },
        };
      },
    }),
    [loadedData],
  );

  if (isLoading) {
    return (
      <div className="editor-loading">
        <p>Loading workflow…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <NodeSelectionContext.Provider
        value={{ setSelectedNode, openDryRun: (n) => setDryRunNode(n) }}
      >
        <FreeLayoutEditorProvider {...editorProps}>
          <EditorSidebar
            workflowName={workflowName}
            setWorkflowName={setWorkflowName}
            runs={runs}
            selectedRun={selectedRun}
            logs={logs}
            isSaving={isSaving}
            onPublish={handlePublish}
            onBack={onBack}
            onTestRun={handleTestRun}
            onLoadRuns={loadRuns}
            onLoadLogs={loadLogs}
            onCloseLog={() => setSelectedRun(null)}
          />
          <div className="editor">
            <EditorRenderer className="flowgram-editor" />
            <Tools />
          </div>
          {selectedNode && (
            <NodeConfigDrawer
              key={selectedNode.id}
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onUpdate={handleUpdateNode}
            />
          )}
          {dryRunNode && (
            <DryRunModal
              key={`dry-${dryRunNode.id}`}
              node={dryRunNode}
              onClose={() => setDryRunNode(null)}
            />
          )}
        </FreeLayoutEditorProvider>
      </NodeSelectionContext.Provider>
    </div>
  );
};

// ==================== App Root ====================

type Page =
  | { view: "listing" }
  | { view: "editor"; workflowId: string }
  | { view: "settings" };

function App() {
  const [page, setPage] = useState<Page>({ view: "listing" });

  if (page.view === "editor") {
    return (
      <WorkflowEditor
        key={page.workflowId}
        workflowId={page.workflowId}
        onBack={() => setPage({ view: "listing" })}
      />
    );
  }

  if (page.view === "settings") {
    return <IntegrationSettings onBack={() => setPage({ view: "listing" })} />;
  }

  return (
    <WorkflowListing
      onOpenWorkflow={(id) => setPage({ view: "editor", workflowId: id })}
      onOpenSettings={() => setPage({ view: "settings" })}
    />
  );
}

export default App;
