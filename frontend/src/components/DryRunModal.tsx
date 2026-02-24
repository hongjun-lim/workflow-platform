import { useState, useMemo, useEffect } from "react";
import type { FlowNodeEntity } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList, nodeColors } from "../constants/nodeTypes";
import { dryRunNode } from "../api";
import type { DryRunResult } from "../api";

interface DryRunModalProps {
  node: FlowNodeEntity;
  onClose: () => void;
}

export const DryRunModal = ({ node, onClose }: DryRunModalProps) => {
  const nodeType = String(node?.getNodeRegistry?.()?.type || "");
  const nodeData =
    (node as unknown as { data?: Record<string, unknown> })?.data || {};
  const nodeConfig = nodeTypesList.find((n) => n.type === nodeType);

  const [testInput, setTestInput] = useState("{\n  \n}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);

  const inputHint = useMemo(() => {
    switch (nodeType) {
      case "http_request":
        return '// Input is forwarded as request body for POST/PUT\n{\n  "example_key": "example_value"\n}';
      case "jira_create_issue":
        return '// Template variables available via {{key}} syntax\n{\n  "summary": "Test issue",\n  "webhookEvent": "jira:issue_created",\n  "issue": { "key": "PROJ-123" }\n}';
      case "slack_message":
        return '// Template variables available in message\n{\n  "project_key": "PROJ",\n  "summary": "Test summary",\n  "self": "https://example.atlassian.net/browse/PROJ-1"\n}';
      default:
        return "{}";
    }
  }, [nodeType]);

  useEffect(() => {
    setTestInput(inputHint);
  }, [inputHint]);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      let parsedInput: unknown = {};
      try {
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
