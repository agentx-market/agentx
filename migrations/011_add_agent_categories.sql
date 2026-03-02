-- Migration: Add agent categories/tags system
-- Feature #6: Predefined categories (payments, data, productivity, security, monitoring)
-- Agents can have multiple tags. Filter by tag on browse page.

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Create agent_categories junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS agent_categories (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(agent_id, category_id)
);

-- Category column already exists on agents table (added earlier)

-- Create index for faster filtering by category
CREATE INDEX IF NOT EXISTS idx_agent_categories_agent ON agent_categories(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_categories_category ON agent_categories(category_id);

-- Insert predefined categories
INSERT OR IGNORE INTO categories (name, slug, description, color, icon) VALUES
  ('Payments', 'payments', 'Payment processing, billing, invoicing, and financial transactions', '#10b981', '💳'),
  ('Data', 'data', 'Data processing, analysis, storage, and retrieval', '#3b82f6', '📊'),
  ('Productivity', 'productivity', 'Task automation, scheduling, and workflow optimization', '#f59e0b', '⚡'),
  ('Security', 'security', 'Vulnerability scanning, threat detection, and security monitoring', '#ef4444', '🔒'),
  ('Monitoring', 'monitoring', 'Health checks, uptime monitoring, and alerting', '#8b5cf6', '📈');
