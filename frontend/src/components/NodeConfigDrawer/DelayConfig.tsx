import type { NodeConfigProps } from "../../constants/nodeTypes";

export const DelayConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Delay Configuration</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Duration</label>
          <input
            type="number"
            value={str("delay")}
            onChange={(e) => set("delay", e.target.value)}
            placeholder="5"
            min={0}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Unit</label>
          <select
            value={str("delay_unit") || "s"}
            onChange={(e) => set("delay_unit", e.target.value)}
          >
            <option value="ms">Milliseconds</option>
            <option value="s">Seconds</option>
            <option value="m">Minutes</option>
            <option value="h">Hours</option>
          </select>
        </div>
      </div>
      <p className="field-hint">
        Pause workflow execution for the specified duration
      </p>
    </>
  );
};
