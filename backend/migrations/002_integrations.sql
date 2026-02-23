-- Migration: Add integrations and webhook events tables

-- Store integration credentials (Jira, Slack, etc.)
CREATE TABLE IF NOT EXISTS integrations (
    id VARCHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL COMMENT 'jira or slack',
    name VARCHAR(255) NOT NULL,
    config JSON NOT NULL COMMENT 'encrypted credentials and settings',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_type (type)
);

-- Log all incoming webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(36) PRIMARY KEY,
    source VARCHAR(50) NOT NULL COMMENT 'jira, slack, etc.',
    event_type VARCHAR(100) NOT NULL,
    payload JSON NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    workflow_run_id VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_source (source),
    INDEX idx_processed (processed)
);

-- Update workflows status enum to include 'active'
ALTER TABLE workflows MODIFY COLUMN status ENUM('draft', 'published', 'active') DEFAULT 'draft';
