-- Migration: Add health check and welcome bonus tracking to operators and agents tables
-- Feature #25: Abuse prevention for Lightning rewards

-- Add welcome bonus tracking to operators
ALTER TABLE operators ADD COLUMN welcome_bonus_claimed_at INTEGER;

-- Add health check tracking to agents (create new agents table if needed)
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY,
  operator_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  capabilities TEXT,
  endpoint_url TEXT,
  pricing TEXT,
  status TEXT DEFAULT 'pending',  -- pending, active, suspended
  health_check_passed_at INTEGER,
  health_check_required_by INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

-- If agents table already exists, we need to add columns conditionally
-- Check if status column exists
SELECT CASE 
  WHEN COUNT(*) > 0 
  THEN 'ALTER TABLE agents ADD COLUMN status TEXT DEFAULT "pending"'
  ELSE 'SELECT 1'
END FROM pragma_table_info('agents') WHERE name = 'status';
