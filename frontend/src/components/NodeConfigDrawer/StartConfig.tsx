import type { NodeConfigProps } from "../../constants/nodeTypes";

export const StartConfig = ({ str, set }: NodeConfigProps) => {
  const triggerType = str("trigger_type") || "schedule";

  return (
    <div className="start-config">
      <div className="form-group">
        <label>Trigger Type</label>
        <div className="start-trigger-options">
          <label
            className={`start-trigger-option ${triggerType === "schedule" ? "active" : ""}`}
          >
            <input
              type="radio"
              name="start_trigger"
              value="schedule"
              checked={triggerType === "schedule"}
              onChange={() => set("trigger_type", "schedule")}
            />
            <div className="start-trigger-content">
              <span className="start-trigger-icon">🕐</span>
              <strong>Schedule</strong>
              <span className="start-trigger-desc">
                Run on a cron schedule or manually via Run button
              </span>
            </div>
          </label>

          <label
            className={`start-trigger-option ${triggerType === "trigger" ? "active" : ""}`}
          >
            <input
              type="radio"
              name="start_trigger"
              value="trigger"
              checked={triggerType === "trigger"}
              onChange={() => set("trigger_type", "trigger")}
            />
            <div className="start-trigger-content">
              <span className="start-trigger-icon">⚡</span>
              <strong>Trigger</strong>
              <span className="start-trigger-desc">
                Triggered by external events (webhook, API call)
              </span>
            </div>
          </label>
        </div>
      </div>

      {triggerType === "schedule" && (
        <div className="form-group">
          <label>Cron Schedule</label>
          <select
            value={
              [
                "",
                "@every 1m",
                "@every 5m",
                "@every 15m",
                "@every 30m",
                "@hourly",
                "@daily",
                "@weekly",
              ].includes(str("cron_schedule"))
                ? str("cron_schedule")
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value !== "custom") {
                set("cron_schedule", e.target.value);
              }
            }}
          >
            <option value="">No schedule (manual only)</option>
            <option value="@every 1m">Every 1 minute</option>
            <option value="@every 5m">Every 5 minutes</option>
            <option value="@every 15m">Every 15 minutes</option>
            <option value="@every 30m">Every 30 minutes</option>
            <option value="@hourly">Every hour</option>
            <option value="@daily">Every day</option>
            <option value="@weekly">Every week</option>
            <option value="custom">Custom cron expression</option>
          </select>
          <input
            type="text"
            value={str("cron_schedule")}
            onChange={(e) => set("cron_schedule", e.target.value)}
            placeholder="e.g. 0 3 * * * or */5 * * * *"
            className="cron-input"
          />
          <p className="field-hint">
            Standard 5-field cron: minute hour day month weekday
            <br />
            Examples: <code>0 3 * * *</code> = daily at 3 AM,{" "}
            <code>*/5 * * * *</code> = every 5 min
            <br />
            Or use shortcuts: @every 5m, @hourly, @daily, @weekly
          </p>
        </div>
      )}

      {triggerType === "trigger" && (
        <div className="start-node-info">
          <p className="field-hint">
            This workflow will be triggered by external events such as Jira
            webhooks or API calls. Configure webhook settings on the relevant
            trigger nodes downstream.
          </p>
        </div>
      )}
    </div>
  );
};
