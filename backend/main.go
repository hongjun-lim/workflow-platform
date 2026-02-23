package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
)

var db *sql.DB

// ==================== Constants ====================

const (
	ContentTypeJSON      = "application/json"
	ContentTypeHeader    = "Content-Type"
	AuthorizationHeader  = "Authorization"
	WorkflowIDPath       = "/workflows/:id"
	IntegrationTypePath  = "/integrations/:type"
)

// ==================== Models ====================

type Workflow struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Nodes       json.RawMessage `json:"nodes"`
	Edges       json.RawMessage `json:"edges"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type WorkflowRun struct {
	ID         string          `json:"id"`
	WorkflowID string          `json:"workflow_id"`
	Status     string          `json:"status"`
	Input      json.RawMessage `json:"input"`
	Output     json.RawMessage `json:"output"`
	Message    string          `json:"message"`
	StartedAt  time.Time       `json:"started_at"`
	FinishedAt *time.Time      `json:"finished_at"`
}

type WorkflowLog struct {
	ID           string          `json:"id"`
	RunID        string          `json:"run_id"`
	NodeID       string          `json:"node_id"`
	NodeName     string          `json:"node_name"`
	NodeType     string          `json:"node_type"`
	Status       string          `json:"status"`
	Input        json.RawMessage `json:"input"`
	Output       json.RawMessage `json:"output"`
	ErrorMessage string          `json:"error_message"`
	CreatedAt    time.Time       `json:"created_at"`
}

type Integration struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Name      string          `json:"name"`
	Config    json.RawMessage `json:"config"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type WebhookEvent struct {
	ID            string          `json:"id"`
	Source        string          `json:"source"`
	EventType     string          `json:"event_type"`
	Payload       json.RawMessage `json:"payload"`
	Processed     bool            `json:"processed"`
	WorkflowRunID *string         `json:"workflow_run_id"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ==================== Main ====================

func main() {
	var err error
	dsn := "root:password@tcp(localhost:3306)/workflow_db?parseTime=true"
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err = db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}
	log.Println("Connected to MySQL!")

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", ContentTypeHeader, AuthorizationHeader},
		AllowCredentials: true,
	}))

	api := r.Group("/api")
	{
		// Workflows
		api.GET("/workflows", getWorkflows)
		api.GET(WorkflowIDPath, getWorkflow)
		api.POST("/workflows", createWorkflow)
		api.PUT(WorkflowIDPath, updateWorkflow)
		api.DELETE(WorkflowIDPath, deleteWorkflow)

		// Runs
		api.POST("/workflows/:id/run", runWorkflow)
		api.GET("/runs", getRuns)
		api.GET("/runs/:id", getRun)
		api.GET("/runs/:id/logs", getRunLogs)

		// Integrations
		api.GET("/integrations", getIntegrations)
		api.GET(IntegrationTypePath, getIntegration)
		api.PUT(IntegrationTypePath, upsertIntegration)
		api.DELETE(IntegrationTypePath, deleteIntegration)

		// Node dry-run (test single node without saving to DB)
		api.POST("/nodes/dry-run", dryRunNode)

		// Jira webhook management
		api.POST("/jira/register-webhook", registerJiraWebhook)

		// Webhook events log
		api.GET("/webhook-events", getWebhookEvents)
	}

	// Webhook receivers (public endpoints — no /api prefix)
	r.POST("/webhooks/jira", handleJiraWebhook)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	log.Println("Server running on http://localhost:8081")
	r.Run(":8081")
}

// ==================== Workflow CRUD ====================

func getWorkflows(c *gin.Context) {
	rows, err := db.Query("SELECT id, name, description, nodes, edges, status, created_at, updated_at FROM workflows ORDER BY created_at DESC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var workflows []Workflow
	for rows.Next() {
		var w Workflow
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Nodes, &w.Edges, &w.Status, &w.CreatedAt, &w.UpdatedAt); err != nil {
			continue
		}
		workflows = append(workflows, w)
	}
	c.JSON(200, workflows)
}

func getWorkflow(c *gin.Context) {
	id := c.Param("id")
	var w Workflow
	err := db.QueryRow("SELECT id, name, description, nodes, edges, status, created_at, updated_at FROM workflows WHERE id = ?", id).
		Scan(&w.ID, &w.Name, &w.Description, &w.Nodes, &w.Edges, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, w)
}

func createWorkflow(c *gin.Context) {
	var req struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Nodes       json.RawMessage `json:"nodes"`
		Edges       json.RawMessage `json:"edges"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	id := uuid.New().String()
	_, err := db.Exec(
		"INSERT INTO workflows (id, name, description, nodes, edges, status) VALUES (?, ?, ?, ?, ?, 'draft')",
		id, req.Name, req.Description, req.Nodes, req.Edges,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(201, gin.H{"id": id, "message": "Workflow created"})
}

func updateWorkflow(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Nodes       json.RawMessage `json:"nodes"`
		Edges       json.RawMessage `json:"edges"`
		Status      string          `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	_, err := db.Exec(
		"UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, status = ? WHERE id = ?",
		req.Name, req.Description, req.Nodes, req.Edges, req.Status, id,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Workflow updated"})
}

func deleteWorkflow(c *gin.Context) {
	id := c.Param("id")
	_, err := db.Exec("DELETE FROM workflows WHERE id = ?", id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Workflow deleted"})
}

// ==================== Integrations CRUD ====================

func getIntegrations(c *gin.Context) {
	rows, err := db.Query("SELECT id, type, name, config, created_at, updated_at FROM integrations ORDER BY type")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var integrations []Integration
	for rows.Next() {
		var i Integration
		if err := rows.Scan(&i.ID, &i.Type, &i.Name, &i.Config, &i.CreatedAt, &i.UpdatedAt); err != nil {
			continue
		}
		integrations = append(integrations, i)
	}
	c.JSON(200, integrations)
}

func getIntegration(c *gin.Context) {
	iType := c.Param("type")
	var i Integration
	err := db.QueryRow("SELECT id, type, name, config, created_at, updated_at FROM integrations WHERE type = ?", iType).
		Scan(&i.ID, &i.Type, &i.Name, &i.Config, &i.CreatedAt, &i.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Integration not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, i)
}

func upsertIntegration(c *gin.Context) {
	iType := c.Param("type")
	var req struct {
		Name   string          `json:"name"`
		Config json.RawMessage `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Check if exists
	var existingID string
	err := db.QueryRow("SELECT id FROM integrations WHERE type = ?", iType).Scan(&existingID)

	if err == sql.ErrNoRows {
		id := uuid.New().String()
		_, err = db.Exec("INSERT INTO integrations (id, type, name, config) VALUES (?, ?, ?, ?)",
			id, iType, req.Name, req.Config)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id, "message": "Integration created"})
	} else if err == nil {
		_, err = db.Exec("UPDATE integrations SET name = ?, config = ? WHERE type = ?",
			req.Name, req.Config, iType)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"id": existingID, "message": "Integration updated"})
	} else {
		c.JSON(500, gin.H{"error": err.Error()})
	}
}

