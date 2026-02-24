// Shared node type definitions used across all components

export interface NodeTypeInfo {
  type: string;
  label: string;
  icon: string;
}

// Props shared by all node config panel components
export interface NodeConfigProps {
  str: (key: string) => string;
  set: (key: string, val: unknown) => void;
  formData: Record<string, unknown>;
}

// Node types available for adding
export const nodeTypesList: NodeTypeInfo[] = [
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
export const nodeColors: Record<string, string> = {
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
