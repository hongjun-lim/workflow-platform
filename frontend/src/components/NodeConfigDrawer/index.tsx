import { useState } from "react";
import type { FlowNodeEntity } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList } from "../../constants/nodeTypes";
import { StartConfig } from "./StartConfig";
import { JiraWebhookConfig } from "./JiraWebhookConfig";
import { HttpRequestConfig } from "./HttpRequestConfig";
import { JiraCreateIssueConfig } from "./JiraCreateIssueConfig";
import { SlackMessageConfig } from "./SlackMessageConfig";
import { ConditionConfig } from "./ConditionConfig";
import { TransformConfig } from "./TransformConfig";
import { DelayConfig } from "./DelayConfig";
import { EndConfig } from "./EndConfig";

interface NodeConfigDrawerProps {
  node: FlowNodeEntity;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

// Build initial form data with defaults so dropdown values are always saved
function buildInitialFormData(
  nodeType: string,
  rawData: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...rawData };

  if (nodeType === "jira_webhook") {
    if (!data.webhook_mode) data.webhook_mode = "platform";
    if (!data.event_filter) data.event_filter = "";
  }

  if (nodeType === "jira_create_issue") {
    if (!data.issue_type) data.issue_type = "Task";
    if (!data.priority) data.priority = "";
    if (!data.jira_mode) data.jira_mode = "basic";
  }

  if (nodeType === "http_request") {
    if (!data.method) data.method = "GET";
    if (!data.auth_type) data.auth_type = "none";
  }

  if (nodeType === "start") {
    if (!data.trigger_type) data.trigger_type = "schedule";
    if (!data.cron_schedule) data.cron_schedule = "";
  }

  return data;
}

export const NodeConfigDrawer = ({
  node,
  onClose,
  onUpdate,
}: NodeConfigDrawerProps) => {
  const nodeType = String(node?.getNodeRegistry?.()?.type || "");
  const rawData =
    (node as unknown as { data?: Record<string, unknown> })?.data || {};

  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    buildInitialFormData(nodeType, rawData),
  );

  const set = (key: string, val: unknown) =>
    setFormData((prev) => ({ ...prev, [key]: val }));
  const str = (key: string) => (formData[key] as string) || "";

  const handleSave = () => {
    onUpdate(node.id, formData);
    onClose();
  };

  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);
  const configProps = { str, set, formData };

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
        {/* Common: Node Title */}
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

        {/* Delegate to node-specific config */}
        {nodeType === "start" && <StartConfig {...configProps} />}
        {nodeType === "jira_webhook" && <JiraWebhookConfig {...configProps} />}
        {nodeType === "http_request" && <HttpRequestConfig {...configProps} />}
        {nodeType === "jira_create_issue" && (
          <JiraCreateIssueConfig {...configProps} />
        )}
        {nodeType === "slack_message" && (
          <SlackMessageConfig {...configProps} />
        )}
        {nodeType === "condition" && <ConditionConfig {...configProps} />}
        {nodeType === "transform" && <TransformConfig {...configProps} />}
        {nodeType === "delay" && <DelayConfig {...configProps} />}
        {nodeType === "end" && <EndConfig {...configProps} />}
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
