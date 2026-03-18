package handlers

import (
	"encoding/json"
	"time"
)

// ==================== Models ====================

type Workflow struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Nodes        json.RawMessage `json:"nodes"`
	Edges        json.RawMessage `json:"edges"`
	Status       string          `json:"status"`
	TriggerType  string          `json:"trigger_type"`
	CronSchedule *string         `json:"cron_schedule"`
	LastCronRun  *time.Time      `json:"last_cron_run"`
	ActiveEnvID  *string         `json:"active_env_id"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type Environment struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
	Color     string            `json:"color"`
	IsDefault bool              `json:"is_default"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
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

type NodeSchema struct {
	Type          string          `json:"type"`
	Label         string          `json:"label"`
	Icon          string          `json:"icon"`
	Color         string          `json:"color"`
	Category      string          `json:"category"`
	Description   string          `json:"description"`
	AuthType      *string         `json:"auth_type"`
	Fields        json.RawMessage `json:"fields"`
	ExecuteConfig json.RawMessage `json:"execute_config"`
	IsTrigger     bool            `json:"is_trigger"`
	IsBuiltin     bool            `json:"is_builtin"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}
