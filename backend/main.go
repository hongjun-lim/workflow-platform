package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
)

var db *sql.DB

// Models
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

func main() {
	// 连接数据库
	var err error
	dsn := "root:password@tcp(localhost:3306)/workflow_db?parseTime=true"
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// 测试连接
	if err = db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}
	log.Println("Connected to MySQL!")

	// 设置 Gin
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Routes
	api := r.Group("/api")
	{
		// Workflows
		api.GET("/workflows", getWorkflows)
		api.GET("/workflows/:id", getWorkflow)
		api.POST("/workflows", createWorkflow)
		api.PUT("/workflows/:id", updateWorkflow)
		api.DELETE("/workflows/:id", deleteWorkflow)

		// Runs
		api.POST("/workflows/:id/run", runWorkflow)
		api.GET("/runs", getRuns)
		api.GET("/runs/:id", getRun)
		api.GET("/runs/:id/logs", getRunLogs)
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	log.Println("Server running on http://localhost:8081")
	r.Run(":8081")
}

// ============ Workflow Handlers ============

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
		err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Nodes, &w.Edges, &w.Status, &w.CreatedAt, &w.UpdatedAt)
		if err != nil {
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

// ============ Run Handlers ============

func runWorkflow(c *gin.Context) {
	workflowID := c.Param("id")

	var req struct {
		Input json.RawMessage `json:"input"`
	}
	c.ShouldBindJSON(&req)

	// 创建 run 记录
	runID := uuid.New().String()
	_, err := db.Exec(
		"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', ?)",
		runID, workflowID, req.Input,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 获取 workflow
	var w Workflow
	err = db.QueryRow("SELECT id, nodes, edges FROM workflows WHERE id = ?", workflowID).
		Scan(&w.ID, &w.Nodes, &w.Edges)

	if err != nil {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}

	// 异步执行
	go executeWorkflow(runID, w, req.Input)

	c.JSON(200, gin.H{
		"run_id":  runID,
		"status":  "running",
		"message": "Workflow started",
	})
}

func executeWorkflow(runID string, workflow Workflow, input json.RawMessage) {
	// 解析 nodes
	var nodes []map[string]interface{}
	json.Unmarshal(workflow.Nodes, &nodes)

	currentData := input

	for _, node := range nodes {
		nodeID := node["id"].(string)
		nodeName := ""
		nodeType := ""

		if name, ok := node["data"].(map[string]interface{})["label"]; ok {
			nodeName = name.(string)
		}
		if t, ok := node["type"]; ok {
			nodeType = t.(string)
		}

		// 记录开始
		logID := uuid.New().String()
		db.Exec(
			"INSERT INTO workflow_logs (id, run_id, node_id, node_name, node_type, status, input) VALUES (?, ?, ?, ?, ?, 'started', ?)",
			logID, runID, nodeID, nodeName, nodeType, currentData,
		)

		// 模拟执行
		time.Sleep(1 * time.Second)

		// 记录完成
		output := currentData // 简单版本直接传递
		db.Exec(
			"UPDATE workflow_logs SET status = 'completed', output = ? WHERE id = ?",
			output, logID,
		)
	}

	// 更新 run 状态
	now := time.Now()
	db.Exec(
		"UPDATE workflow_runs SET status = 'success', output = ?, finished_at = ? WHERE id = ?",
		currentData, now, runID,
	)
}

func getRuns(c *gin.Context) {
	rows, err := db.Query("SELECT id, workflow_id, status, input, output, started_at, finished_at FROM workflow_runs ORDER BY started_at DESC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var runs []WorkflowRun
	for rows.Next() {
		var r WorkflowRun
		err := rows.Scan(&r.ID, &r.WorkflowID, &r.Status, &r.Input, &r.Output, &r.StartedAt, &r.FinishedAt)
		if err != nil {
			continue
		}
		runs = append(runs, r)
	}

	c.JSON(200, runs)
}

func getRun(c *gin.Context) {
	id := c.Param("id")

	var r WorkflowRun
	err := db.QueryRow("SELECT id, workflow_id, status, input, output, started_at, finished_at FROM workflow_runs WHERE id = ?", id).
		Scan(&r.ID, &r.WorkflowID, &r.Status, &r.Input, &r.Output, &r.StartedAt, &r.FinishedAt)

	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Run not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
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
		err := rows.Scan(&l.ID, &l.RunID, &l.NodeID, &l.NodeName, &l.NodeType, &l.Status, &l.Input, &l.Output, &l.ErrorMessage, &l.CreatedAt)
		if err != nil {
			continue
		}
		logs = append(logs, l)
	}

	c.JSON(200, logs)
}