package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== Jira Webhook Registration ====================

func (h *Handler) registerJiraWebhook(c *gin.Context) {
	var req struct {
		JiraDomain   string   `json:"jira_domain"`
		JiraEmail    string   `json:"jira_email"`
		JiraAPIToken string   `json:"jira_api_token"`
		WebhookURL   string   `json:"webhook_url"`
		Events       []string `json:"events"`
		JQLFilter    string   `json:"jql_filter"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}
	if req.JiraDomain == "" || req.JiraEmail == "" || req.JiraAPIToken == "" || req.WebhookURL == "" {
		c.JSON(400, gin.H{"error": "jira_domain, jira_email, jira_api_token, and webhook_url are required"})
		return
	}
	if len(req.Events) == 0 {
		req.Events = []string{"jira:issue_created", "jira:issue_updated", "jira:issue_deleted"}
	}

	webhookName := fmt.Sprintf("workflow-platform-%s", uuid.New().String()[:8])
	jiraPayload := map[string]interface{}{
		"name":   webhookName,
		"url":    req.WebhookURL,
		"events": req.Events,
	}
	if req.JQLFilter != "" {
		jiraPayload["filters"] = map[string]interface{}{
			"issue-related-events-section": req.JQLFilter,
		}
	}

	payloadBytes, _ := json.Marshal(jiraPayload)
	url := fmt.Sprintf("https://%s/rest/webhooks/1.0/webhook", req.JiraDomain)
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(payloadBytes))
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to build request: %v", err)})
		return
	}
	httpReq.SetBasicAuth(req.JiraEmail, req.JiraAPIToken)
	httpReq.Header.Set(ContentTypeHeader, ContentTypeJSON)
	httpReq.Header.Set("Accept", ContentTypeJSON)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to call Jira API: %v", err)})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		log.Printf("❌ Jira webhook registration failed (%d): %s", resp.StatusCode, string(respBody))
		c.JSON(resp.StatusCode, gin.H{
			"error":   fmt.Sprintf("Jira API returned %d", resp.StatusCode),
			"details": string(respBody),
		})
		return
	}

	var jiraResp map[string]interface{}
	json.Unmarshal(respBody, &jiraResp)
	webhookID := ""
	if self, ok := jiraResp["self"].(string); ok {
		parts := strings.Split(self, "/")
		if len(parts) > 0 {
			webhookID = parts[len(parts)-1]
		}
	}

	log.Printf("✅ Jira webhook registered: name=%s, id=%s, url=%s", webhookName, webhookID, req.WebhookURL)
	c.JSON(201, gin.H{
		"message":    "Webhook registered on Jira successfully",
		"name":       webhookName,
		"webhook_id": webhookID,
		"events":     req.Events,
	})
}

// ==================== Jira Webhook Receiver ====================

func (h *Handler) handleJiraWebhook(c *gin.Context) {
	triggeredByUser := c.Query("triggeredByUser")
	if triggeredByUser != "" {
		ownAccountID := h.getJiraAccountID()
		if ownAccountID != "" && ownAccountID == triggeredByUser {
			log.Printf("⏭️ Skipping Jira webhook triggered by own account (%s) — loop prevention", triggeredByUser)
			c.JSON(200, gin.H{"status": "skipped", "reason": "triggered by own integration account"})
			return
		}
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to read body"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(400, gin.H{"error": "Invalid JSON"})
		return
	}

	eventType := "unknown"
	if we, ok := payload["webhookEvent"].(string); ok {
		eventType = we
	}

	eventID := uuid.New().String()
	_, err = h.db.Exec(
		"INSERT INTO webhook_events (id, source, event_type, payload) VALUES (?, 'jira', ?, ?)",
		eventID, eventType, body,
	)
	if err != nil {
		log.Printf("Failed to store webhook event: %v", err)
	}

	log.Printf("📩 Jira webhook received: %s (event_id=%s)", eventType, eventID)
	go h.processJiraWebhookTrigger(eventID, eventType, body)
	c.JSON(200, gin.H{"status": "received", "event_id": eventID})
}

func (h *Handler) processJiraWebhookTrigger(eventID, eventType string, payload []byte) {
	rows, err := h.db.Query("SELECT id, name, nodes, edges FROM workflows WHERE status = 'active'")
	if err != nil {
		log.Printf("Failed to query workflows for webhook trigger: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var w Workflow
		if err := rows.Scan(&w.ID, &w.Name, &w.Nodes, &w.Edges); err != nil {
			continue
		}
		if h.triggerWorkflowForJiraWebhook(&w, eventID, eventType, payload) {
			break
		}
	}
}

func (h *Handler) triggerWorkflowForJiraWebhook(w *Workflow, eventID, eventType string, payload []byte) bool {
	var nodes []map[string]interface{}
	if err := json.Unmarshal(w.Nodes, &nodes); err != nil {
		return false
	}

	for _, node := range nodes {
		nodeType, _ := node["type"].(string)
		if nodeType != "jira_webhook" {
			continue
		}

		data, _ := node["data"].(map[string]interface{})
		filterEvent, _ := data["event_filter"].(string)
		if filterEvent != "" && filterEvent != eventType {
			continue
		}

		log.Printf("🚀 Triggering workflow '%s' (id=%s) from Jira webhook: %s", w.Name, w.ID, eventType)

		runID := uuid.New().String()
		h.db.Exec(
			"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', ?)",
			runID, w.ID, payload,
		)
		h.db.Exec("UPDATE webhook_events SET processed = TRUE, workflow_run_id = ? WHERE id = ?", runID, eventID)
		go h.executeWorkflow(runID, *w, payload)
		return true
	}
	return false
}

func (h *Handler) getWebhookEvents(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, source, event_type, payload, processed, workflow_run_id, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 50")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var events []WebhookEvent
	for rows.Next() {
		var e WebhookEvent
		if err := rows.Scan(&e.ID, &e.Source, &e.EventType, &e.Payload, &e.Processed, &e.WorkflowRunID, &e.CreatedAt); err != nil {
			continue
		}
		events = append(events, e)
	}
	c.JSON(200, events)
}
