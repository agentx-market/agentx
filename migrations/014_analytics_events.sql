-- 014_analytics_events.sql
-- Create analytics_events table referenced by agent detail page views
-- and /api/my-agents/analytics endpoint.

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'page_view',
  referrer TEXT,
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_agent ON analytics_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
