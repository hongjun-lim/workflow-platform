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
} from "@flowgram.ai/free-layout-editor";
import type { WorkflowJSON } from "@flowgram.ai/free-layout-editor";
import WorkflowListing from "./WorkflowListing";
import {
  getWorkflow,
  updateWorkflow,
  getRuns as fetchRunsApi,
  getRunLogs as fetchRunLogsApi,
} from "./api";
import type {
  WorkflowRun as ApiWorkflowRun,
  NodeLog as ApiNodeLog,
} from "./api";
import "./App.css";

// Context for node selection
interface FlowNodeEntity {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  meta?: { position?: { x: number; y: number } };
  getNodeMeta?: () => { position?: { x: number; y: number } };
}

const NodeSelectionContext = createContext<{
  setSelectedNode: (node: FlowNodeEntity | null) => void;
} | null>(null);

// Node types available for adding
const nodeTypesList = [
  { type: "start", label: "Start Trigger", icon: "🚀" },
  { type: "http_request", label: "HTTP Request", icon: "🌐" },
  { type: "condition", label: "Condition", icon: "🔀" },
  { type: "transform", label: "Transform Data", icon: "🔄" },
  { type: "delay", label: "Delay", icon: "⏱️" },
  { type: "end", label: "Output", icon: "📤" },
];

// Node colors by type
const nodeColors: Record<string, string> = {
  start: "#667eea",
  http_request: "#4299e1",
  condition: "#ed8936",
  transform: "#48bb78",
  delay: "#9f7aea",
  end: "#f56565",
};

// ==================== Custom Node Renderer ====================

