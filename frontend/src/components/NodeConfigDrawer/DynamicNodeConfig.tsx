import { useState } from "react";
import type { NodeConfigProps } from "../../constants/nodeTypes";
import type { SchemaField } from "../../api";

interface DynamicNodeConfigProps extends NodeConfigProps {
  fields: SchemaField[];
  nodeType?: string;
}

const CUSTOM_FIELD_EXAMPLES: Record<string, string> = {
  jira_create_issue:
    'e.g. key: "customfield_10014" → sprint ID, or "components" → [{"name":"Backend"}]',
  jira_webhook:
    'e.g. key: "jira_domain" → override the Jira domain per-environment',
  slack_message:
    'e.g. key: "icon_url" → custom icon, or "unfurl_links" → true to expand links',
  http_request:
    'e.g. key: "X-Custom-Header" → value to inject as a request header',
  start: 'e.g. key: "source" → tag this run with a custom label',
};

export const DynamicNodeConfig = ({
  str,
  set,
  formData,
  fields,
  nodeType = "",
}: DynamicNodeConfigProps) => {
  // Track custom fields added by the user (key-value pairs)
  const [customFields, setCustomFields] = useState<
    { key: string; value: string }[]
  >(() => {
    // Restore any previously saved custom fields
    const saved = formData._custom_fields;
    if (Array.isArray(saved)) return saved as { key: string; value: string }[];
    return [];
  });

  // Determine which groups exist (preserve insertion order)
  const groups: string[] = [];
  for (const f of fields) {
    const g = f.group ?? "";
    if (!groups.includes(g)) groups.push(g);
  }

  // Check if a field should be visible based on show_if
  const isFieldVisible = (field: SchemaField): boolean => {
    if (!field.show_if) return true;
    const depValue = String(formData[field.show_if.field] ?? "");
    const allowedValues = field.show_if.value.split(",").map((v) => v.trim());
    return allowedValues.includes(depValue);
  };

  const handleAddCustomField = () => {
    const updated = [...customFields, { key: "", value: "" }];
    setCustomFields(updated);
    set("_custom_fields", updated);
  };

  const handleCustomFieldChange = (
    idx: number,
    prop: "key" | "value",
    val: string,
  ) => {
    const updated = customFields.map((f, i) =>
      i === idx ? { ...f, [prop]: val } : f,
    );
    setCustomFields(updated);
    set("_custom_fields", updated);
    // Also set the actual key-value into formData so backend can read it
    if (prop === "value" && updated[idx].key) {
      set(updated[idx].key, val);
    }
    if (prop === "key" && val && updated[idx].value) {
      set(val, updated[idx].value);
    }
  };

  const handleRemoveCustomField = (idx: number) => {
    // Remove from formData
    const removed = customFields[idx];
    if (removed.key) {
      set(removed.key, undefined);
    }
    const updated = customFields.filter((_, i) => i !== idx);
    setCustomFields(updated);
    set("_custom_fields", updated);
  };

  const renderField = (field: SchemaField) => {
    if (!isFieldVisible(field)) return null;

    switch (field.type) {
      case "text":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <input
              type="text"
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "password":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <input
              type="password"
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "number":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <input
              type="number"
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              min={0}
            />
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "textarea":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <textarea
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={5}
            />
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "code":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <textarea
              className="code-textarea"
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={6}
              spellCheck={false}
            />
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "select":
        return (
          <div className="form-group" key={field.key}>
            <label>
              {field.label}
              {field.required && " *"}
            </label>
            <select
              value={str(field.key) || field.default || ""}
              onChange={(e) => set(field.key, e.target.value)}
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      case "checkbox":
        return (
          <div className="form-group" key={field.key}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={
                  formData[field.key] === true || str(field.key) === "true"
                }
                onChange={(e) => set(field.key, e.target.checked)}
              />
              {field.label}
            </label>
            {field.hint && <p className="field-hint">{field.hint}</p>}
          </div>
        );

      default:
        return (
          <div className="form-group" key={field.key}>
            <label>{field.label}</label>
            <input
              type="text"
              value={str(field.key)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        );
    }
  };

  return (
    <>
      {groups.map((group) => {
        const groupFields = fields.filter((f) => (f.group ?? "") === group);
        const visibleFields = groupFields.filter(isFieldVisible);
        if (visibleFields.length === 0) return null;

        return (
          <div key={group || "__default"}>
            {group && <div className="config-section-title">{group}</div>}
            {visibleFields.map(renderField)}
          </div>
        );
      })}

      {/* Custom fields section */}
      <div className="config-section-title">Custom Fields</div>
      <p className="field-hint" style={{ marginBottom: 8 }}>
        Add extra key-value pairs passed straight to the node. Use{" "}
        <code>{"{{env.key}}"}</code> for environment variables.
        {CUSTOM_FIELD_EXAMPLES[nodeType] && (
          <>
            <br />
            <em>{CUSTOM_FIELD_EXAMPLES[nodeType]}</em>
          </>
        )}
      </p>
      <div className="custom-fields-editor">
        {customFields.map((cf, idx) => (
          <div className="custom-field-row" key={idx}>
            <input
              type="text"
              placeholder="Field key"
              value={cf.key}
              onChange={(e) =>
                handleCustomFieldChange(idx, "key", e.target.value)
              }
            />
            <input
              type="text"
              placeholder="Value"
              value={cf.value}
              onChange={(e) =>
                handleCustomFieldChange(idx, "value", e.target.value)
              }
            />
            <button
              className="action-btn delete"
              onClick={() => handleRemoveCustomField(idx)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="add-custom-field-btn" onClick={handleAddCustomField}>
          ＋ Add Field
        </button>
      </div>
    </>
  );
};
