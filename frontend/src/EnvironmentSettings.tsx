import { useCallback, useEffect, useState } from "react";
import {
  getEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  type Environment,
} from "./api";

interface EnvironmentSettingsProps {
  onBack: () => void;
}

const ENV_COLORS = [
  { label: "Green", value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Gray", value: "#6b7280" },
];

export default function EnvironmentSettings({
  onBack,
}: EnvironmentSettingsProps) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal state
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#22c55e");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formVars, setFormVars] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const fetchEnvironments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEnvironments();
      setEnvironments(data);
    } catch (err) {
      console.error("Failed to load environments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const openCreate = () => {
    setEditingEnv(null);
    setIsCreating(true);
    setFormName("");
    setFormColor("#22c55e");
    setFormIsDefault(environments.length === 0);
    setFormVars([{ key: "", value: "" }]);
  };

  const openEdit = (env: Environment) => {
    setEditingEnv(env);
    setIsCreating(true);
    setFormName(env.name);
    setFormColor(env.color);
    setFormIsDefault(env.is_default);
    const vars = Object.entries(env.variables).map(([key, value]) => ({
      key,
      value,
    }));
    setFormVars(
      vars.length > 0
        ? [...vars, { key: "", value: "" }]
        : [{ key: "", value: "" }],
    );
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingEnv(null);
  };

  const handleAddVarRow = () => {
    setFormVars((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleVarChange = (
    index: number,
    field: "key" | "value",
    val: string,
  ) => {
    setFormVars((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)),
    );
  };

  const handleRemoveVar = (index: number) => {
    setFormVars((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    const variables: Record<string, string> = {};
    for (const { key, value } of formVars) {
      if (key.trim()) variables[key.trim()] = value;
    }
    try {
      if (editingEnv) {
        await updateEnvironment(
          editingEnv.id,
          formName.trim(),
          variables,
          formColor,
          formIsDefault,
        );
      } else {
        await createEnvironment(
          formName.trim(),
          variables,
          formColor,
          formIsDefault,
        );
      }
      await fetchEnvironments();
      closeForm();
    } catch (err) {
      console.error(err);
      alert("Failed to save environment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (env: Environment) => {
    if (
      !confirm(
        `Delete environment "${env.name}"? Workflows using this environment will be unlinked.`,
      )
    )
      return;
    try {
      await deleteEnvironment(env.id);
      await fetchEnvironments();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <h1>Environments</h1>
        </div>
        <p className="settings-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1>Environments</h1>
        <p className="settings-subtitle">
          Define environment variables (e.g. STG, PROD) that your workflow nodes
          can reference using <code>{"{{env.variable_name}}"}</code>.
        </p>
      </div>

      {/* ---- Environment cards ---- */}
      <div className="env-list">
        {environments.map((env) => (
          <div className="integration-card" key={env.id}>
            <div className="integration-card-header">
              <div className="integration-title">
                <span className="env-dot" style={{ background: env.color }} />
                <h2>{env.name}</h2>
                {env.is_default && (
                  <span className="badge badge-active">Default</span>
                )}
                <span className="env-var-count">
                  {Object.keys(env.variables).length} variable
                  {Object.keys(env.variables).length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="env-card-actions">
                <button
                  className="action-btn edit"
                  onClick={() => openEdit(env)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="action-btn delete"
                  onClick={() => handleDelete(env)}
                >
                  🗑
                </button>
              </div>
            </div>
            <div className="integration-card-body">
              {Object.keys(env.variables).length > 0 ? (
                <table className="env-var-table">
                  <thead>
                    <tr>
                      <th>Variable</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(env.variables).map(([key, value]) => (
                      <tr key={key}>
                        <td>
                          <code>{key}</code>
                        </td>
                        <td className="env-var-value">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="env-empty-vars">No variables defined yet.</p>
              )}
            </div>
          </div>
        ))}

        {environments.length === 0 && !isCreating && (
          <div className="empty-state">
            <div className="empty-icon">🌐</div>
            <h2>No environments yet</h2>
            <p>
              Create your first environment (e.g. STG, PROD) to manage different
              configurations for your workflows.
            </p>
            <button className="create-btn primary" onClick={openCreate}>
              ＋ Create Environment
            </button>
          </div>
        )}
      </div>

      {!isCreating && environments.length > 0 && (
        <button
          className="create-btn primary"
          onClick={openCreate}
          style={{ marginTop: 16 }}
        >
          ＋ Add Environment
        </button>
      )}

      {/* ---- Create/Edit form ---- */}
      {isCreating && (
        <div className="integration-card" style={{ marginTop: 20 }}>
          <div className="integration-card-header">
            <div className="integration-title">
              <h2>
                {editingEnv ? `Edit — ${editingEnv.name}` : "New Environment"}
              </h2>
            </div>
            <button className="action-btn" onClick={closeForm}>
              ✕ Cancel
            </button>
          </div>
          <div className="integration-card-body">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. STG, PROD"
              />
            </div>

            <div className="form-group">
              <label>Color</label>
              <div className="env-color-picker">
                {ENV_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`env-color-swatch${formColor === c.value ? " active" : ""}`}
                    style={{ background: c.value }}
                    onClick={() => setFormColor(c.value)}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                />
                Set as default environment
              </label>
            </div>

            <div className="form-group">
              <label>Variables</label>
              <p className="field-hint" style={{ marginBottom: 8 }}>
                Reference in node configs with{" "}
                <code>{"{{env.variable_name}}"}</code>
              </p>
              <div className="env-vars-editor">
                {formVars.map((row, idx) => (
                  <div className="env-var-row" key={idx}>
                    <input
                      type="text"
                      placeholder="Variable name"
                      value={row.key}
                      onChange={(e) =>
                        handleVarChange(idx, "key", e.target.value)
                      }
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) =>
                        handleVarChange(idx, "value", e.target.value)
                      }
                    />
                    <button
                      className="action-btn delete"
                      onClick={() => handleRemoveVar(idx)}
                      disabled={formVars.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button className="env-add-var-btn" onClick={handleAddVarRow}>
                  ＋ Add Variable
                </button>
              </div>
            </div>

            <button
              className="save-integration-btn"
              onClick={handleSave}
              disabled={saving || !formName.trim()}
            >
              {saving
                ? "Saving…"
                : editingEnv
                  ? "Update Environment"
                  : "Create Environment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
