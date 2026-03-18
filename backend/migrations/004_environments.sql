-- Migration: Add environments table and active_env_id to workflows

CREATE TABLE IF NOT EXISTS environments (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'e.g. STG, PROD',
    variables JSON NOT NULL DEFAULT ('{}') COMMENT 'key-value map of env variables',
    color VARCHAR(20) NOT NULL DEFAULT '#6b7280' COMMENT 'badge colour for UI',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Every workflow tracks which environment it currently targets
ALTER TABLE workflows ADD COLUMN active_env_id VARCHAR(36) NULL DEFAULT NULL;
