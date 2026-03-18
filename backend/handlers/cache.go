package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// ==================== Jira Account ID Cache ====================

var (
	jiraAccountIDCache  string
	jiraAccountIDExpiry time.Time
	jiraAccountIDMu     sync.Mutex
)

// getJiraAccountID returns the accountId of the Jira integration user, cached for 1 hour.
func (h *Handler) getJiraAccountID() string {
	jiraAccountIDMu.Lock()
	defer jiraAccountIDMu.Unlock()

	if jiraAccountIDCache != "" && time.Now().Before(jiraAccountIDExpiry) {
		return jiraAccountIDCache
	}

	config, err := h.loadIntegrationConfig("jira")
	if err != nil {
		return ""
	}
	domain, _ := config["domain"].(string)
	email, _ := config["email"].(string)
	token, _ := config["api_token"].(string)
	if domain == "" || email == "" || token == "" {
		return ""
	}

	req, err := http.NewRequest("GET", fmt.Sprintf("https://%s/rest/api/3/myself", domain), nil)
	if err != nil {
		return ""
	}
	req.SetBasicAuth(email, token)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var user struct {
		AccountID string `json:"accountId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil || user.AccountID == "" {
		return ""
	}

	jiraAccountIDCache = user.AccountID
	jiraAccountIDExpiry = time.Now().Add(1 * time.Hour)
	log.Printf("🔑 Cached Jira account ID: %s", jiraAccountIDCache)
	return jiraAccountIDCache
}
