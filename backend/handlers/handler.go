package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ==================== Constants ====================

const (
	ContentTypeJSON     = "application/json"
	ContentTypeHeader   = "Content-Type"
	AuthorizationHeader = "Authorization"
)

// ==================== Handler ====================

// Handler holds shared dependencies for all HTTP handler methods.
type Handler struct {
	db *sql.DB
}

// New creates a new Handler with the given database connection.
func New(db *sql.DB) *Handler {
	return &Handler{db: db}
}

// RegisterRoutes attaches all API routes to the given gin Engine.
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		// Workflows
		api.GET("/workflows", h.getWorkflows)
		api.GET("/workflows/:id", h.getWorkflow)
		api.POST("/workflows", h.createWorkflow)
		api.PUT("/workflows/:id", h.updateWorkflow)
		api.DELETE("/workflows/:id", h.deleteWorkflow)

		// Runs
		api.POST("/workflows/:id/run", h.runWorkflow)
		api.GET("/runs", h.getRuns)
		api.GET("/runs/:id", h.getRun)
		api.GET("/runs/:id/logs", h.getRunLogs)

		// Integrations
		api.GET("/integrations", h.getIntegrations)
		api.GET("/integrations/:type", h.getIntegration)
		api.PUT("/integrations/:type", h.upsertIntegration)
		api.DELETE("/integrations/:type", h.deleteIntegration)

		// Node dry-run
		api.POST("/nodes/dry-run", h.dryRunNode)

		// Jira webhook management
		api.POST("/jira/register-webhook", h.registerJiraWebhook)

		// Webhook events log
		api.GET("/webhook-events", h.getWebhookEvents)

		// Workflow trigger settings
		api.PUT("/workflows/:id/trigger", h.updateWorkflowTrigger)

		// Environments
		api.GET("/environments", h.getEnvironments)
		api.POST("/environments", h.createEnvironment)
		api.PUT("/environments/:id", h.updateEnvironment)
		api.DELETE("/environments/:id", h.deleteEnvironment)

		// Workflow active environment
		api.PUT("/workflows/:id/env", h.setWorkflowActiveEnv)

		// Node schemas
		api.GET("/node-schemas", h.getNodeSchemas)
		api.GET("/node-schemas/:type", h.getNodeSchema)
		api.PUT("/node-schemas/:type", h.upsertNodeSchema)
		api.DELETE("/node-schemas/:type", h.deleteNodeSchema)
	}

	// Webhook receivers (public endpoints — no /api prefix)
	r.POST("/webhooks/jira", h.handleJiraWebhook)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}
