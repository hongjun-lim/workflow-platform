import { useState } from "react";
import type { NodeConfigProps } from "../../constants/nodeTypes";

export const JiraWebhookConfig = ({ str, set, formData }: NodeConfigProps) => {
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  const handleRegisterJiraWebhook = async () => {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const res = await fetch(
        "http://localhost:8081/api/jira/register-webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jira_domain: str("custom_jira_domain"),
            jira_email: str("custom_jira_email"),
            jira_api_token: str("custom_jira_api_token"),
            webhook_url: str("custom_webhook_url"),
            events: (formData.webhook_events as string[]) || [],
            jql_filter: str("jql_filter"),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setRegisterResult(
          `✅ Webhook registered! Name: ${data.name || "jira-webhook"}`,
        );
        set("registered_webhook_id", data.webhook_id);
      } else {
        setRegisterResult(`❌ Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setRegisterResult(
        `❌ Error: ${err instanceof Error ? err.message : "Network error"}`,
      );
    } finally {
      setRegistering(false);
    }
  };

  return (
    <>
      <div className="config-section-title">Webhook Mode</div>
      <div className="form-group">
        <label>Mode</label>
        <select
          value={str("webhook_mode") || "platform"}
          onChange={(e) => set("webhook_mode", e.target.value)}
        >
          <option value="platform">
            Platform Webhook (shared, pre-configured)
          </option>
          <option value="custom">
            Custom Webhook (your own Jira instance)
          </option>
        </select>
        <p className="field-hint">
          {str("webhook_mode") === "custom"
            ? "We'll register a webhook on your Jira instance via API"
            : "Use our platform's shared webhook URL — just add it in your Jira admin"}
        </p>
      </div>

      <div className="config-section-title">Event Filter</div>
      <div className="form-group">
        <label>Trigger on Event</label>
        <select
          value={str("event_filter")}
          onChange={(e) => set("event_filter", e.target.value)}
        >
          <option value="">All events</option>
          <option value="jira:issue_created">Issue Created</option>
          <option value="jira:issue_updated">Issue Updated</option>
          <option value="jira:issue_deleted">Issue Deleted</option>
          <option value="comment_created">Comment Created</option>
          <option value="sprint_started">Sprint Started</option>
          <option value="sprint_closed">Sprint Closed</option>
          <option value="board_created">Board Created</option>
          <option value="jira:version_released">Version Released</option>
        </select>
      </div>

      <div className="form-group">
        <label>JQL Filter (optional)</label>
        <input
          type="text"
          value={str("jql_filter")}
          onChange={(e) => set("jql_filter", e.target.value)}
          placeholder='e.g. project = PROJ AND status = "To Do"'
        />
        <p className="field-hint">
          Only trigger when the Jira issue matches this JQL query
        </p>
      </div>

      {/* Platform mode */}
      {(str("webhook_mode") || "platform") === "platform" && (
        <div className="webhook-info">
          <h4>📡 Platform Webhook URL</h4>
          <p>Add this URL in your Jira Admin → System → WebHooks:</p>
          <code className="webhook-url">
            http://YOUR_PUBLIC_URL:8081/webhooks/jira
          </code>
          <p className="field-hint">
            All users share this endpoint. Use ngrok or deploy to a public
            server. Event filtering is handled by this node's config.
          </p>
        </div>
      )}

      {/* Custom mode */}
      {str("webhook_mode") === "custom" && (
        <>
          <div className="config-section-title">Your Jira Credentials</div>
          <div className="form-group">
            <label>Jira Domain</label>
            <input
              type="text"
              value={str("custom_jira_domain")}
              onChange={(e) => set("custom_jira_domain", e.target.value)}
              placeholder="yourcompany.atlassian.net"
            />
          </div>
          <div className="form-group">
            <label>Jira Email</label>
            <input
              type="email"
              value={str("custom_jira_email")}
              onChange={(e) => set("custom_jira_email", e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="form-group">
            <label>Jira API Token</label>
            <input
              type="password"
              value={str("custom_jira_api_token")}
              onChange={(e) => set("custom_jira_api_token", e.target.value)}
              placeholder="Your Jira API token"
            />
            <p className="field-hint">
              Generate at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
              >
                Atlassian API Tokens
              </a>
            </p>
          </div>
          <div className="form-group">
            <label>Callback URL (your server)</label>
            <input
              type="text"
              value={str("custom_webhook_url")}
              onChange={(e) => set("custom_webhook_url", e.target.value)}
              placeholder="https://your-server.com/webhooks/jira"
            />
            <p className="field-hint">
              The public URL where Jira will send webhook events. Must be
              reachable from the internet.
            </p>
          </div>

          <div className="form-group">
            <label>Subscribe to Events</label>
            {[
              { value: "jira:issue_created", label: "Issue Created" },
              { value: "jira:issue_updated", label: "Issue Updated" },
              { value: "jira:issue_deleted", label: "Issue Deleted" },
              { value: "comment_created", label: "Comment Created" },
              { value: "comment_updated", label: "Comment Updated" },
              { value: "sprint_started", label: "Sprint Started" },
              { value: "sprint_closed", label: "Sprint Closed" },
            ].map((evt) => (
              <label key={evt.value} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={(
                    (formData.webhook_events as string[]) || []
                  ).includes(evt.value)}
                  onChange={(e) => {
                    const current = (formData.webhook_events as string[]) || [];
                    if (e.target.checked) {
                      set("webhook_events", [...current, evt.value]);
                    } else {
                      set(
                        "webhook_events",
                        current.filter((v) => v !== evt.value),
                      );
                    }
                  }}
                />
                {evt.label}
              </label>
            ))}
          </div>

          <button
            className="register-webhook-btn"
            onClick={handleRegisterJiraWebhook}
            disabled={
              registering ||
              !str("custom_jira_domain") ||
              !str("custom_jira_email") ||
              !str("custom_jira_api_token") ||
              !str("custom_webhook_url")
            }
          >
            {registering
              ? "Registering…"
              : str("registered_webhook_id")
                ? "🔄 Re-register Webhook"
                : "🔗 Register Webhook on Jira"}
          </button>
          {registerResult && (
            <p className="register-result">{registerResult}</p>
          )}
        </>
      )}
    </>
  );
};
