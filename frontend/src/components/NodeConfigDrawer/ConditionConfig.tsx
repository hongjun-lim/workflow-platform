import type { NodeConfigProps } from "../../constants/nodeTypes";

export const ConditionConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Condition Logic</div>
      <div className="form-group">
        <label>Condition Type</label>
        <select
          value={str("condition_type") || "simple"}
          onChange={(e) => set("condition_type", e.target.value)}
        >
          <option value="simple">Simple Comparison</option>
          <option value="expression">JavaScript Expression</option>
        </select>
      </div>

      {(str("condition_type") || "simple") === "simple" && (
        <>
          <div className="form-group">
            <label>Field</label>
            <input
              type="text"
              value={str("field")}
              onChange={(e) => set("field", e.target.value)}
              placeholder="e.g. status_code, body.ok, issue.type"
            />
            <p className="field-hint">Dot-notation path in the input data</p>
          </div>
          <div className="form-group">
            <label>Operator</label>
            <select
              value={str("operator") || "=="}
              onChange={(e) => set("operator", e.target.value)}
            >
              <option value="==">Equals (==)</option>
              <option value="!=">Not Equals (!=)</option>
              <option value=">">Greater Than (&gt;)</option>
              <option value="<">Less Than (&lt;)</option>
              <option value=">=">Greater or Equal (&gt;=)</option>
              <option value="<=">Less or Equal (&lt;=)</option>
              <option value="contains">Contains</option>
              <option value="starts_with">Starts With</option>
              <option value="is_empty">Is Empty</option>
              <option value="is_not_empty">Is Not Empty</option>
            </select>
          </div>
          {!["is_empty", "is_not_empty"].includes(str("operator")) && (
            <div className="form-group">
              <label>Compare Value</label>
              <input
                type="text"
                value={str("compare_value")}
                onChange={(e) => set("compare_value", e.target.value)}
                placeholder='e.g. 200, "Bug", true'
              />
            </div>
          )}
        </>
      )}

      {str("condition_type") === "expression" && (
        <div className="form-group">
          <label>Expression</label>
          <textarea
            value={str("expression")}
            onChange={(e) => set("expression", e.target.value)}
            placeholder="e.g. input.status_code === 200 && input.body.ok === true"
            rows={4}
          />
          <p className="field-hint">
            JavaScript expression. Access input data via{" "}
            <code>input.field</code>
          </p>
        </div>
      )}
    </>
  );
};
