import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import "@flowgram.ai/free-layout-editor/index.css";
import {
  FreeLayoutEditorProvider,
  EditorRenderer,
  Field,
} from "@flowgram.ai/free-layout-editor";
import type {
  FreeLayoutProps,
  FreeLayoutPluginContext,
  FlowNodeEntity,
  WorkflowJSON,
} from "@flowgram.ai/free-layout-editor";
import WorkflowListing from "./WorkflowListing";
import IntegrationSettings from "./IntegrationSettings";
import {
  getWorkflow,
  updateWorkflow,
  getRuns as fetchRunsApi,
  getRunLogs as fetchRunLogsApi,
  runWorkflow as runWorkflowApi,
} from "./api";
import type {
  WorkflowRun as ApiWorkflowRun,
  NodeLog as ApiNodeLog,
} from "./api";
import "./App.css";

import { nodeTypesList } from "./constants/nodeTypes";
import { NodeSelectionContext } from "./contexts/NodeSelectionContext";
import { NodeRender } from "./components/NodeRender";
import { Tools } from "./components/Tools";
import { EditorSidebar } from "./components/EditorSidebar";
import { NodeConfigDrawer } from "./components/NodeConfigDrawer";
import { DryRunModal } from "./components/DryRunModal";

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

    const dataMap = new Map<string, Record<string, unknown>>();
    allNodes.forEach((n) => {
      const nAny = n as unknown as { data?: Record<string, unknown> };
      if (nAny.data) dataMap.set(n.id, nAny.data);
    });

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
      onBack();
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
      await saveToApi();
      const result = await runWorkflowApi(workflowId, {});
      await loadRuns();

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

        if (loadedData && loadedData.nodes.length > 0) {
          try {
            ctx.document.clear();
            ctx.document.fromJSON(loadedData);

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
