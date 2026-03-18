import { useState, useEffect, useCallback } from "react";
import yaml from "js-yaml";
import {
  getNodeSchemas,
  upsertNodeSchema,
  deleteNodeSchema,
  type NodeSchema,
  type SchemaField,
  type ExecuteConfig,
} from "./api";

interface Props {
  onBack: () => void;
}

// ─── YAML serialisation helpers ─────────────────────────────────────────────

interface YamlDoc {
  label?: string;
  icon?: string;
  color?: string;
  category?: string;
  description?: string;
  auth_type?: string | null;
  is_trigger?: boolean;
  fields?: SchemaField[];
  execute?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

function schemaToYaml(s: NodeSchema): string {
  const doc: YamlDoc = {
    label: s.label,
    icon: s.icon,
    color: s.color,
    category: s.category || undefined,
    description: s.description || undefined,
    auth_type: s.auth_type || undefined,
    is_trigger: s.is_trigger || undefined,
    fields: s.fields.length ? s.fields : undefined,
  };
  if (s.execute_config) {
    doc.execute = {
      url: s.execute_config.url,
      method: s.execute_config.method,
      headers: s.execute_config.headers,
      body: s.execute_config.body,
    };
  }
  return yaml.dump(doc, {
    lineWidth: 100,
    quotingType: '"',
    forceQuotes: false,
  });
}

function emptyYaml(): string {
  return yaml.dump(
    {
      label: "My Service",
      icon: "🔌",
      color: "#667eea",
      category: "Custom",
      description: "What this node does",
      fields: [
        {
          key: "api_key",
          label: "API Key",
          type: "password",
          required: true,
          hint: "Use {{env.MY_API_KEY}} for environment variables",
        },
        {
          key: "message",
          label: "Message",
          type: "text",
          required: true,
          placeholder: "Enter your message here",
        },
      ],
      execute: {
        url: "https://api.example.com/endpoint",
        method: "POST",
        headers: {
          Authorization: "Bearer {{api_key}}",
          "Content-Type": "application/json",
        },
        body: '{"message": "{{message}}"}',
      },
    },
    { lineWidth: 100 },
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────

function FieldPreview({ field }: { field: SchemaField }) {
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "#ccc",
  };
  const inputStyle: React.CSSProperties = {
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#e0e0e0",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={labelStyle}>
        {field.label}
        {field.required && (
          <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>
        )}
      </label>
      {field.type === "textarea" || field.type === "code" ? (
        <textarea
          disabled
          rows={3}
          placeholder={field.placeholder || ""}
          style={{
            ...inputStyle,
            resize: "vertical",
            fontFamily: field.type === "code" ? "monospace" : undefined,
          }}
        />
      ) : field.type === "select" ? (
        <select disabled style={inputStyle}>
          {(field.options || []).map((o) => (
            <option key={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#ccc",
            fontSize: 13,
          }}
        >
          <input type="checkbox" disabled />
          {field.label}
        </label>
      ) : (
        <input
          disabled
          type={field.type === "password" ? "password" : "text"}
          placeholder={field.placeholder || ""}
          style={inputStyle}
        />
      )}
      {field.hint && (
        <span style={{ fontSize: 11, color: "#888" }}>{field.hint}</span>
      )}
    </div>
  );
}

function YamlPreview({ yamlText }: { yamlText: string }) {
  let doc: YamlDoc = {};
  let parseError = "";
  try {
    doc = (yaml.load(yamlText) as YamlDoc) || {};
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  const fields: SchemaField[] = Array.isArray(doc.fields) ? doc.fields : [];
  const color = doc.color || "#667eea";
  const icon = doc.icon || "🔌";
  const label = doc.label || "Untitled";
  const hasExecute = !!doc.execute?.url;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: color + "22",
          border: `1px solid ${color}55`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>
            {label}
          </div>
          {doc.description && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
              {doc.description}
            </div>
          )}
          <div
            style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}
          >
            {doc.category && (
              <span
                style={{
                  fontSize: 10,
                  background: "#333",
                  borderRadius: 4,
                  padding: "1px 6px",
                  color: "#aaa",
                }}
              >
                {doc.category}
              </span>
            )}
            {doc.is_trigger && (
              <span
                style={{
                  fontSize: 10,
                  background: "#4a3f7a",
                  borderRadius: 4,
                  padding: "1px 6px",
                  color: "#c4b5fd",
                }}
              >
                Trigger
              </span>
            )}
            {doc.auth_type && (
              <span
                style={{
                  fontSize: 10,
                  background: "#1f3a2a",
                  borderRadius: 4,
                  padding: "1px 6px",
                  color: "#6ee7b7",
                }}
              >
                Auth: {doc.auth_type}
              </span>
            )}
          </div>
        </div>
      </div>

      {parseError && (
        <div
          style={{
            background: "#3b1f1f",
            border: "1px solid #f87171",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#fca5a5",
            fontFamily: "monospace",
          }}
        >
          YAML Error: {parseError}
        </div>
      )}

      {fields.length > 0 && (
        <div
          style={{
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Form Fields Preview
          </div>
          {fields.map((f, i) => (
            <FieldPreview key={f.key || i} field={f} />
          ))}
        </div>
      )}

      {hasExecute && (
        <div
          style={{
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            HTTP Execution
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              background: "#0a0a0a",
              borderRadius: 6,
              padding: 10,
              color: "#a5f3fc",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {(doc.execute?.method || "POST").toUpperCase()} {doc.execute?.url}
            {doc.execute?.headers
              ? "\n" +
                Object.entries(doc.execute.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")
              : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schema card ─────────────────────────────────────────────────────────────

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "none",
    borderRadius: 6,
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 12,
    padding: "5px 10px",
  };
}

function SchemaCard({
  schema,
  onEdit,
  onDelete,
  onClone,
}: {
  schema: NodeSchema;
  onEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div
      style={{
        background: "#16162a",
        border: "1px solid #2a2a4a",
        borderLeft: `4px solid ${schema.color}`,
        borderRadius: 10,
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>
        {schema.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>
          {schema.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#777",
            marginTop: 2,
            fontFamily: "monospace",
          }}
        >
          {schema.type}
        </div>
        {schema.description && (
          <div
            style={{
              fontSize: 12,
              color: "#999",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {schema.description}
          </div>
        )}
        <div
          style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}
        >
          {schema.category && (
            <span
              style={{
                fontSize: 10,
                background: "#2a2a3a",
                borderRadius: 4,
                padding: "2px 7px",
                color: "#aaa",
              }}
            >
              {schema.category}
            </span>
          )}
          {schema.is_trigger && (
            <span
              style={{
                fontSize: 10,
                background: "#3b2f5a",
                borderRadius: 4,
                padding: "2px 7px",
                color: "#c4b5fd",
              }}
            >
              Trigger
            </span>
          )}
          {schema.is_builtin && (
            <span
              style={{
                fontSize: 10,
                background: "#1a2a3a",
                borderRadius: 4,
                padding: "2px 7px",
                color: "#7dd3fc",
              }}
            >
              Built-in
            </span>
          )}
          {schema.execute_config && (
            <span
              style={{
                fontSize: 10,
                background: "#1a3a2a",
                borderRadius: 4,
                padding: "2px 7px",
                color: "#6ee7b7",
              }}
            >
              HTTP
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              background: "#2a2a2a",
              borderRadius: 4,
              padding: "2px 7px",
              color: "#888",
            }}
          >
            {schema.fields.length} fields
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onClone} title="Clone" style={btnStyle("#2a2a4a")}>
          ⧉
        </button>
        <button onClick={onEdit} style={btnStyle("#1e3a5f")}>
          {schema.is_builtin ? "View" : "Edit"}
        </button>
        {!schema.is_builtin &&
          (confirmDel ? (
            <>
              <button onClick={onDelete} style={btnStyle("#5c1a1a")}>
                Confirm
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                style={btnStyle("#2a2a4a")}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              style={btnStyle("#3a1a1a")}
            >
              Delete
            </button>
          ))}
      </div>
    </div>
  );
}

// ─── Editor page ─────────────────────────────────────────────────────────────

function SchemaEditor({
  existingType,
  initialSchema,
  onSaved,
  onCancel,
}: {
  existingType: string | null;
  initialSchema: NodeSchema | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = !existingType;
  const [typeId, setTypeId] = useState(
    existingType || (initialSchema ? initialSchema.type + "_copy" : ""),
  );
  const [yamlText, setYamlText] = useState(
    initialSchema ? schemaToYaml(initialSchema) : emptyYaml(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    if (!typeId.trim()) {
      setError("Type ID is required (lowercase, underscores)");
      return;
    }
    let doc: YamlDoc;
    try {
      doc = (yaml.load(yamlText) as YamlDoc) || {};
    } catch (e: unknown) {
      setError("YAML error: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    if (!doc.label) {
      setError("YAML must include a `label` field");
      return;
    }

    const fields: SchemaField[] = Array.isArray(doc.fields) ? doc.fields : [];
    const execute_config: ExecuteConfig | null = doc.execute?.url
      ? {
          url: doc.execute.url,
          method: doc.execute.method || "POST",
          headers: doc.execute.headers,
          body: doc.execute.body,
        }
      : null;

    setSaving(true);
    setError("");
    try {
      await upsertNodeSchema(typeId.trim(), {
        label: doc.label,
        icon: doc.icon || "🔌",
        color: doc.color || "#667eea",
        category: doc.category || "",
        description: doc.description || "",
        auth_type: doc.auth_type || null,
        fields,
        execute_config,
        is_trigger: !!doc.is_trigger,
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [typeId, yamlText, onSaved]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f0f1a",
        color: "#e0e0e0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          borderBottom: "1px solid #1e1e38",
          background: "#12122a",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onCancel}
          style={{ ...btnStyle("#1a1a2e"), fontSize: 18, padding: "4px 10px" }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {isNew
              ? "New Node Type"
              : `Edit: ${initialSchema?.label || existingType}`}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>
            Define the node in YAML — fields on the left, live preview on the
            right
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...btnStyle("#4f46e5"),
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div
          style={{
            margin: "10px 20px 0",
            background: "#3b1f1f",
            border: "1px solid #f87171",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {/* Type ID */}
      <div
        style={{
          padding: "10px 20px 0",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <label style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
          Type ID:
        </label>
        <input
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          disabled={!isNew}
          placeholder="e.g. my_service_action"
          style={{
            flex: 1,
            background: isNew ? "#1a1a2e" : "#111",
            border: "1px solid #333",
            borderRadius: 6,
            color: isNew ? "#e0e0e0" : "#666",
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: "monospace",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: "#555" }}>
          Unique identifier used in workflow execution (lowercase, underscores)
        </span>
      </div>

      {/* Two-panel editor */}
      <div
        style={
          {
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "12px 20px 20px",
            minHeight: 0,
            overflow: "hidden",
          } as React.CSSProperties
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            YAML Definition
          </div>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              resize: "none",
              background: "#080810",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              color: "#a5f3fc",
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: 13,
              lineHeight: 1.6,
              padding: 14,
              outline: "none",
              minHeight: 0,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Live Preview
          </div>
          <YamlPreview yamlText={yamlText} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NodeSchemaManager({ onBack }: Props) {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<{
    type: string | null;
    schema: NodeSchema | null;
  } | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchemas(await getNodeSchemas());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (type: string) => {
    try {
      await deleteNodeSchema(type);
      setSchemas((prev) => prev.filter((s) => s.type !== type));
    } catch (e) {
      console.error(e);
    }
  };

  if (editTarget !== null) {
    return (
      <SchemaEditor
        existingType={editTarget.type}
        initialSchema={editTarget.schema}
        onSaved={() => {
          setEditTarget(null);
          load();
        }}
        onCancel={() => setEditTarget(null)}
      />
    );
  }

  const filtered = schemas.filter(
    (s) =>
      !search ||
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.type.toLowerCase().includes(search.toLowerCase()) ||
      (s.category || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f1a",
        color: "#e0e0e0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#12122a",
          borderBottom: "1px solid #1e1e38",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button
          onClick={onBack}
          style={{ ...btnStyle("#1a1a2e"), fontSize: 18, padding: "4px 10px" }}
        >
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Node Types
          </h2>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            Define reusable service integrations using YAML
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#1a1a2e",
            border: "1px solid #333",
            borderRadius: 8,
            color: "#e0e0e0",
            padding: "7px 12px",
            fontSize: 13,
            outline: "none",
            width: 200,
          }}
        />
        <button
          onClick={() => setEditTarget({ type: null, schema: null })}
          style={{
            ...btnStyle("#4f46e5"),
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + New Node Type
        </button>
      </div>

      <div
        style={{
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {loading ? (
          <div style={{ color: "#666", textAlign: "center", padding: 40 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#666", textAlign: "center", padding: 40 }}>
            {search
              ? "No schemas match your search."
              : "No schemas yet. Click + New Node Type to get started."}
          </div>
        ) : (
          filtered.map((s) => (
            <SchemaCard
              key={s.type}
              schema={s}
              onEdit={() => setEditTarget({ type: s.type, schema: s })}
              onDelete={() => handleDelete(s.type)}
              onClone={() =>
                setEditTarget({
                  type: null,
                  schema: {
                    ...s,
                    type: s.type + "_copy",
                    label: s.label + " (Copy)",
                    is_builtin: false,
                  },
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