func deleteIntegration(c *gin.Context) {
	iType := c.Param("type")
	_, err := db.Exec("DELETE FROM integrations WHERE type = ?", iType)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Integration deleted"})
}

// ==================== Jira Webhook Registration ====================

// registerJiraWebhook creates a webhook on the user's Jira Cloud instance
// via the Jira REST API (POST /rest/webhooks/1.0/webhook)
func registerJiraWebhook(c *gin.Context) {
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

	// Default events if none specified
	if len(req.Events) == 0 {
		req.Events = []string{
			"jira:issue_created",
			"jira:issue_updated",
			"jira:issue_deleted",
		}
	}

	// Build Jira webhook registration payload
	// See: https://developer.atlassian.com/server/jira/platform/webhooks/
	webhookName := fmt.Sprintf("workflow-platform-%s", uuid.New().String()[:8])

	jiraWebhookPayload := map[string]interface{}{
		"name":   webhookName,
		"url":    req.WebhookURL,
		"events": req.Events,
	}

	// Add JQL filter if provided
	if req.JQLFilter != "" {
		jiraWebhookPayload["filters"] = map[string]interface{}{
			"issue-related-events-section": req.JQLFilter,
		}
	}

	payloadBytes, _ := json.Marshal(jiraWebhookPayload)

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
			"error":    fmt.Sprintf("Jira API returned %d", resp.StatusCode),
			"details":  string(respBody),
		})
		return
	}

	// Parse the response to get the webhook ID
	var jiraResp map[string]interface{}
	json.Unmarshal(respBody, &jiraResp)

	webhookID := ""
	if self, ok := jiraResp["self"].(string); ok {
		// Extract ID from self URL
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

func handleJiraWebhook(c *gin.Context) {
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

	// Extract event type from Jira webhook
	eventType := "unknown"
	if we, ok := payload["webhookEvent"].(string); ok {
		eventType = we
	}

	// Store the webhook event
	eventID := uuid.New().String()
	_, err = db.Exec(
		"INSERT INTO webhook_events (id, source, event_type, payload) VALUES (?, 'jira', ?, ?)",
		eventID, eventType, body,
	)
	if err != nil {
		log.Printf("Failed to store webhook event: %v", err)
	}

	log.Printf("📩 Jira webhook received: %s (event_id=%s)", eventType, eventID)

	// Find workflows that have a "jira_webhook" trigger node matching this event
	// and auto-run them
	go processJiraWebhookTrigger(eventID, eventType, body)

	c.JSON(200, gin.H{"status": "received", "event_id": eventID})
}

// processJiraWebhookTrigger finds active workflows with jira_webhook trigger nodes
// and runs them with the webhook payload as input
func processJiraWebhookTrigger(eventID, eventType string, payload []byte) {
	rows, err := db.Query("SELECT id, name, nodes, edges FROM workflows WHERE status = 'active'")
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

		if triggerWorkflowForJiraWebhook(&w, eventID, eventType, payload) {
			break
		}
	}
}

