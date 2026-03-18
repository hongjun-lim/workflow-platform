package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ==================== Cron Scheduler ====================

// StartCronScheduler runs every 60 seconds and triggers scheduled workflows.
func (h *Handler) StartCronScheduler() {
	log.Println("🕐 Cron scheduler started")
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		h.checkAndRunCronWorkflows()
	}
}

func (h *Handler) checkAndRunCronWorkflows() {
	rows, err := h.db.Query(
		"SELECT id, name, nodes, edges, cron_schedule, last_cron_run FROM workflows WHERE status = 'active' AND trigger_type = 'schedule' AND cron_schedule IS NOT NULL",
	)
	if err != nil {
		log.Printf("Cron scheduler query failed: %v", err)
		return
	}
	defer rows.Close()

	now := time.Now()

	for rows.Next() {
		var w Workflow
		if err := rows.Scan(&w.ID, &w.Name, &w.Nodes, &w.Edges, &w.CronSchedule, &w.LastCronRun); err != nil {
			continue
		}

		if w.CronSchedule == nil {
			continue
		}

		if shouldRunCron(*w.CronSchedule, w.LastCronRun, now) {
			log.Printf("🕐 Cron triggering workflow '%s' (id=%s, schedule=%s)", w.Name, w.ID, *w.CronSchedule)

			runID := uuid.New().String()
			h.db.Exec(
				"INSERT INTO workflow_runs (id, workflow_id, status, input) VALUES (?, ?, 'running', '{}')",
				runID, w.ID,
			)
			h.db.Exec("UPDATE workflows SET last_cron_run = ? WHERE id = ?", now, w.ID)

			go h.executeWorkflow(runID, w, json.RawMessage(`{}`))
		}
	}
}

// shouldRunCron determines if a cron workflow should run based on its schedule.
func shouldRunCron(schedule string, lastRun *time.Time, now time.Time) bool {
	schedule = strings.TrimSpace(schedule)

	if strings.HasPrefix(schedule, "@every ") {
		durationStr := strings.TrimPrefix(schedule, "@every ")
		d, err := time.ParseDuration(durationStr)
		if err != nil {
			return false
		}
		if lastRun == nil {
			return true
		}
		return now.Sub(*lastRun) >= d
	}

	var interval time.Duration
	switch schedule {
	case "@hourly":
		interval = time.Hour
	case "@daily":
		interval = 24 * time.Hour
	case "@weekly":
		interval = 7 * 24 * time.Hour
	case "@monthly":
		interval = 30 * 24 * time.Hour
	default:
		return shouldRunStandardCron(schedule, lastRun, now)
	}

	if lastRun == nil {
		return true
	}
	return now.Sub(*lastRun) >= interval
}

// shouldRunStandardCron handles standard 5-field cron: min hour dom month dow.
func shouldRunStandardCron(schedule string, lastRun *time.Time, now time.Time) bool {
	fields := strings.Fields(schedule)
	if len(fields) != 5 {
		return false
	}

	if !cronFieldMatches(fields[0], now.Minute()) {
		return false
	}
	if !cronFieldMatches(fields[1], now.Hour()) {
		return false
	}

	if lastRun != nil && lastRun.Truncate(time.Minute).Equal(now.Truncate(time.Minute)) {
		return false
	}

	return true
}

// cronFieldMatches checks if a cron field matches a value.
// Supports: * (any), exact number, */interval.
func cronFieldMatches(field string, value int) bool {
	if field == "*" {
		return true
	}
	var exact int
	if _, err := fmt.Sscanf(field, "%d", &exact); err == nil {
		return exact == value
	}
	var interval int
	if _, err := fmt.Sscanf(field, "*/%d", &interval); err == nil && interval > 0 {
		return value%interval == 0
	}
	return false
}
