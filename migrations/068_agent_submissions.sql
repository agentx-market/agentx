CREATE TABLE IF NOT EXISTS agent_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  description TEXT,
  category_id INTEGER,
  category_name TEXT NOT NULL,
  pricing_model TEXT NOT NULL,
  logo_url TEXT,
  contact_email TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  health_check_url TEXT NOT NULL,
  health_check_status_code INTEGER,
  health_check_checked_at INTEGER,
  auto_approved INTEGER NOT NULL DEFAULT 0,
  agent_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_submissions_status_created
  ON agent_submissions(review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_submissions_contact_email
  ON agent_submissions(contact_email);

CREATE INDEX IF NOT EXISTS idx_agent_submissions_agent_id
  ON agent_submissions(agent_id);
