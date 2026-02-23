import { useCallback, useEffect, useState } from "react";
import {
  getIntegrations,
  upsertIntegration,
  deleteIntegration,
  type Integration,
} from "./api";

interface IntegrationSettingsProps {
  onBack: () => void;
}

export default function IntegrationSettings({
  onBack,
}: IntegrationSettingsProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Jira form
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");

  // Slack form
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getIntegrations();
      setIntegrations(data);

      // Populate forms from existing configs
      for (const i of data) {
        if (i.type === "jira") {
          setJiraDomain(i.config.domain || "");
          setJiraEmail(i.config.email || "");
          setJiraApiToken(i.config.api_token || "");
        }
        if (i.type === "slack") {
          setSlackBotToken(i.config.bot_token || "");
          setSlackSigningSecret(i.config.signing_secret || "");
        }
      }
    } catch (err) {
      console.error("Failed to load integrations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleSaveJira = async () => {
    setSaving("jira");
    try {
      await upsertIntegration("jira", "Jira Cloud", {
        domain: jiraDomain,
        email: jiraEmail,
        api_token: jiraApiToken,
      });
      await fetchIntegrations();
      alert("Jira integration saved!");
    } catch (err) {
      console.error(err);
      alert("Failed to save Jira integration");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveSlack = async () => {
    setSaving("slack");
    try {
      await upsertIntegration("slack", "Slack Bot", {
        bot_token: slackBotToken,
        signing_secret: slackSigningSecret,
      });
      await fetchIntegrations();
      alert("Slack integration saved!");
    } catch (err) {
      console.error(err);
      alert("Failed to save Slack integration");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (type: string) => {
    if (!confirm(`Remove ${type} integration?`)) return;
    try {
      await deleteIntegration(type);
      await fetchIntegrations();
      if (type === "jira") {
        setJiraDomain("");
        setJiraEmail("");
        setJiraApiToken("");
      }
      if (type === "slack") {
        setSlackBotToken("");
        setSlackSigningSecret("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isJiraConfigured = integrations.some((i) => i.type === "jira");
  const isSlackConfigured = integrations.some((i) => i.type === "slack");

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>
            ← Back to Workflows
          </button>
          <h1>Integrations</h1>
        </div>
        <p className="settings-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Workflows
        </button>
        <h1>Integrations</h1>
        <p className="settings-subtitle">
          Configure your Jira and Slack connections to use in workflows.
        </p>
      </div>

      {/* ---- Jira ---- */}
      <div className="integration-card">
        <div className="integration-card-header">
          <div className="integration-title">
            <span className="integration-icon">🎫</span>
            <h2>Jira Cloud</h2>
            {isJiraConfigured && (
              <span className="badge badge-active">Connected</span>
            )}
          </div>
          {isJiraConfigured && (
            <button
              className="action-btn delete"
              onClick={() => handleDelete("jira")}
            >
              Remove
            </button>
          )}
        </div>

        <div className="integration-card-body">
          <div className="form-group">
            <label>Atlassian Domain</label>
            <input
              type="text"
              value={jiraDomain}
              onChange={(e) => setJiraDomain(e.target.value)}
              placeholder="yourcompany.atlassian.net"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="form-group">
            <label>API Token</label>
            <input
              type="password"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
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

          <button
            className="save-integration-btn"
            onClick={handleSaveJira}
            disabled={
              saving === "jira" || !jiraDomain || !jiraEmail || !jiraApiToken
            }
          >
            {saving === "jira" ? "Saving…" : "Save Jira Configuration"}
          </button>

          <div className="webhook-info">
            <h4>Jira Webhook URL</h4>
            <p>
              Point your Jira webhook to this URL to trigger workflows
              automatically:
            </p>
            <code className="webhook-url">
              http://YOUR_PUBLIC_URL:8081/webhooks/jira
            </code>
            <p className="field-hint">
              Use a tool like ngrok to expose your local server, or deploy to a
              public server.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Slack ---- */}
      <div className="integration-card">
        <div className="integration-card-header">
          <div className="integration-title">
            <span className="integration-icon">💬</span>
            <h2>Slack Bot</h2>
            {isSlackConfigured && (
              <span className="badge badge-active">Connected</span>
            )}
          </div>
          {isSlackConfigured && (
            <button
              className="action-btn delete"
              onClick={() => handleDelete("slack")}
            >
              Remove
            </button>
          )}
        </div>

        <div className="integration-card-body">
          <div className="form-group">
            <label>Bot User OAuth Token</label>
            <input
              type="password"
              value={slackBotToken}
              onChange={(e) => setSlackBotToken(e.target.value)}
              placeholder="xoxb-..."
            />
            <p className="field-hint">
              Found under OAuth & Permissions in your{" "}
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noreferrer"
              >
                Slack App settings
              </a>
              . Needs <code>chat:write</code> scope.
            </p>
          </div>
          <div className="form-group">
            <label>Signing Secret (optional)</label>
            <input
              type="password"
              value={slackSigningSecret}
              onChange={(e) => setSlackSigningSecret(e.target.value)}
              placeholder="Your Slack signing secret"
            />
          </div>

          <button
            className="save-integration-btn"
            onClick={handleSaveSlack}
            disabled={saving === "slack" || !slackBotToken}
          >
            {saving === "slack" ? "Saving…" : "Save Slack Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
