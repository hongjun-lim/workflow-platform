import type { NodeConfigProps } from "../../constants/nodeTypes";

export const SlackMessageConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Message Configuration</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Uses Slack Bot Token from <strong>Settings → Integrations</strong>. Bot
        needs <code>chat:write</code> scope and must be invited to the channel.
      </p>
      <div className="form-group">
        <label>Channel *</label>
        <input
          type="text"
          value={str("channel")}
          onChange={(e) => set("channel", e.target.value)}
          placeholder="e.g. #general or C01ABCD1234"
        />
        <p className="field-hint">
          Channel name (with #) or channel ID. Bot must be a member.
        </p>
      </div>
      <div className="form-group">
        <label>Message *</label>
        <textarea
          value={str("message")}
          onChange={(e) => set("message", e.target.value)}
          placeholder={
            "🚀 New issue created!\n\nProject: {{project_key}}\nSummary: {{summary}}\nLink: {{self}}"
          }
          rows={5}
        />
        <p className="field-hint">
          Supports Slack mrkdwn formatting. Use <code>{"{{key}}"}</code> for
          template variables.
        </p>
      </div>

      <div className="config-section-title">Advanced</div>
      <div className="form-group">
        <label>Bot Username Override</label>
        <input
          type="text"
          value={str("username")}
          onChange={(e) => set("username", e.target.value)}
          placeholder="Workflow Bot"
        />
      </div>
      <div className="form-group">
        <label>Icon Emoji</label>
        <input
          type="text"
          value={str("icon_emoji")}
          onChange={(e) => set("icon_emoji", e.target.value)}
          placeholder=":robot_face:"
        />
      </div>
      <div className="form-group">
        <label>Thread Timestamp (reply to thread)</label>
        <input
          type="text"
          value={str("thread_ts")}
          onChange={(e) => set("thread_ts", e.target.value)}
          placeholder="e.g. {{thread_ts}} or leave empty"
        />
        <p className="field-hint">
          Set to reply in a thread. Use <code>{"{{thread_ts}}"}</code> from a
          previous Slack response.
        </p>
      </div>
    </>
  );
};
