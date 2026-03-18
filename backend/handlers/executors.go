package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// ==================== Custom Node Executor ====================

// executeCustomNode uses the node_schemas execute_config to make a dynamic HTTP call.
func (h *Handler) executeCustomNode(nodeType string, data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	schema, err := h.fetchNodeSchemaByType(nodeType)
	if err != nil || len(schema.ExecuteConfig) == 0 || string(schema.ExecuteConfig) == "null" {
		return input, ""
	}

	var cfg struct {
		URL     string            `json:"url"`
		Method  string            `json:"method"`
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body"`
	}
	if err := json.Unmarshal(schema.ExecuteConfig, &cfg); err != nil {
		return nil, fmt.Sprintf("executeCustomNode: invalid execute_config: %v", err)
	}

	values := make(map[string]string)
	for k, v := range data {
		values[k] = fmt.Sprintf("%v", v)
	}
	var inputMap map[string]interface{}
	if json.Unmarshal(input, &inputMap) == nil {
		for k, v := range inputMap {
			if _, exists := values[k]; !exists {
				values[k] = fmt.Sprintf("%v", v)
			}
		}
	}

	tpl := func(s string) string {
		for k, v := range values {
			s = strings.ReplaceAll(s, "{{"+k+"}}", v)
		}
		return s
	}

	targetURL := tpl(cfg.URL)
	body := tpl(cfg.Body)
	method := strings.ToUpper(cfg.Method)
	if method == "" {
		method = "POST"
	}

	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	} else {
		bodyReader = strings.NewReader("{}")
	}

	req, err := http.NewRequest(method, targetURL, bodyReader)
	if err != nil {
		return nil, fmt.Sprintf("executeCustomNode: failed to create request: %v", err)
	}
	for k, v := range cfg.Headers {
		req.Header.Set(k, tpl(v))
	}
	if req.Header.Get("Content-Type") == "" && body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Sprintf("executeCustomNode: HTTP request failed: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Sprintf("executeCustomNode: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result json.RawMessage
	if json.Unmarshal(respBody, &result) == nil {
		return result, ""
	}
	out, _ := json.Marshal(map[string]string{"response": string(respBody)})
	return json.RawMessage(out), ""
}

// ==================== Built-in Node Executors ====================

func (h *Handler) executeDatadogEvent(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	apiKey, _ := data["api_key"].(string)
	if apiKey == "" {
		return nil, "datadog_event: api_key is required"
	}

	title, _ := data["title"].(string)
	text, _ := data["text"].(string)
	alertType, _ := data["alert_type"].(string)
	priority, _ := data["priority"].(string)
	tagsRaw, _ := data["tags"].(string)
	site, _ := data["site"].(string)

	if title == "" {
		title = "Workflow Event"
	}
	if alertType == "" {
		alertType = "info"
	}
	if priority == "" {
		priority = "normal"
	}
	if site == "" {
		site = "datadoghq.com"
	}

	var tags []string
	for _, t := range strings.Split(tagsRaw, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			tags = append(tags, t)
		}
	}

	payload := map[string]interface{}{
		"title": title, "text": text, "alert_type": alertType,
		"priority": priority, "tags": tags,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", fmt.Sprintf("https://api.%s/api/v1/events", site), bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Sprintf("datadog_event: failed to build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("DD-API-KEY", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Sprintf("datadog_event: HTTP error: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Sprintf("datadog_event: API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		result = map[string]interface{}{"raw": string(respBody)}
	}
	out, _ := json.Marshal(result)
	return out, ""
}

func (h *Handler) executeHTTPRequest(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	url, _ := data["url"].(string)
	method, _ := data["method"].(string)
	if url == "" {
		return nil, "HTTP Request node: URL is required"
	}
	if method == "" {
		method = "GET"
	}

	var inputMap map[string]interface{}
	json.Unmarshal(input, &inputMap)
	url = templateReplace(url, inputMap)

	bodyReader := buildHTTPRequestBody(method, data, input, inputMap)

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Sprintf("Failed to create request: %v", err)
	}
	req.Header.Set(ContentTypeHeader, ContentTypeJSON)
	setHTTPRequestHeaders(req, data)
	setHTTPRequestAuth(req, data)

	client := &http.Client{Timeout: parseHTTPTimeout(data)}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Sprintf("HTTP request failed: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	result := map[string]interface{}{
		"status_code": resp.StatusCode,
		"body":        json.RawMessage(respBody),
	}
	output, _ := json.Marshal(result)

	if resp.StatusCode >= 400 {
		return output, fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return output, ""
}

func buildHTTPRequestBody(method string, data map[string]interface{}, input json.RawMessage, inputMap map[string]interface{}) io.Reader {
	if method != "POST" && method != "PUT" && method != "PATCH" {
		return nil
	}
	bodyStr, _ := data["body"].(string)
	if bodyStr != "" {
		return strings.NewReader(templateReplace(bodyStr, inputMap))
	}
	return bytes.NewReader(input)
}

