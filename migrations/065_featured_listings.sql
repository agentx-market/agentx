-- Feature #65: Featured listings for monetization
-- Add featured flag to agents table

ALTER TABLE agents ADD COLUMN featured INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN featured_until INTEGER;

-- Create featured_agents table to track featured slots and payments
CREATE TABLE featured_agents (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  subscription_id TEXT,
  payment_intent_id TEXT,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  price_cents INTEGER DEFAULT 20000,
  status TEXT DEFAULT 'active',
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Create featured_slots table to track available slots
CREATE TABLE featured_slots (
  id INTEGER PRIMARY KEY,
  slot_number INTEGER NOT NULL UNIQUE,
  price_cents INTEGER DEFAULT 20000,
  status TEXT DEFAULT 'available',
  occupied_by_agent_id INTEGER,
  occupied_since INTEGER,
  FOREIGN KEY (occupied_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- Insert default featured slot (10 slots available)
INSERT INTO featured_slots (slot_number, price_cents, status) VALUES
  (1, 20000, 'available'),
  (2, 20000, 'available'),
  (3, 20000, 'available'),
  (4, 20000, 'available'),
  (5, 20000, 'available'),
  (6, 20000, 'available'),
  (7, 20000, 'available'),
  (8, 20000, 'available'),
  (9, 20000, 'available'),
  (10, 20000, 'available');