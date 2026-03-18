package handlers

import (
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== Environments ====================

func (h *Handler) getEnvironments(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, name, variables, color, is_default, created_at, updated_at FROM environments ORDER BY is_default DESC, name ASC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	envs := []Environment{}
	for rows.Next() {
		var e Environment
		var varsJSON []byte
		if err := rows.Scan(&e.ID, &e.Name, &varsJSON, &e.Color, &e.IsDefault, &e.CreatedAt, &e.UpdatedAt); err != nil {
			continue
		}
		e.Variables = map[string]string{}
		json.Unmarshal(varsJSON, &e.Variables)
		envs = append(envs, e)
	}
	c.JSON(200, envs)
}

func (h *Handler) createEnvironment(c *gin.Context) {
	var req struct {
		Name      string            `json:"name"`
		Variables map[string]string `json:"variables"`
		Color     string            `json:"color"`
		IsDefault bool              `json:"is_default"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(400, gin.H{"error": "name is required"})
		return
	}
	if req.Variables == nil {
		req.Variables = map[string]string{}
	}
	if req.Color == "" {
		req.Color = "#6b7280"
	}

	id := uuid.New().String()
	varsJSON, _ := json.Marshal(req.Variables)

	if req.IsDefault {
		h.db.Exec("UPDATE environments SET is_default = FALSE")
	}

	_, err := h.db.Exec(
		"INSERT INTO environments (id, name, variables, color, is_default) VALUES (?, ?, ?, ?, ?)",
		id, req.Name, varsJSON, req.Color, req.IsDefault,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(201, gin.H{"id": id, "message": "Environment created"})
}

func (h *Handler) updateEnvironment(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name      string            `json:"name"`
		Variables map[string]string `json:"variables"`
		Color     string            `json:"color"`
		IsDefault bool              `json:"is_default"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	varsJSON, _ := json.Marshal(req.Variables)

	if req.IsDefault {
		h.db.Exec("UPDATE environments SET is_default = FALSE")
	}

	_, err := h.db.Exec(
		"UPDATE environments SET name = ?, variables = ?, color = ?, is_default = ? WHERE id = ?",
		req.Name, varsJSON, req.Color, req.IsDefault, id,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Environment updated"})
}

func (h *Handler) deleteEnvironment(c *gin.Context) {
	id := c.Param("id")
	h.db.Exec("UPDATE workflows SET active_env_id = NULL WHERE active_env_id = ?", id)
	_, err := h.db.Exec("DELETE FROM environments WHERE id = ?", id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Environment deleted"})
}

func (h *Handler) setWorkflowActiveEnv(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		EnvID *string `json:"env_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.Exec("UPDATE workflows SET active_env_id = ? WHERE id = ?", req.EnvID, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Active environment updated"})
}

// loadEnvVariables loads the environment variable map for a workflow's active environment.
func (h *Handler) loadEnvVariables(workflowID string) map[string]string {
	var envID *string
	err := h.db.QueryRow("SELECT active_env_id FROM workflows WHERE id = ?", workflowID).Scan(&envID)
	if err != nil || envID == nil {
		return map[string]string{}
	}

	var varsJSON []byte
	err = h.db.QueryRow("SELECT variables FROM environments WHERE id = ?", *envID).Scan(&varsJSON)
	if err != nil {
		return map[string]string{}
	}

	vars := map[string]string{}
	json.Unmarshal(varsJSON, &vars)
	return vars
}
