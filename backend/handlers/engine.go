package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// ==================== Workflow Execution Engine ====================

func (h *Handler) executeWorkflow(runID string, workflow Workflow, input json.RawMessage) {
	var nodes []map[string]interface{}
	json.Unmarshal(workflow.Nodes, &nodes)

	var edges []map[string]interface{}
	json.Unmarshal(workflow.Edges, &edges)

	adj := buildAdjacencyMap(edges)
	nodeMap, startNodeID := buildNodeMap(nodes)

	if startNodeID == "" && len(nodes) > 0 {
		startNodeID, _ = nodes[0]["id"].(string)
	}

	envVars := h.loadEnvVariables(workflow.ID)
	if len(envVars) > 0 {
		log.Printf("🌐 Loaded %d env variables for workflow %s", len(envVars), workflow.ID)
	}

	h.executeWorkflowGraph(runID, startNodeID, nodeMap, adj, input, envVars)
}

// buildAdjacencyMap creates edge adjacency mapping.
func buildAdjacencyMap(edges []map[string]interface{}) map[string][]string {
	adj := map[string][]string{}
	for _, edge := range edges {
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

// buildNodeMap creates node lookup map and finds start node.
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

// executeWorkflowGraph walks the graph and executes nodes in BFS order.
func (h *Handler) executeWorkflowGraph(runID, startNodeID string, nodeMap map[string]map[string]interface{}, adj map[string][]string, input json.RawMessage, envVars map[string]string) {
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

		if len(envVars) > 0 {
			data = resolveEnvVarsInData(data, envVars)
		}

		if !h.executeWorkflowNode(runID, nodeID, nodeType, data, &currentData) {
			return
		}

		for _, next := range adj[nodeID] {
			queue = append(queue, next)
		}
	}

	now := time.Now()
	successMsg := fmt.Sprintf("Workflow completed successfully. %d nodes executed.", len(visited))
	h.db.Exec("UPDATE workflow_runs SET status = 'success', output = ?, message = ?, finished_at = ? WHERE id = ?",
		currentData, successMsg, now, runID)
	log.Printf("🎉 Workflow run %s completed successfully", runID)
}

// executeWorkflowNode executes a single node and updates currentData.
func (h *Handler) executeWorkflowNode(runID, nodeID, nodeType string, data map[string]interface{}, currentData *json.RawMessage) bool {
	nodeName := ""
	if title, ok := data["title"].(string); ok {
		nodeName = title
	}

	logID := uuid.New().String()
	h.db.Exec(
		"INSERT INTO workflow_logs (id, run_id, node_id, node_name, node_type, status, input) VALUES (?, ?, ?, ?, ?, 'started', ?)",
		logID, runID, nodeID, nodeName, nodeType, *currentData,
	)

	output, errMsg := h.executeNode(nodeType, data, *currentData)

	if errMsg != "" {
		h.db.Exec("UPDATE workflow_logs SET status = 'failed', error_message = ? WHERE id = ?", errMsg, logID)
		now := time.Now()
		failMsg := fmt.Sprintf("Node '%s' (%s) failed: %s", nodeName, nodeType, errMsg)
		h.db.Exec("UPDATE workflow_runs SET status = 'failed', output = ?, message = ?, finished_at = ? WHERE id = ?",
			output, failMsg, now, runID)
		log.Printf("❌ Node %s (%s) failed: %s", nodeID, nodeType, errMsg)
		return false
	}

	h.db.Exec("UPDATE workflow_logs SET status = 'completed', output = ? WHERE id = ?", output, logID)
	*currentData = output
	log.Printf("✅ Node %s (%s) completed", nodeID, nodeType)
	return true
}

// executeNode dispatches to the correct executor based on node type.
func (h *Handler) executeNode(nodeType string, data map[string]interface{}, input json.RawMessage) (json.RawMessage, string) {
	switch nodeType {
	case "start", "jira_webhook":
		return input, ""
	case "http_request":
		return h.executeHTTPRequest(data, input)
	case "jira_create_issue":
		return h.executeJiraCreateIssue(data, input)
	case "slack_message":
		return h.executeSlackMessage(data, input)
	case "datadog_event":
		return h.executeDatadogEvent(data, input)
	case "delay":
		return executeDelay(data, input)
	case "condition", "transform", "end":
		return input, ""
	default:
		return h.executeCustomNode(nodeType, data, input)
	}
}
