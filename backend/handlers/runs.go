package handlers

import (
	"database/sql"
	"encoding/json"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== Run Handlers ====================

func (h *Handler) getRuns(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, workflow_id, status, input, output, COALESCE(message, '') as message, started_at, finished_at FROM workflow_runs ORDER BY started_at DESC")
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

func (h *Handler) getRun(c *gin.Context) {
	id := c.Param("id")
	var r WorkflowRun
	var input, output, message sql.NullString
	err := h.db.QueryRow("SELECT id, workflow_id, status, input, output, COALESCE(message, '') as message, started_at, finished_at FROM workflow_runs WHERE id = ?", id).
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

func (h *Handler) getRunLogs(c *gin.Context) {
	runID := c.Param("id")
	rows, err := h.db.Query("SELECT id, run_id, node_id, node_name, node_type, status, input, output, error_message, created_at FROM workflow_logs WHERE run_id = ? ORDER BY created_at", runID)
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

	if logs == nil {
		logs = []WorkflowLog{}
	}
	c.JSON(200, logs)
}

func (h *Handler) runWorkflow(c *gin.Context) {
	workflowID := c.Param("id")

	var req struct {
		Input json.RawMessage `json:"input"`
	}
	c.ShouldBindJSON(&req)

	runID := uuid.New().String()
	_, err := h.db.Exec(
		"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', ?)",
		runID, workflowID, req.Input,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	var w Workflow
	err = h.db.QueryRow("SELECT id, name, nodes, edges FROM workflows WHERE id = ?", workflowID).
		Scan(&w.ID, &w.Name, &w.Nodes, &w.Edges)
	if err != nil {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}

	go h.executeWorkflow(runID, w, req.Input)

	c.JSON(200, gin.H{
		"run_id":  runID,
		"status":  "running",
		"message": "Workflow started",
	})
}

// dryRunNode executes a single node in isolation for testing — no DB records created.
func (h *Handler) dryRunNode(c *gin.Context) {
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
	if len(req.Input) == 0 {
		req.Input = json.RawMessage(`{}`)
	}

	log.Printf("🧪 Dry-run node: type=%s", req.NodeType)
	output, errMsg := h.executeNode(req.NodeType, req.Data, req.Input)

	if errMsg != "" {
		c.JSON(200, gin.H{"success": false, "error": errMsg, "output": nil})
		return
	}

	var outputParsed interface{}
	if output != nil {
		json.Unmarshal(output, &outputParsed)
	}
	c.JSON(200, gin.H{"success": true, "error": nil, "output": outputParsed})
}
