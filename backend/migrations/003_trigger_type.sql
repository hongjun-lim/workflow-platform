-- Migration: Add trigger_type and cron_schedule to workflows

ALTER TABLE workflows
    ADD COLUMN trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'manual, cron, or webhook',
    ADD COLUMN cron_schedule VARCHAR(100) NULL DEFAULT NULL COMMENT 'cron expression e.g. */5 * * * *',
    ADD COLUMN last_cron_run TIMESTAMP NULL DEFAULT NULL COMMENT 'last time cron triggered this workflow';
