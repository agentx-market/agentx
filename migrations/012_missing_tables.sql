-- 012_missing_tables.sql
-- Create tables referenced in code but never created via migration.
-- welcome_bonuses: used by POST /api/agents/:id/health-check
-- operator_ip_log: used by lib/ip-tracker.js trackOperatorIp()
-- abuse_alerts: used by lib/ip-tracker.js alertMarcoIpAbuse()

CREATE TABLE IF NOT EXISTS welcome_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  claimed INTEGER DEFAULT 1,
  amount_sats INTEGER DEFAULT 10000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operator_ip_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operator_ip_log_ip ON operator_ip_log(ip_address);

CREATE TABLE IF NOT EXISTS abuse_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
