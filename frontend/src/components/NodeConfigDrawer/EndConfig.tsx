import type { NodeConfigProps } from "../../constants/nodeTypes";

export const EndConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Output Configuration</div>
      <div className="form-group">
        <label>Output Mapping (optional)</label>
        <textarea
          value={str("output_mapping")}
          onChange={(e) => set("output_mapping", e.target.value)}
          placeholder={
            '{\n  "result": "{{body}}",\n  "status": "{{status_code}}"\n}'
          }
          rows={5}
        />
        <p className="field-hint">
          Define the final output shape. Leave empty to pass through all data.
        </p>
      </div>
    </>
  );
};
