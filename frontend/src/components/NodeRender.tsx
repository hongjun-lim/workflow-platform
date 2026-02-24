import { useContext } from "react";
import {
  useNodeRender,
  WorkflowNodeRenderer,
} from "@flowgram.ai/free-layout-editor";
import type { WorkflowNodeProps } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList, nodeColors } from "../constants/nodeTypes";
import { NodeSelectionContext } from "../contexts/NodeSelectionContext";

// Helper: build summary lines for a node based on its type and data
export function getNodeSummaryLines(
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
      if (str("jira_mode") === "advanced")
        lines.push({ label: "Mode", value: "Advanced (Raw JSON)" });
      if (str("project_key"))
        lines.push({ label: "Project", value: str("project_key") });
      if (str("issue_type") && str("jira_mode") !== "advanced")
        lines.push({ label: "Type", value: str("issue_type") });
      if (str("summary") && str("jira_mode") !== "advanced")
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

export const NodeRender = (props: WorkflowNodeProps) => {
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
        <div style={{ display: "none" }}>{form?.render()}</div>
      </div>
    </WorkflowNodeRenderer>
  );
};
