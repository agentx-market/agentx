-- Migration: 003_payments_table.sql
-- Create payments table to log agent-to-agent transactions

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent_id INTEGER NOT NULL,
  to_agent_id INTEGER NOT NULL,
  amount_sats INTEGER NOT NULL,
  platform_fee_sats INTEGER NOT NULL,
  total_cost INTEGER NOT NULL,  -- amount + fee (paid by sender)
  payment_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, completed, failed
  description TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id),
  FOREIGN KEY (to_agent_id) REFERENCES agents(id)
);

-- Index for querying by agent
CREATE INDEX IF NOT EXISTS idx_payments_from_agent ON payments(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_payments_to_agent ON payments(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
