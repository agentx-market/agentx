CREATE TABLE IF NOT EXISTS agent_changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id TEXT NOT NULL,
  agent_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_changelog_entries_created_at
  ON agent_changelog_entries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_changelog_entries_agent_id
  ON agent_changelog_entries(agent_id);
