import type { NodeConfigProps } from "../../constants/nodeTypes";

export const TransformConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Data Transformation</div>
      <div className="form-group">
        <label>Transform Type</label>
        <select
          value={str("transform_type") || "jq"}
          onChange={(e) => set("transform_type", e.target.value)}
        >
          <option value="jq">Expression (jq-like)</option>
          <option value="mapping">Field Mapping</option>
          <option value="template">JSON Template</option>
        </select>
      </div>

      {(str("transform_type") || "jq") === "jq" && (
        <div className="form-group">
          <label>Expression</label>
          <textarea
            value={str("expression")}
            onChange={(e) => set("expression", e.target.value)}
            placeholder="e.g. { result: input.body.data, count: input.body.total }"
            rows={5}
          />
          <p className="field-hint">
            Extract and reshape data. Input available as <code>input</code>.
          </p>
        </div>
      )}

      {str("transform_type") === "mapping" && (
        <div className="form-group">
          <label>Field Mapping (JSON)</label>
          <textarea
            value={str("mapping")}
            onChange={(e) => set("mapping", e.target.value)}
            placeholder={
              '{\n  "ticket_id": "{{issue.key}}",\n  "summary": "{{issue.fields.summary}}",\n  "status": "{{issue.fields.status.name}}"\n}'
            }
            rows={6}
          />
          <p className="field-hint">
            Map input fields to output fields using <code>{"{{path}}"}</code>
          </p>
        </div>
      )}

      {str("transform_type") === "template" && (
        <div className="form-group">
          <label>JSON Template</label>
          <textarea
            value={str("template")}
            onChange={(e) => set("template", e.target.value)}
            placeholder={
              '{\n  "notification": {\n    "title": "{{summary}}",\n    "body": "{{description}}"\n  }\n}'
            }
            rows={6}
          />
          <p className="field-hint">
            Output JSON with <code>{"{{key}}"}</code> placeholders
          </p>
        </div>
      )}
    </>
  );
};
