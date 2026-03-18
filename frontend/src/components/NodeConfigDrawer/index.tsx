import { useState, useEffect } from "react";
import type { FlowNodeEntity } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList } from "../../constants/nodeTypes";
import { getNodeSchemas, type NodeSchema, type SchemaField } from "../../api";
import { DynamicNodeConfig } from "./DynamicNodeConfig";
import { JiraWebhookConfig } from "./JiraWebhookConfig";

interface NodeConfigDrawerProps {
  node: FlowNodeEntity;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

// Types that keep their hardcoded config component (they have special UI logic
// beyond simple form fields, e.g. webhook registration button)
const HARDCODED_TYPES = new Set(["jira_webhook"]);

// Build initial form data using schema defaults when available
function buildInitialFormData(
  nodeType: string,
  rawData: Record<string, unknown>,
  schemaFields?: SchemaField[],
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...rawData };

  // Apply defaults from schema fields
  if (schemaFields) {
    for (const field of schemaFields) {
      if (field.default !== undefined && data[field.key] === undefined) {
        data[field.key] = field.default;
      }
    }
  }

  // Legacy hardcoded defaults (for types without schema or missing fields)
  if (nodeType === "jira_webhook") {
    if (!data.webhook_mode) data.webhook_mode = "platform";
    if (!data.event_filter) data.event_filter = "";
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

  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [schemasLoaded, setSchemasLoaded] = useState(false);

  // Fetch schemas once on mount
  useEffect(() => {
    getNodeSchemas()
      .then((s) => setSchemas(s))
      .catch(() => setSchemas([]))
      .finally(() => setSchemasLoaded(true));
  }, []);

  const currentSchema = schemas.find((s) => s.type === nodeType);

  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    buildInitialFormData(nodeType, rawData),
  );

  // Re-apply schema defaults once schemas are loaded
  useEffect(() => {
    if (schemasLoaded && currentSchema) {
      setFormData((prev) => {
        const updated = { ...prev };
        for (const field of currentSchema.fields) {
          if (field.default !== undefined && updated[field.key] === undefined) {
            updated[field.key] = field.default;
          }
        }
        return updated;
      });
    }
  }, [schemasLoaded, currentSchema]);

  const set = (key: string, val: unknown) =>
    setFormData((prev) => ({ ...prev, [key]: val }));
  const str = (key: string) => (formData[key] as string) || "";

  const handleSave = () => {
    onUpdate(node.id, formData);
    onClose();
  };

  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);
  const configProps = { str, set, formData };

  // Decide whether to render dynamic or hardcoded config
  const useDynamic =
    schemasLoaded && currentSchema && !HARDCODED_TYPES.has(nodeType);

  return (
    <div className="config-drawer">
      <div className="config-header">
        <h3>
          {currentSchema?.icon || nodeConfig?.icon} Configure{" "}
          {currentSchema?.label || nodeConfig?.label}
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
            placeholder={
              currentSchema?.label || nodeConfig?.label || "Enter node title"
            }
          />
          <p className="field-hint">Custom display name for this node</p>
        </div>

        {/* Schema-driven dynamic config */}
        {useDynamic && (
          <DynamicNodeConfig
            fields={currentSchema.fields}
            nodeType={nodeType}
            {...configProps}
          />
        )}

        {/* Hardcoded fallback for special types */}
        {nodeType === "jira_webhook" && <JiraWebhookConfig {...configProps} />}
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