// triggerWorkflowForJiraWebhook checks if workflow has matching jira_webhook trigger and runs it
func triggerWorkflowForJiraWebhook(w *Workflow, eventID, eventType string, payload []byte) bool {
	var nodes []map[string]interface{}
	if err := json.Unmarshal(w.Nodes, &nodes); err != nil {
		return false
	}

	for _, node := range nodes {
		nodeType, _ := node["type"].(string)
		if nodeType != "jira_webhook" {
			continue
		}

		// Check if the event type filter matches
		data, _ := node["data"].(map[string]interface{})
		filterEvent, _ := data["event_filter"].(string)
		if filterEvent != "" && filterEvent != eventType {
			continue
		}

		log.Printf("🚀 Triggering workflow '%s' (id=%s) from Jira webhook event: %s", w.Name, w.ID, eventType)

		runID := uuid.New().String()
		db.Exec(
			"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', ?)",
			runID, w.ID, payload,
		)

		db.Exec("UPDATE webhook_events SET processed = TRUE, workflow_run_id = ? WHERE id = ?", runID, eventID)
		go executeWorkflow(runID, *w, payload)
		return true
	}
	return false
}

func getWebhookEvents(c *gin.Context) {
	rows, err := db.Query("SELECT id, source, event_type, payload, processed, workflow_run_id, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 50")
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

// ==================== Workflow Execution Engine ====================

func runWorkflow(c *gin.Context) {
	workflowID := c.Param("id")

	var req struct {
		Input json.RawMessage `json:"input"`
	}
	c.ShouldBindJSON(&req)

	runID := uuid.New().String()
	_, err := db.Exec(
		"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', ?)",
		runID, workflowID, req.Input,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	var w Workflow
	err = db.QueryRow("SELECT id, name, nodes, edges FROM workflows WHERE id = ?", workflowID).
		Scan(&w.ID, &w.Name, &w.Nodes, &w.Edges)
	if err != nil {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}

	go executeWorkflow(runID, w, req.Input)

	c.JSON(200, gin.H{
		"run_id":  runID,
		"status":  "running",
		"message": "Workflow started",
	})
}

// dryRunNode executes a single node in isolation for testing purposes.
// It does NOT create any DB records — purely a preview/dry-run.
func dryRunNode(c *gin.Context) {
	var req struct {
		NodeType string                 `json:"node_type"`
		Data     map[string]interface{} `json:"data"`
		Input    json.RawMessage        `json:"input"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if req.NodeType == "" {
		c.JSON(400, gin.H{"error": "node_type is required"})
		return
	}

	// Default to empty JSON object if no input provided
	if len(req.Input) == 0 {
		req.Input = json.RawMessage(`{}`)
	}

	log.Printf("🧪 Dry-run node: type=%s", req.NodeType)

	output, errMsg := executeNode(req.NodeType, req.Data, req.Input)

	if errMsg != "" {
		c.JSON(200, gin.H{
			"success": false,
			"error":   errMsg,
			"output":  nil,
		})
		return
	}

	// Parse output for cleaner JSON response
	var outputParsed interface{}
	if output != nil {
		json.Unmarshal(output, &outputParsed)
	}

	c.JSON(200, gin.H{
		"success": true,
		"error":   nil,
		"output":  outputParsed,
	})
}

// executeWorkflow walks through workflow nodes following edges in order and
// executes each node based on its type.
func executeWorkflow(runID string, workflow Workflow, input json.RawMessage) {
	var nodes []map[string]interface{}
	json.Unmarshal(workflow.Nodes, &nodes)

	var edges []map[string]interface{}
	json.Unmarshal(workflow.Edges, &edges)

	adj := buildAdjacencyMap(edges)
	nodeMap, startNodeID := buildNodeMap(nodes)

	if startNodeID == "" && len(nodes) > 0 {
		startNodeID, _ = nodes[0]["id"].(string)
	}

	executeWorkflowGraph(runID, startNodeID, nodeMap, adj, input)
}

// buildAdjacencyMap creates edge adjacency mapping
func buildAdjacencyMap(edges []map[string]interface{}) map[string][]string {
	adj := map[string][]string{}
	for _, edge := range edges {
		// Try both possible key names for source and target
		src, ok1 := edge["source"].(string)
		if !ok1 {
			src, _ = edge["sourceNodeID"].(string)
		}
		tgt, ok2 := edge["target"].(string)
		if !ok2 {
			tgt, _ = edge["targetNodeID"].(string)
		}
		if src != "" && tgt != "" {
			adj[src] = append(adj[src], tgt)
		}
	}
	return adj
}

// buildNodeMap creates node lookup map and finds start node
func buildNodeMap(nodes []map[string]interface{}) (map[string]map[string]interface{}, string) {
	nodeMap := map[string]map[string]interface{}{}
	var startNodeID string
	for _, node := range nodes {
		nid, _ := node["id"].(string)
		nodeMap[nid] = node
		ntype, _ := node["type"].(string)
		if ntype == "start" || ntype == "jira_webhook" {
			startNodeID = nid
		}
	}
	return nodeMap, startNodeID
}

// executeWorkflowGraph walks the graph and executes nodes
func executeWorkflowGraph(runID, startNodeID string, nodeMap map[string]map[string]interface{}, adj map[string][]string, input json.RawMessage) {
	currentData := input
	visited := map[string]bool{}
	queue := []string{startNodeID}

	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]

		if visited[nodeID] {
			continue
		}
		visited[nodeID] = true

		node, ok := nodeMap[nodeID]
		if !ok {
			continue
		}

		nodeType, _ := node["type"].(string)
		data, _ := node["data"].(map[string]interface{})

		if !executeWorkflowNode(runID, nodeID, nodeType, data, &currentData) {
			return // Execution failed
		}

		// Queue next nodes
		for _, next := range adj[nodeID] {
			queue = append(queue, next)
		}
	}

	// Mark run as success
	now := time.Now()
	successMsg := fmt.Sprintf("Workflow completed successfully. %d nodes executed.", len(visited))
	db.Exec("UPDATE workflow_runs SET status = 'success', output = ?, message = ?, finished_at = ? WHERE id = ?",
		currentData, successMsg, now, runID)
	log.Printf("🎉 Workflow run %s completed successfully", runID)
}

// executeWorkflowNode executes a single node and updates currentData
func executeWorkflowNode(runID, nodeID, nodeType string, data map[string]interface{}, currentData *json.RawMessage) bool {
	nodeName := ""
	if title, ok := data["title"].(string); ok {
		nodeName = title
	}

	// Log start
	logID := uuid.New().String()
	db.Exec(
		"INSERT INTO workflow_logs (id, run_id, node_id, node_name, node_type, status, input) VALUES (?, ?, ?, ?, ?, 'started', ?)",
		logID, runID, nodeID, nodeName, nodeType, *currentData,
	)

	// Execute the node
	output, errMsg := executeNode(nodeType, data, *currentData)

	if errMsg != "" {
		db.Exec("UPDATE workflow_logs SET status = 'failed', error_message = ? WHERE id = ?", errMsg, logID)
		now := time.Now()
		failMsg := fmt.Sprintf("Node '%s' (%s) failed: %s", nodeName, nodeType, errMsg)
		db.Exec("UPDATE workflow_runs SET status = 'failed', output = ?, message = ?, finished_at = ? WHERE id = ?",
			output, failMsg, now, runID)
		log.Printf("❌ Node %s (%s) failed: %s", nodeID, nodeType, errMsg)
		return false
	}

	db.Exec("UPDATE workflow_logs SET status = 'completed', output = ? WHERE id = ?", output, logID)
	*currentData = output
	log.Printf("✅ Node %s (%s) completed", nodeID, nodeType)
	return true
}

// executeNode dispatches to the correct executor based on node type
func executeNode(nodeType string, data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	switch nodeType {
	case "start", "jira_webhook":
		// Pass-through — just forward the input
		return input, ""

	case "http_request":
		return executeHTTPRequest(data, input)

	case "jira_create_issue":
		return executeJiraCreateIssue(data, input)

	case "slack_message":
		return executeSlackMessage(data, input)

	case "delay":
		return executeDelay(data, input)

	case "condition":
		// Simple pass-through for now
		return input, ""

	case "transform":
		// Simple pass-through for now
		return input, ""

	case "end":
		return input, ""

	default:
		return input, ""
	}
}

// ==================== Node Executors ====================

// executeHTTPRequest makes a real HTTP call
func executeHTTPRequest(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
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

	timeout := parseHTTPTimeout(data)
	client := &http.Client{Timeout: timeout}
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

// buildHTTPRequestBody creates the request body for POST/PUT/PATCH methods
func buildHTTPRequestBody(method string, data map[string]interface{}, input json.RawMessage, inputMap map[string]interface{}) io.Reader {
	if method != "POST" && method != "PUT" && method != "PATCH" {
		return nil
	}

	bodyStr, _ := data["body"].(string)
	if bodyStr != "" {
		bodyStr = templateReplace(bodyStr, inputMap)
		return strings.NewReader(bodyStr)
	}
	return bytes.NewReader(input)
}

// setHTTPRequestHeaders applies custom headers to the request
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

// setHTTPRequestAuth applies authentication to the request
func setHTTPRequestAuth(req *http.Request, data map[string]interface{}) {
	authType, _ := data["auth_type"].(string)
	switch authType {
	case "bearer":
		if token, _ := data["auth_token"].(string); token != "" {
			req.Header.Set(AuthorizationHeader, "Bearer "+token)
		}
	case "basic":
		username, _ := data["auth_username"].(string)
		password, _ := data["auth_password"].(string)
		if username != "" {
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

// parseHTTPTimeout extracts timeout from node data
func parseHTTPTimeout(data map[string]interface{}) time.Duration {
	timeout := 30 * time.Second
	if ts, ok := data["timeout"].(string); ok && ts != "" {
		if t, err := time.ParseDuration(ts + "s"); err == nil {
			timeout = t
		}
	} else if tf, ok := data["timeout"].(float64); ok && tf > 0 {
		timeout = time.Duration(tf) * time.Second
	}
	return timeout
}

// executeJiraCreateIssue creates a Jira issue via the Jira Cloud REST API
func executeJiraCreateIssue(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	jiraConfig, err := loadIntegrationConfig("jira")
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

	log.Printf("🎫 Jira issue created successfully in project %s", projectKey)
	return json.RawMessage(respBody), ""
}

// buildJiraIssuePayload constructs the Jira issue creation payload
func buildJiraIssuePayload(data map[string]interface{}, inputMap map[string]interface{}) (map[string]interface{}, string, error) {
	projectKey, _ := data["project_key"].(string)
	summary, _ := data["summary"].(string)
	description, _ := data["description"].(string)
	issueType, _ := data["issue_type"].(string)

	if projectKey == "" {
		return nil, "", fmt.Errorf("Jira Create Issue: project_key is required")
	}
	if summary == "" {
		summary = "Issue created by workflow"
	}
	if issueType == "" {
		issueType = "Task"
	}

	summary = templateReplace(summary, inputMap)
	description = templateReplace(description, inputMap)

	// Convert description to Atlassian Document Format (ADF)
	descriptionADF := convertTextToADF(description)

	jiraPayload := map[string]interface{}{
		"fields": map[string]interface{}{
			"project": map[string]string{
				"key": projectKey,
			},
			"summary":     summary,
			"description": descriptionADF,
			"issuetype": map[string]string{
				"name": issueType,
			},
		},
	}

	fields := jiraPayload["fields"].(map[string]interface{})
	addJiraOptionalFields(fields, data)

	return jiraPayload, projectKey, nil
}

// addJiraOptionalFields adds optional fields like priority, assignee, labels
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
			l = strings.TrimSpace(l)
			if l != "" {
				labels = append(labels, l)
			}
		}
		if len(labels) > 0 {
			fields["labels"] = labels
		}
	}
}

// convertTextToADF converts plain text to Atlassian Document Format (ADF)
func convertTextToADF(text string) map[string]interface{} {
	if text == "" {
		text = "No description provided"
	}

	// Split text by newlines to create multiple paragraphs
	lines := strings.Split(text, "\n")
	var contentBlocks []map[string]interface{}

	for _, line := range lines {
		// Each line becomes a paragraph
		paragraph := map[string]interface{}{
			"type": "paragraph",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": line,
				},
			},
		}
		contentBlocks = append(contentBlocks, paragraph)
	}

	return map[string]interface{}{
		"type":    "doc",
		"version": 1,
		"content": contentBlocks,
	}
}

// executeSlackMessage sends a message to a Slack channel using the Bot token
func executeSlackMessage(data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	// Load Slack integration config from DB
	slackConfig, err := loadIntegrationConfig("slack")
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

	// Template substitution from input data
	var inputMap map[string]interface{}
	json.Unmarshal(input, &inputMap)
	messageText = templateReplace(messageText, inputMap)

	slackPayload := map[string]interface{}{
		"channel": channel,
		"text":    messageText,
	}

	// Optional advanced fields
	if username, _ := data["username"].(string); username != "" {
		slackPayload["username"] = username
	}
	if iconEmoji, _ := data["icon_emoji"].(string); iconEmoji != "" {
		slackPayload["icon_emoji"] = iconEmoji
	}
	if threadTs, _ := data["thread_ts"].(string); threadTs != "" {
		threadTs = templateReplace(threadTs, inputMap)
		if threadTs != "" {
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

	// Check Slack response
	var slackResp map[string]interface{}
	json.Unmarshal(respBody, &slackResp)

	if ok, _ := slackResp["ok"].(bool); !ok {
		errStr, _ := slackResp["error"].(string)
		return json.RawMessage(respBody), fmt.Sprintf("Slack API error: %s", errStr)
	}

	log.Printf("💬 Slack message sent to #%s", channel)
	return json.RawMessage(respBody), ""
}

// executeDelay waits for the configured duration
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
	default: // "ms" or empty
		duration = time.Duration(delayVal) * time.Millisecond
	}

	log.Printf("⏱️ Delay node: waiting %v", duration)
	time.Sleep(duration)
	return input, ""
}

// ==================== Helpers ====================

// loadIntegrationConfig loads the config JSON for a given integration type
func loadIntegrationConfig(iType string) (map[string]interface{}, error) {
	var configRaw json.RawMessage
	err := db.QueryRow("SELECT config FROM integrations WHERE type = ?", iType).Scan(&configRaw)
	if err != nil {
		return nil, err
	}

	var config map[string]interface{}
	if err := json.Unmarshal(configRaw, &config); err != nil {
		return nil, err
	}
	return config, nil
}

// templateReplace does simple {{key}} replacement from a map
func templateReplace(tmpl string, data map[string]interface{}) string {
	if data == nil {
		return tmpl
	}
	result := tmpl
	for key, val := range data {
		placeholder := "{{" + key + "}}"
		valStr := fmt.Sprintf("%v", val)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}
	return result
}

// ==================== Run Handlers ====================

func getRuns(c *gin.Context) {
	rows, err := db.Query("SELECT id, workflow_id, status, input, output, COALESCE(message, '') as message, started_at, finished_at FROM workflow_runs ORDER BY started_at DESC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	runs := []WorkflowRun{}
	for rows.Next() {
		var r WorkflowRun
		var input, output sql.NullString
		if err := rows.Scan(&r.ID, &r.WorkflowID, &r.Status, &input, &output, &r.Message, &r.StartedAt, &r.FinishedAt); err != nil {
			log.Printf("Failed to scan run row: %v", err)
			continue
		}
		if input.Valid {
			r.Input = json.RawMessage(input.String)
		}
		if output.Valid {
			r.Output = json.RawMessage(output.String)
		}
		runs = append(runs, r)
	}
	c.JSON(200, runs)
}

func getRun(c *gin.Context) {
	id := c.Param("id")
	var r WorkflowRun
	var input, output sql.NullString
	var message sql.NullString
	err := db.QueryRow("SELECT id, workflow_id, status, input, output, COALESCE(message, '') as message, started_at, finished_at FROM workflow_runs WHERE id = ?", id).
		Scan(&r.ID, &r.WorkflowID, &r.Status, &input, &output, &message, &r.StartedAt, &r.FinishedAt)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Run not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if input.Valid {
		r.Input = json.RawMessage(input.String)
	}
	if output.Valid {
		r.Output = json.RawMessage(output.String)
	}
	if message.Valid {
		r.Message = message.String
	}
	c.JSON(200, r)
}

func getRunLogs(c *gin.Context) {
	runID := c.Param("id")
	rows, err := db.Query("SELECT id, run_id, node_id, node_name, node_type, status, input, output, error_message, created_at FROM workflow_logs WHERE run_id = ? ORDER BY created_at", runID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var logs []WorkflowLog
	for rows.Next() {
		var l WorkflowLog
		var inputStr, outputStr sql.NullString
		if err := rows.Scan(&l.ID, &l.RunID, &l.NodeID, &l.NodeName, &l.NodeType, &l.Status, &inputStr, &outputStr, &l.ErrorMessage, &l.CreatedAt); err != nil {
			log.Printf("Failed to scan log row: %v", err)
			continue
		}
		// Convert sql.NullString to json.RawMessage
		if inputStr.Valid && inputStr.String != "" {
			l.Input = json.RawMessage(inputStr.String)
		} else {
			l.Input = json.RawMessage("{}")
		}
		if outputStr.Valid && outputStr.String != "" {
			l.Output = json.RawMessage(outputStr.String)
		} else {
			l.Output = json.RawMessage("{}")
		}
		logs = append(logs, l)
	}
	
	// Return empty array instead of null
	if logs == nil {
		logs = []WorkflowLog{}
	}
	
	c.JSON(200, logs)
}
