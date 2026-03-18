package handlers

import (
	"database/sql"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ==================== Integrations CRUD ====================

func (h *Handler) getIntegrations(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, type, name, config, created_at, updated_at FROM integrations ORDER BY type")
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

func (h *Handler) getIntegration(c *gin.Context) {
	iType := c.Param("type")
	var i Integration
	err := h.db.QueryRow("SELECT id, type, name, config, created_at, updated_at FROM integrations WHERE type = ?", iType).
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

func (h *Handler) upsertIntegration(c *gin.Context) {
	iType := c.Param("type")
	var req struct {
		Name   string          `json:"name"`
		Config json.RawMessage `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var existingID string
	err := h.db.QueryRow("SELECT id FROM integrations WHERE type = ?", iType).Scan(&existingID)

	if err == sql.ErrNoRows {
		id := uuid.New().String()
		_, err = h.db.Exec("INSERT INTO integrations (id, type, name, config) VALUES (?, ?, ?, ?)",
			id, iType, req.Name, req.Config)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id, "message": "Integration created"})
	} else if err == nil {
		_, err = h.db.Exec("UPDATE integrations SET name = ?, config = ? WHERE type = ?",
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

func (h *Handler) deleteIntegration(c *gin.Context) {
	iType := c.Param("type")
	_, err := h.db.Exec("DELETE FROM integrations WHERE type = ?", iType)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "Integration deleted"})
}
