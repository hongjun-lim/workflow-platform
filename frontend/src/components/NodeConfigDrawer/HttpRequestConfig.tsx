import type { NodeConfigProps } from "../../constants/nodeTypes";

export const HttpRequestConfig = ({ str, set }: NodeConfigProps) => {
  return (
    <>
      <div className="config-section-title">Request</div>
      <div className="form-group">
        <label>Method</label>
        <select
          value={str("method") || "GET"}
          onChange={(e) => set("method", e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="HEAD">HEAD</option>
        </select>
      </div>
      <div className="form-group">
        <label>URL</label>
        <input
          type="text"
          value={str("url")}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://api.example.com/endpoint"
        />
        <p className="field-hint">
          Use <code>{"{{key}}"}</code> for dynamic values from previous nodes
        </p>
      </div>

      <div className="config-section-title">Headers</div>
      <div className="form-group">
        <label>Custom Headers (JSON)</label>
        <textarea
          value={str("headers_json")}
          onChange={(e) => set("headers_json", e.target.value)}
          placeholder={'{\n  "X-Custom-Header": "value"\n}'}
          rows={3}
        />
      </div>

      <div className="config-section-title">Authentication</div>
      <div className="form-group">
        <label>Auth Type</label>
        <select
          value={str("auth_type") || "none"}
          onChange={(e) => set("auth_type", e.target.value)}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="api_key">API Key</option>
        </select>
      </div>

      {str("auth_type") === "bearer" && (
        <div className="form-group">
          <label>Bearer Token</label>
          <input
            type="password"
            value={str("auth_token")}
            onChange={(e) => set("auth_token", e.target.value)}
            placeholder="your-token-here"
          />
        </div>
      )}
      {str("auth_type") === "basic" && (
        <>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={str("auth_username")}
              onChange={(e) => set("auth_username", e.target.value)}
              placeholder="username"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={str("auth_password")}
              onChange={(e) => set("auth_password", e.target.value)}
              placeholder="password"
            />
          </div>
        </>
      )}
      {str("auth_type") === "api_key" && (
        <>
          <div className="form-group">
            <label>Header Name</label>
            <input
              type="text"
              value={str("api_key_header")}
              onChange={(e) => set("api_key_header", e.target.value)}
              placeholder="X-API-Key"
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={str("api_key_value")}
              onChange={(e) => set("api_key_value", e.target.value)}
              placeholder="your-api-key"
            />
          </div>
        </>
      )}

      {(str("method") === "POST" ||
        str("method") === "PUT" ||
        str("method") === "PATCH") && (
        <>
          <div className="config-section-title">Request Body</div>
          <div className="form-group">
            <label>Body</label>
            <textarea
              value={str("body")}
              onChange={(e) => set("body", e.target.value)}
              placeholder={'{\n  "key": "value"\n}'}
              rows={5}
            />
            <p className="field-hint">
              JSON body. Use <code>{"{{key}}"}</code> for template variables.
              Leave empty to forward input from previous node.
            </p>
          </div>
        </>
      )}

      <div className="form-group">
        <label>Timeout (seconds)</label>
        <input
          type="number"
          value={str("timeout")}
          onChange={(e) => set("timeout", e.target.value)}
          placeholder="30"
        />
      </div>
    </>
  );
};
