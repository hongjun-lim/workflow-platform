import type { NodeConfigProps } from "../../constants/nodeTypes";

export const JiraCreateIssueConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Uses Jira credentials from <strong>Settings → Integrations</strong>
      </p>

      {/* Mode Toggle */}
      <div className="jira-mode-toggle">
        <button
          className={`mode-btn ${str("jira_mode") !== "advanced" ? "active" : ""}`}
          onClick={() => set("jira_mode", "basic")}
        >
          Basic
        </button>
        <button
          className={`mode-btn ${str("jira_mode") === "advanced" ? "active" : ""}`}
          onClick={() => set("jira_mode", "advanced")}
        >
          Advanced (Raw JSON)
        </button>
      </div>

      {str("jira_mode") !== "advanced" ? (
        <>
          <div className="config-section-title">Issue Details</div>
          <div className="form-group">
            <label>Project Key *</label>
            <input
              type="text"
              value={str("project_key")}
              onChange={(e) => set("project_key", e.target.value)}
              placeholder="e.g. PROJ, ENG, MYAPP"
            />
            <p className="field-hint">
              The project key from your Jira board (visible in issue IDs like
              PROJ-123)
            </p>
          </div>
          <div className="form-group">
            <label>Issue Type</label>
            <select
              value={str("issue_type") || "Task"}
              onChange={(e) => set("issue_type", e.target.value)}
            >
              <option value="Task">Task</option>
              <option value="Bug">Bug</option>
              <option value="Story">Story</option>
              <option value="Epic">Epic</option>
              <option value="Sub-task">Sub-task</option>
              <option value="Improvement">Improvement</option>
            </select>
          </div>
          <div className="form-group">
            <label>Summary *</label>
            <input
              type="text"
              value={str("summary")}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="e.g. New bug from webhook: {{summary}}"
            />
            <p className="field-hint">
              Use <code>{"{{key}}"}</code> to insert data from the previous
              node's output
            </p>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={str("description")}
              onChange={(e) => set("description", e.target.value)}
              placeholder={
                "Detailed description…\n\nTriggered by: {{webhookEvent}}\nIssue: {{issue.key}}"
              }
              rows={5}
            />
          </div>

          <div className="config-section-title">Optional Fields</div>
          <div className="form-group">
            <label>Priority</label>
            <select
              value={str("priority")}
              onChange={(e) => set("priority", e.target.value)}
            >
              <option value="">Default</option>
              <option value="Highest">Highest</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Lowest">Lowest</option>
            </select>
          </div>
          <div className="form-group">
            <label>Assignee (account ID or email)</label>
            <input
              type="text"
              value={str("assignee")}
              onChange={(e) => set("assignee", e.target.value)}
              placeholder="e.g. 5b10ac8d82e05b22cc7d4ef5"
            />
          </div>
          <div className="form-group">
            <label>Labels (comma-separated)</label>
            <input
              type="text"
              value={str("labels")}
              onChange={(e) => set("labels", e.target.value)}
              placeholder="e.g. automated, workflow"
            />
          </div>
        </>
      ) : (
        <>
          <div className="config-section-title">Raw JSON Payload</div>
          <p className="field-hint" style={{ marginBottom: 8 }}>
            Full control over the Jira API request body. Use{" "}
            <code>{"{{key}}"}</code> for template variables from the previous
            node's output. The description field will be auto-converted to ADF
            format if it's a plain string.
          </p>
          <div className="form-group">
            <textarea
              className="raw-payload-editor"
              value={
                str("raw_payload") ||
                JSON.stringify(
                  {
                    fields: {
                      project: { key: "PROJ" },
                      summary: "{{summary}}",
                      description: "Created via workflow",
                      issuetype: { name: "Task" },
                      priority: { name: "Medium" },
                      labels: ["automated"],
                    },
                  },
                  null,
                  2,
                )
              }
              onChange={(e) => set("raw_payload", e.target.value)}
              rows={20}
              spellCheck={false}
            />
          </div>
          <div
            className="field-hint"
            style={{
              background: "#f0f4ff",
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <strong>💡 Tips:</strong>
            <br />
            • Find custom field IDs in Jira → Project Settings → Fields
            <br />• Use <code>customfield_XXXXX</code> for custom fields
            <br />
            • Description can be a plain string (auto-converted to ADF) or full
            ADF object
            <br />• Template: <code>{"{{issue.fields.summary}}"}</code>,{" "}
            <code>{"{{webhookEvent}}"}</code>
          </div>
        </>
      )}
    </>
  );
};