func setHTTPRequestHeaders(req *http.Request, data map[string]interface{}) {
	if headersJSON, ok := data["headers_json"].(string); ok && headersJSON != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(headersJSON), &headers); err == nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}
	}
	if headers, ok := data["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			if vs, ok := v.(string); ok {
				req.Header.Set(k, vs)
			}
		}
	}
}

func setHTTPRequestAuth(req *http.Request, data map[string]interface{}) {
	switch data["auth_type"] {
	case "bearer":
		if token, _ := data["auth_token"].(string); token != "" {
			req.Header.Set(AuthorizationHeader, "Bearer "+token)
		}
	case "basic":
		if username, _ := data["auth_username"].(string); username != "" {
			password, _ := data["auth_password"].(string)
			req.SetBasicAuth(username, password)
		}
	case "api_key":
		headerName, _ := data["api_key_header"].(string)
		keyValue, _ := data["api_key_value"].(string)
		if headerName != "" && keyValue != "" {
			req.Header.Set(headerName, keyValue)
		}
	}
}

func parseHTTPTimeout(data map[string]interface{}) time.Duration {
	if ts, ok := data["timeout"].(string); ok && ts != "" {
		if t, err := time.ParseDuration(ts + "s"); err == nil {
			return t
		}
	} else if tf, ok := data["timeout"].(float64); ok && tf > 0 {
		return time.Duration(tf) * time.Second
	}
	return 30 * time.Second
}

func (h *Handler) executeJiraCreateIssue(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	jiraConfig, err := h.loadIntegrationConfig("jira")
	if err != nil {
		return nil, "Jira integration not configured. Go to Settings → Integrations to set it up."
	}

	domain, _ := jiraConfig["domain"].(string)
	email, _ := jiraConfig["email"].(string)
	apiToken, _ := jiraConfig["api_token"].(string)

	if domain == "" || email == "" || apiToken == "" {
		return nil, "Jira integration config incomplete: need domain, email, api_token"
	}

	var inputMap map[string]interface{}
	json.Unmarshal(input, &inputMap)

	jiraPayload, projectKey, err := buildJiraIssuePayload(data, inputMap)
	if err != nil {
		return nil, err.Error()
	}

	payloadBytes, _ := json.Marshal(jiraPayload)
	url := fmt.Sprintf("https://%s/rest/api/3/issue", domain)
	req, err := http.NewRequest("POST", url, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Sprintf("Failed to create Jira request: %v", err)
	}
	req.SetBasicAuth(email, apiToken)
	req.Header.Set(ContentTypeHeader, ContentTypeJSON)
	req.Header.Set("Accept", ContentTypeJSON)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Sprintf("Jira API call failed: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return json.RawMessage(respBody), fmt.Sprintf("Jira API error %d: %s", resp.StatusCode, string(respBody))
	}

	var jiraResp map[string]interface{}
	json.Unmarshal(respBody, &jiraResp)

	enriched := map[string]interface{}{}
	for _, field := range []string{"project_key", "summary", "description", "issue_type", "priority", "assignee", "labels"} {
		if v, ok := data[field]; ok && v != nil && v != "" {
			if s, ok := v.(string); ok {
				enriched[field] = templateReplace(s, inputMap)
			} else {
				enriched[field] = v
			}
		}
	}
	for k, v := range jiraResp {
		enriched[k] = v
	}
	if key, ok := jiraResp["key"].(string); ok && domain != "" {
		browseURL := fmt.Sprintf("https://%s/browse/%s", domain, key)
		enriched["self"] = browseURL
		enriched["browse_url"] = browseURL
		enriched["link"] = browseURL
	}

	output, _ := json.Marshal(enriched)
	log.Printf("🎫 Jira issue created in project %s", projectKey)
	return json.RawMessage(output), ""
}

func buildJiraIssuePayload(data map[string]interface{}, inputMap map[string]interface{}) (map[string]interface{}, string, error) {
	if jiraMode, _ := data["jira_mode"].(string); jiraMode == "advanced" {
		return buildJiraRawPayload(data, inputMap)
	}

	projectKey, _ := data["project_key"].(string)
	if projectKey == "" {
		return nil, "", fmt.Errorf("Jira Create Issue: project_key is required")
	}

	summary, _ := data["summary"].(string)
	description, _ := data["description"].(string)
	issueType, _ := data["issue_type"].(string)

	if summary == "" {
		summary = "Issue created by workflow"
	}
	if issueType == "" {
		issueType = "Task"
	}

	summary = templateReplace(summary, inputMap)
	description = templateReplace(description, inputMap)

	jiraPayload := map[string]interface{}{
		"fields": map[string]interface{}{
			"project":     map[string]string{"key": projectKey},
			"summary":     summary,
			"description": convertTextToADF(description),
			"issuetype":   map[string]string{"name": issueType},
		},
	}
	fields := jiraPayload["fields"].(map[string]interface{})
	addJiraOptionalFields(fields, data)
	return jiraPayload, projectKey, nil
}

