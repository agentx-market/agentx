-- 015_agent_usage.sql
-- Create agent_usage table referenced by usage-tracker.js and /api/usage endpoints.

CREATE TABLE IF NOT EXISTS agent_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  operator_id INTEGER,
  action TEXT NOT NULL DEFAULT 'invoke',
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON agent_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON agent_usage(created_at);
