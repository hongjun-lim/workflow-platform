package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ==================== Helpers ====================

// loadIntegrationConfig loads the config JSON for a given integration type.
func (h *Handler) loadIntegrationConfig(iType string) (map[string]interface{}, error) {
	var configRaw json.RawMessage
	err := h.db.QueryRow("SELECT config FROM integrations WHERE type = ?", iType).Scan(&configRaw)
	if err != nil {
		return nil, err
	}

	var config map[string]interface{}
	if err := json.Unmarshal(configRaw, &config); err != nil {
		return nil, err
	}
	return config, nil
}

// templateReplace does simple {{key}} replacement from a map.
func templateReplace(tmpl string, data map[string]interface{}) string {
	if data == nil {
		return tmpl
	}
	result := tmpl
	for key, val := range data {
		placeholder := "{{" + key + "}}"
		valStr := fmt.Sprintf("%v", val)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}
	return result
}

// resolveEnvVarsInData replaces {{env.xxx}} placeholders in all string values
// of a node's data map with the corresponding environment variable values.
func resolveEnvVarsInData(data map[string]interface{}, envVars map[string]string) map[string]interface{} {
	if len(envVars) == 0 || data == nil {
		return data
	}
	resolved := make(map[string]interface{}, len(data))
	for k, v := range data {
		switch val := v.(type) {
		case string:
			for envKey, envVal := range envVars {
				val = strings.ReplaceAll(val, "{{env."+envKey+"}}", envVal)
			}
			resolved[k] = val
		default:
			resolved[k] = v
		}
	}
	return resolved
}
