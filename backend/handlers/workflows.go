package handlers

import (
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== Workflow CRUD ====================

func (h *Handler) getWorkflows(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, name, description, nodes, edges, status, trigger_type, cron_schedule, last_cron_run, active_env_id, created_at, updated_at FROM workflows ORDER BY created_at DESC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var workflows []Workflow
	for rows.Next() {
		var w Workflow
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Nodes, &w.Edges, &w.Status, &w.TriggerType, &w.CronSchedule, &w.LastCronRun, &w.ActiveEnvID, &w.CreatedAt, &w.UpdatedAt); err != nil {
			continue
		}
		workflows = append(workflows, w)
	}
	c.JSON(200, workflows)
}

func (h *Handler) getWorkflow(c *gin.Context) {
	id := c.Param("id")
	var w Workflow
	err := h.db.QueryRow("SELECT id, name, description, nodes, edges, status, trigger_type, cron_schedule, last_cron_run, active_env_id, created_at, updated_at FROM workflows WHERE id = ?", id).
		Scan(&w.ID, &w.Name, &w.Description, &w.Nodes, &w.Edges, &w.Status, &w.TriggerType, &w.CronSchedule, &w.LastCronRun, &w.ActiveEnvID, &w.CreatedAt, &w.UpdatedAt)
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

func (h *Handler) createWorkflow(c *gin.Context) {
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
	_, err := h.db.Exec(
		"INSERT INTO workflows (id, name, description, nodes, edges, status) VALUES (?, ?, ?, ?, ?, 'draft')",
		id, req.Name, req.Description, req.Nodes, req.Edges,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(201, gin.H{"id": id, "message": "Workflow created"})
}

func (h *Handler) updateWorkflow(c *gin.Context) {
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
	_, err := h.db.Exec(
		"UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, status = ? WHERE id = ?",
		req.Name, req.Description, req.Nodes, req.Edges, req.Status, id,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	h.syncTriggerFromStartNode(id, req.Nodes)

	c.JSON(200, gin.H{"message": "Workflow updated"})
}

// syncTriggerFromStartNode extracts trigger_type and cron_schedule from the
// start node's data and syncs them to the workflow-level columns.
func (h *Handler) syncTriggerFromStartNode(workflowID string, nodesJSON json.RawMessage) {
	var nodes []struct {
		Type string                 `json:"type"`
		Data map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(nodesJSON, &nodes); err != nil {
		return
	}

	hasWebhookNode := false
	for _, n := range nodes {
		if n.Type == "jira_webhook" {
			hasWebhookNode = true
			break
		}
	}

	for _, n := range nodes {
		if n.Type == "start" {
			triggerType, _ := n.Data["trigger_type"].(string)
			cronSchedule, _ := n.Data["cron_schedule"].(string)

			if triggerType == "" {
				if hasWebhookNode {
					triggerType = "trigger"
				} else {
					triggerType = "schedule"
				}
			}

			var cronPtr *string
			if triggerType == "schedule" && cronSchedule != "" {
				cronPtr = &cronSchedule
			}

			h.db.Exec(
				"UPDATE workflows SET trigger_type = ?, cron_schedule = ? WHERE id = ?",
				triggerType, cronPtr, workflowID,
			)
			return
		}
	}
}

func (h *Handler) deleteWorkflow(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec("DELETE FROM workflows WHERE id = ?", id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Workflow deleted"})
}

func (h *Handler) updateWorkflowTrigger(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		TriggerType  string  `json:"trigger_type"`
		CronSchedule *string `json:"cron_schedule"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.TriggerType != "manual" && req.TriggerType != "cron" && req.TriggerType != "webhook" {
		c.JSON(400, gin.H{"error": "trigger_type must be 'manual', 'cron', or 'webhook'"})
		return
	}

	if req.TriggerType == "cron" {
		if req.CronSchedule == nil || *req.CronSchedule == "" {
			c.JSON(400, gin.H{"error": "cron_schedule is required when trigger_type is 'cron'"})
			return
		}
		if !isValidCronSchedule(*req.CronSchedule) {
			c.JSON(400, gin.H{"error": "Invalid cron schedule format"})
			return
		}
	}

	_, err := h.db.Exec(
		"UPDATE workflows SET trigger_type = ?, cron_schedule = ? WHERE id = ?",
		req.TriggerType, req.CronSchedule, id,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Trigger updated"})
}

func isValidCronSchedule(schedule string) bool {
	schedule = strings.TrimSpace(schedule)
	if schedule == "" {
		return false
	}
	if strings.HasPrefix(schedule, "@every ") || schedule == "@hourly" ||
		schedule == "@daily" || schedule == "@weekly" || schedule == "@monthly" {
		return true
	}
	return len(strings.Fields(schedule)) == 5
}
