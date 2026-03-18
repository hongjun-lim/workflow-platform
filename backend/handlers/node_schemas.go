package handlers

import (
	"database/sql"
	"encoding/json"

	"github.com/gin-gonic/gin"
)

// ==================== Node Schema Handlers ====================

func (h *Handler) getNodeSchemas(c *gin.Context) {
	rows, err := h.db.Query("SELECT type, label, icon, color, COALESCE(category,'') as category, COALESCE(description,'') as description, auth_type, fields, execute_config, is_trigger, is_builtin, created_at, updated_at FROM node_schemas ORDER BY is_trigger DESC, label ASC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	schemas := []NodeSchema{}
	for rows.Next() {
		var s NodeSchema
		var execCfg sql.NullString
		if err := rows.Scan(&s.Type, &s.Label, &s.Icon, &s.Color, &s.Category, &s.Description, &s.AuthType, &s.Fields, &execCfg, &s.IsTrigger, &s.IsBuiltin, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		if execCfg.Valid {
			s.ExecuteConfig = json.RawMessage(execCfg.String)
		}
		schemas = append(schemas, s)
	}
	c.JSON(200, schemas)
}

func (h *Handler) getNodeSchema(c *gin.Context) {
	t := c.Param("type")
	s, err := h.fetchNodeSchemaByType(t)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Schema not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, s)
}

func (h *Handler) fetchNodeSchemaByType(t string) (NodeSchema, error) {
	var s NodeSchema
	var execCfg sql.NullString
	err := h.db.QueryRow("SELECT type, label, icon, color, COALESCE(category,'') as category, COALESCE(description,'') as description, auth_type, fields, execute_config, is_trigger, is_builtin, created_at, updated_at FROM node_schemas WHERE type = ?", t).
		Scan(&s.Type, &s.Label, &s.Icon, &s.Color, &s.Category, &s.Description, &s.AuthType, &s.Fields, &execCfg, &s.IsTrigger, &s.IsBuiltin, &s.CreatedAt, &s.UpdatedAt)
	if execCfg.Valid {
		s.ExecuteConfig = json.RawMessage(execCfg.String)
	}
	return s, err
}

func (h *Handler) upsertNodeSchema(c *gin.Context) {
	t := c.Param("type")
	var req struct {
		Label         string          `json:"label"`
		Icon          string          `json:"icon"`
		Color         string          `json:"color"`
		Category      string          `json:"category"`
		Description   string          `json:"description"`
		AuthType      *string         `json:"auth_type"`
		Fields        json.RawMessage `json:"fields"`
		ExecuteConfig json.RawMessage `json:"execute_config"`
		IsTrigger     bool            `json:"is_trigger"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if req.Label == "" {
		c.JSON(400, gin.H{"error": "label is required"})
		return
	}
	if req.Icon == "" {
		req.Icon = "📦"
	}
	if req.Color == "" {
		req.Color = "#4299e1"
	}
	if req.Fields == nil {
		req.Fields = json.RawMessage(`[]`)
	}

	_, err := h.db.Exec(
		`INSERT INTO node_schemas (type, label, icon, color, category, description, auth_type, fields, execute_config, is_trigger, is_builtin)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
		 ON DUPLICATE KEY UPDATE label=VALUES(label), icon=VALUES(icon), color=VALUES(color),
		   category=VALUES(category), description=VALUES(description), auth_type=VALUES(auth_type),
		   fields=VALUES(fields), execute_config=VALUES(execute_config), is_trigger=VALUES(is_trigger)`,
		t, req.Label, req.Icon, req.Color, req.Category, req.Description, req.AuthType, req.Fields, req.ExecuteConfig, req.IsTrigger,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Schema saved", "type": t})
}

func (h *Handler) deleteNodeSchema(c *gin.Context) {
	t := c.Param("type")
	var isBuiltin bool
	err := h.db.QueryRow("SELECT is_builtin FROM node_schemas WHERE type = ?", t).Scan(&isBuiltin)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Schema not found"})
		return
	}
	if isBuiltin {
		c.JSON(400, gin.H{"error": "Cannot delete built-in node schemas"})
		return
	}
	h.db.Exec("DELETE FROM node_schemas WHERE type = ?", t)
	c.JSON(200, gin.H{"message": "Schema deleted"})
}