func addJiraOptionalFields(fields map[string]interface{}, data map[string]interface{}) {
	if priority, _ := data["priority"].(string); priority != "" {
		fields["priority"] = map[string]string{"name": priority}
	}
	if assignee, _ := data["assignee"].(string); assignee != "" {
		fields["assignee"] = map[string]string{"accountId": assignee}
	}
	if labelsStr, _ := data["labels"].(string); labelsStr != "" {
		var labels []string
		for _, l := range strings.Split(labelsStr, ",") {
			if l = strings.TrimSpace(l); l != "" {
				labels = append(labels, l)
			}
		}
		if len(labels) > 0 {
			fields["labels"] = labels
		}
	}
}

func buildJiraRawPayload(data map[string]interface{}, inputMap map[string]interface{}) (map[string]interface{}, string, error) {
	rawPayload, _ := data["raw_payload"].(string)
	if rawPayload == "" {
		return nil, "", fmt.Errorf("Jira Create Issue (Advanced): raw_payload is empty")
	}

	rawPayload = templateReplace(rawPayload, inputMap)
	rawPayload = regexp.MustCompile(`(?m)^\s*//.*$`).ReplaceAllString(rawPayload, "")

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return nil, "", fmt.Errorf("Jira Create Issue (Advanced): invalid JSON in raw_payload: %v", err)
	}

	projectKey := ""
	if fields, ok := payload["fields"].(map[string]interface{}); ok {
		if proj, ok := fields["project"].(map[string]interface{}); ok {
			projectKey, _ = proj["key"].(string)
		}
		if desc, ok := fields["description"].(string); ok {
			fields["description"] = convertTextToADF(desc)
		}
	}
	return payload, projectKey, nil
}

func convertTextToADF(text string) map[string]interface{} {
	if text == "" {
		text = "No description provided"
	}
	var contentBlocks []map[string]interface{}
	for _, line := range strings.Split(text, "\n") {
		contentBlocks = append(contentBlocks, map[string]interface{}{
			"type": "paragraph",
			"content": []map[string]interface{}{
				{"type": "text", "text": line},
			},
		})
	}
	return map[string]interface{}{"type": "doc", "version": 1, "content": contentBlocks}
}

func (h *Handler) executeSlackMessage(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	slackConfig, err := h.loadIntegrationConfig("slack")
	if err != nil {
		return nil, "Slack integration not configured. Go to Settings → Integrations to set it up."
	}

	botToken, _ := slackConfig["bot_token"].(string)
	if botToken == "" {
		return nil, "Slack integration config incomplete: need bot_token"
	}

	channel, _ := data["channel"].(string)
	messageText, _ := data["message"].(string)
	if channel == "" {
		return nil, "Slack Message node: channel is required"
	}
	if messageText == "" {
		messageText = "Workflow notification"
	}

	var inputMap map[string]interface{}
	json.Unmarshal(input, &inputMap)
	messageText = templateReplace(messageText, inputMap)

	slackPayload := map[string]interface{}{"channel": channel, "text": messageText}
	if username, _ := data["username"].(string); username != "" {
		slackPayload["username"] = username
	}
	if iconEmoji, _ := data["icon_emoji"].(string); iconEmoji != "" {
		slackPayload["icon_emoji"] = iconEmoji
	}
	if threadTs, _ := data["thread_ts"].(string); threadTs != "" {
		if threadTs = templateReplace(threadTs, inputMap); threadTs != "" {
			slackPayload["thread_ts"] = threadTs
		}
	}

	payloadBytes, _ := json.Marshal(slackPayload)
	req, err := http.NewRequest("POST", "https://slack.com/api/chat.postMessage", bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Sprintf("Failed to create Slack request: %v", err)
	}
	req.Header.Set(ContentTypeHeader, ContentTypeJSON)
	req.Header.Set(AuthorizationHeader, "Bearer "+botToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Sprintf("Slack API call failed: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var slackResp map[string]interface{}
	json.Unmarshal(respBody, &slackResp)
	if ok, _ := slackResp["ok"].(bool); !ok {
		errStr, _ := slackResp["error"].(string)
		return json.RawMessage(respBody), fmt.Sprintf("Slack API error: %s", errStr)
	}

	log.Printf("💬 Slack message sent to #%s", channel)
	return json.RawMessage(respBody), ""
}

func executeDelay(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	delayVal := 1.0
	if d, ok := data["delay"].(float64); ok {
		delayVal = d
	} else if ds, ok := data["delay"].(string); ok {
		fmt.Sscanf(ds, "%f", &delayVal)
	}

	unit, _ := data["delay_unit"].(string)
	var duration time.Duration
	switch unit {
	case "s":
		duration = time.Duration(delayVal) * time.Second
	case "m":
		duration = time.Duration(delayVal) * time.Minute
	case "h":
		duration = time.Duration(delayVal) * time.Hour
	default:
		duration = time.Duration(delayVal) * time.Millisecond
	}

	log.Printf("⏱️ Delay node: waiting %v", duration)
	time.Sleep(duration)
	return input, ""
}
