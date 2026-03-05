-- Migration 003: Add health monitoring columns to agents table

-- Add health monitoring columns to agents table
-- Columns already exist from db.js schema, skip if present
-- ALTER TABLE agents ADD COLUMN health_endpoint_url TEXT;
-- ALTER TABLE agents ADD COLUMN health_status TEXT DEFAULT 'offline';
-- ALTER TABLE agents ADD COLUMN last_health_check TEXT;
-- ALTER TABLE agents ADD COLUMN response_time_ms INTEGER;
-- ALTER TABLE agents ADD COLUMN uptime_percent REAL DEFAULT 0;

-- Create agents_health_history table for uptime tracking
CREATE TABLE IF NOT EXISTS agents_health_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  check_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'degraded')),
  response_ms INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Index for faster uptime calculations
CREATE INDEX IF NOT EXISTS idx_health_history_agent ON agents_health_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_health_history_timestamp ON agents_health_history(check_timestamp);