const NodeRender = (props: WorkflowNodeProps) => {
  const { form, selected } = useNodeRender();
  const nodeType = props.node.getNodeRegistry()?.type || "custom";
  const borderColor = selected ? "#4e40e5" : "rgba(6, 7, 9, 0.15)";
  const accentColor = nodeColors[nodeType] || "#4e40e5";
  const nodeSelectionContext = useContext(NodeSelectionContext);

  const handleNodeClick = () => {
    if (nodeSelectionContext) {
      nodeSelectionContext.setSelectedNode(props.node);
    }
  };

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
        <span>
          {nodeTypesList.find((n) => n.type === nodeType)?.label || nodeType}
        </span>
      </div>
      <div
        style={{
          padding: "12px 14px",
          color: "#1c1f23",
          fontSize: 13,
          cursor: "pointer",
        }}
        onClick={handleNodeClick}
      >
        {form?.render()}
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
  logs,
  isSaving,
  onPublish,
  onBack,
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
          <button onClick={onLoadRuns} className="load-btn">
            📋 Load Runs
          </button>
        </div>

        {runs.length > 0 && (
          <div className="section">
            <h3>Execution Runs</h3>
            {runs.map((run) => (
              <div key={run.id} className="run-item">
                <span className={`status ${run.status}`}>{run.status}</span>
                <button onClick={() => onLoadLogs(run.id)}>View Logs</button>
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
          {logs.map((log) => (
            <div key={log.id} className={`log-item ${log.status}`}>
              <div className="log-header">
                <span className="node-name">{log.node_name}</span>
                <span className="node-type">{log.node_type}</span>
                <span className={`status ${log.status}`}>{log.status}</span>
              </div>
              <details>
                <summary>Input</summary>
                <pre>{JSON.stringify(log.input, null, 2)}</pre>
              </details>
              <details>
                <summary>Output</summary>
                <pre>{JSON.stringify(log.output, null, 2)}</pre>
              </details>
            </div>
          ))}
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
  const [formData, setFormData] = useState<Record<string, unknown>>({
    ...(node?.data || {}),
  });

  const handleSave = () => {
    onUpdate(node.id, formData);
    onClose();
  };

  const nodeType = node?.type;
  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);

  return (
    <div className="config-drawer">
      <div className="config-header">
        <h3>
          {nodeConfig?.icon} Configure {nodeConfig?.label} (ID: {node.id})
        </h3>
        <button onClick={onClose} className="close-btn">
          ✕
        </button>
      </div>

      <div className="config-body">
        <div className="form-group">
          <label>Node Title</label>
          <input
            type="text"
            value={(formData.title as string) || ""}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            placeholder="Enter node title"
          />
        </div>

        {nodeType === "http_request" && (
          <>
            <div className="form-group">
              <label>URL</label>
              <input
                type="text"
                value={(formData.url as string) || ""}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.target.value })
                }
                placeholder="https://api.example.com/endpoint"
              />
            </div>
            <div className="form-group">
              <label>Method</label>
              <select
                value={(formData.method as string) || "GET"}
                onChange={(e) =>
                  setFormData({ ...formData, method: e.target.value })
                }
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <div className="form-group">
            <label>Condition</label>
            <input
              type="text"
              value={(formData.condition as string) || ""}
              onChange={(e) =>
                setFormData({ ...formData, condition: e.target.value })
              }
              placeholder="e.g., response.status === 200"
            />
          </div>
        )}

        {nodeType === "transform" && (
          <div className="form-group">
            <label>Transform Expression</label>
            <textarea
              value={(formData.expression as string) || ""}
              onChange={(e) =>
                setFormData({ ...formData, expression: e.target.value })
              }
              placeholder="e.g., { result: data.value * 2 }"
              rows={4}
            />
          </div>
        )}

        {nodeType === "delay" && (
          <div className="form-group">
            <label>Delay (milliseconds)</label>
            <input
              type="number"
              value={(formData.delay as string) || ""}
              onChange={(e) =>
                setFormData({ ...formData, delay: e.target.value })
              }
              placeholder="1000"
            />
          </div>
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

// ==================== Main Editor Component ====================

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

const WorkflowEditor = ({ workflowId, onBack }: WorkflowEditorProps) => {
  const [workflowName, setWorkflowName] = useState("Loading…");
  const [runs, setRuns] = useState<ApiWorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [logs, setLogs] = useState<ApiNodeLog[]>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNodeEntity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedData, setLoadedData] = useState<WorkflowJSON | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const editorContextRef = useRef<FreeLayoutPluginContext | null>(null);
  const workflowNameRef = useRef(workflowName);

  // Keep the ref in sync
  useEffect(() => {
    workflowNameRef.current = workflowName;
  }, [workflowName]);

  // Load workflow from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wf = await getWorkflow(workflowId);
        if (cancelled) return;
        setWorkflowName(wf.name);

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

  // Auto-save to API every 5 seconds
  const saveToApi = useCallback(async () => {
    const ctx = editorContextRef.current;
    if (!ctx) return;

    const workflowJSON = ctx.document.toJSON();
    setIsSaving(true);
    try {
      await updateWorkflow(workflowId, {
        name: workflowNameRef.current,
        description: "",
        nodes: workflowJSON.nodes,
        edges: workflowJSON.edges,
        status: "draft",
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

    const workflowJSON = ctx.document.toJSON();
    try {
      await updateWorkflow(workflowId, {
        name: workflowNameRef.current,
        description: "",
        nodes: workflowJSON.nodes,
        edges: workflowJSON.edges,
        status: "active",
      });
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

  const loadLogs = async (runId: string) => {
    try {
      const data = await fetchRunLogsApi(runId);
      setLogs(data);
      setSelectedRun(runId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateNode = (nodeId: string, data: Record<string, unknown>) => {
    const ctx = editorContextRef.current;
    if (!ctx) return;

    const allNodes = ctx.document.getAllNodes();
    const node = allNodes.find((n: FlowNodeEntity) => n.id === nodeId);
    if (node) {
      const nodeAny = node as unknown as { data?: Record<string, unknown> };
      if (!nodeAny.data) nodeAny.data = {};
      Object.assign(nodeAny.data, data);
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
          } catch (err) {
            console.error("Failed to load workflow into editor:", err);
          }
        } else {
          setTimeout(() => ctx.tools.fitView(false), 100);
        }
      },
      onNodeDoubleClick: (node: FlowNodeEntity) => {
        setSelectedNode(node);
      },
      materials: {
        renderDefaultNode: NodeRender,
      },
      nodeRegistries: nodeTypesList.map((node) => ({
        type: node.type,
        meta: { defaultExpanded: true },
        input: node.type === "start" ? undefined : ["input"],
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
      <NodeSelectionContext.Provider value={{ setSelectedNode }}>
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
        </FreeLayoutEditorProvider>
      </NodeSelectionContext.Provider>
    </div>
  );
};

// ==================== App Root ====================

type Page = { view: "listing" } | { view: "editor"; workflowId: string };

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

  return (
    <WorkflowListing
      onOpenWorkflow={(id) => setPage({ view: "editor", workflowId: id })}
    />
  );
}

export default App;
